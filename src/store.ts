import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Club, CustomFormation, Fixture, Formation, GameState, LiveMatch, Player, Position, Tactics, TrainingIntensity } from "./types";
import { shapeOf } from "./types";
import { applyWeeklyGain, RECOVERY } from "./game/training";
import {
  applyContGroupResults, applyCupResults, CONT_STAGES, drawContinental, drawCup,
  groupFixturesForMatchday, leagueWeek, nextContWeek, nextCupWeek, tiesForLeg, weekInfo,
  cupChampion,
} from "./game/cup";
import continentalData from "./data/continental.json";
import { newGame, assignShirtNumbers, playerSalary, processSeasonTransitions } from "./game/seeder";
import { bestXI, createLiveMatch, simulateMinute } from "./game/engine";
import { applyResult, buildLeagueFixtures, initTable, sortTable } from "./game/schedule";
import { mulberry32, pick } from "./game/rng";
import { aiAcceptChance, askingPrice, canNegotiate } from "./game/market";
import { createManagers, processManagerSeason, remapManagerNames, swapUserClub } from "./game/managers";

export interface Settings {
  speed: number; // multiplicador: 0.5, 1, 2, 4
  soundGoal: boolean;
  soundRed: boolean;
}

export const MIN_SQUAD = 18;
export const MAX_SQUAD = 25;

// Rodadas consecutivas no vermelho que a diretoria tolera antes de decretar
// falência e demitir o técnico.
export const BANKRUPTCY_WEEKS = 4;

// Folha salarial semanal do elenco do usuário: descontada do caixa a cada rodada.
export function squadWageBill(g: GameState): number {
  return g.players
    .filter((p) => p.clubId === g.userClubId)
    .reduce((s, p) => s + playerSalary(p), 0);
}

// Receita de bilheteria por jogo em casa: proporcional ao porte do clube (baseBudget).
// Usada como unidade de referência de prêmios (copa, bicho); a renda real de cada
// partida agora vem do público no estádio (stadiumAttendance × ticketPrice).
export function matchdayRevenue(baseBudget: number): number {
  return Math.round(baseBudget * 0.015);
}

// Cota de TV e patrocínio por rodada: receita fixa da divisão, paga jogando em
// casa ou fora. É o que permite a um clube pequeno bancar a folha entre os jogos
// em casa — a bilheteria vira o diferencial, não a única fonte de sobrevivência.
export function tvQuota(division: string): number {
  return division === "Série A" ? 120_000 : 35_000;
}

// Preço médio do ingresso por divisão: multiplica o público para dar a renda do mandante.
export function ticketPrice(division: string): number {
  return division === "Série A" ? 10 : 5;
}

// hash simples e estável de string, para variar o público por clube dentro da mesma semana
function strHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

// Público no estádio do mandante: Série A entre ~30 e 50 mil (clubes maiores lotam
// mais), Série B entre ~5 e 20 mil. Mata-mata (copa/continental) infla o público
// conforme a fase avança, com teto absoluto de 70 mil nos jogos decisivos.
export function stadiumAttendance(g: GameState, homeId: string, week: number): number {
  const home = g.clubs.find((c) => c.id === homeId);
  if (!home) return 20000;
  const peers = g.clubs
    .filter((c) => c.country === home.country && c.division === home.division)
    .sort((a, b) => a.baseBudget - b.baseBudget);
  const power = peers.length > 1 ? peers.findIndex((c) => c.id === homeId) / (peers.length - 1) : 0.5;
  const isA = home.division === "Série A";
  // Série B: 10-25 mil lugares; Série A: 30-70 mil (o gigante lota 70 mil)
  const base = isA ? 30000 + power * 40000 : 10000 + power * 15000;
  const info = weekInfo(week);
  // jogo eliminatório é evento: cada fase adiante enche mais o estádio;
  // fase de grupos da continental é um degrau acima da liga
  const importance =
    info.type === "league" ? 1
    : info.type === "contgroup" ? 1.1
    : 1.15 + info.stage * 0.1;
  const rng = mulberry32((g.seed ^ (week * 2654435761) ^ strHash(homeId)) >>> 0);
  const variation = 0.85 + rng() * 0.3; // ±15% de jogo para jogo
  if (homeId === g.userClubId) {
    // clube do usuário: o estádio tem capacidade fixa (lugares); a ocupação vem
    // da moral da torcida (resultados recentes), não do tamanho da arquibancada
    const cap = stadiumCapacity(g);
    const occupancy = crowdMorale(g);
    return Math.min(cap, Math.round(cap * occupancy * importance * variation));
  }
  return Math.min(70000, Math.round(base * importance * variation));
}

// ── Estádio: capacidade em lugares; comprar arquibancada só adiciona lugares ──
// O custo cresce por nível, proporcional ao porte do clube. Vale a pena quando a
// torcida está lotando o estádio — ocupação é moral, capacidade é investimento.
export const STADIUM_MAX_LEVEL = 5;
export const STADIUM_SEATS_PER_LEVEL = 3000; // lugares adicionados por nível

// Capacidade total do estádio do usuário: base pelo porte do clube na divisão
// + lugares comprados.
export function stadiumCapacity(g: GameState): number {
  const home = g.clubs.find((c) => c.id === g.userClubId);
  if (!home) return 0;
  const peers = g.clubs
    .filter((c) => c.country === home.country && c.division === home.division)
    .sort((a, b) => a.baseBudget - b.baseBudget);
  const power = peers.length > 1 ? peers.findIndex((c) => c.id === home.id) / (peers.length - 1) : 0.5;
  // mesmo piso/teto do público geral: Série B 10-25 mil, Série A 30-70 mil
  const base = home.division === "Série A" ? 30000 + power * 40000 : 10000 + power * 15000;
  return Math.round(base) + (g.stadiumLevel ?? 0) * STADIUM_SEATS_PER_LEVEL;
}

// Retorna a taxa de ocupação do estádio com base na moral do time (torcida):
// Neutra (70%) entre 40% e 60%; melhora gradualmente acima de 60% (até 95%);
// piora gradualmente abaixo de 40% (até 40%).
function crowdMorale(g: GameState): number {
  const morale = g.morale ?? 60;
  if (morale > 60) {
    const pct = (morale - 60) / 35; // 0..1 de 60 a 95
    return 0.70 + 0.25 * pct;
  } else if (morale < 40) {
    const pct = (40 - morale) / 30; // 0..1 de 40 a 10
    return 0.70 - 0.30 * pct;
  } else {
    return 0.70;
  }
}

// Atualiza a moral após a rodada: vitória em casa +6, fora +10; empate em casa -4, fora +2;
// derrota em casa -10, fora -6. Com piso de 10 e teto de 95.
export function nextMorale(current: number, my: number, op: number, isHome: boolean): number {
  let delta = 0;
  if (my > op) {
    delta = isHome ? 6 : 10;
  } else if (my === op) {
    delta = isHome ? -4 : 2;
  } else {
    delta = isHome ? -10 : -6;
  }
  return Math.max(10, Math.min(95, current + delta));
}

export function stadiumUpgradeCost(g: GameState): number {
  const club = g.clubs.find((c) => c.id === g.userClubId);
  const level = g.stadiumLevel ?? 0;
  return Math.round(((club?.baseBudget ?? 5e6) * 0.12 * (level + 1)) / 1e4) * 1e4;
}

// Manchetes da rodada: cobre só a divisão do usuário (o caderno acompanha a
// competição que ele disputa) + lesões do próprio elenco. Goleadas, hat-tricks
// e o resultado do técnico viram notícia; sem dado relevante, sem manchete.
function buildRoundNews(
  g: GameState,
  live: { finished: boolean; homeId: string; awayId: string; homeScore: number; awayScore: number; events: { type: string; playerName?: string }[] }[],
  injured: { name: string; weeks: number }[],
): string[] {
  const user = g.clubs.find((c) => c.id === g.userClubId)!;
  const name = (id: string) => g.clubs.find((c) => c.id === id)?.name ?? "?";
  const divIds = new Set(
    g.clubs.filter((c) => c.country === user.country && c.division === user.division).map((c) => c.id),
  );
  const divMatches = live.filter((m) => m.finished && divIds.has(m.homeId) && divIds.has(m.awayId));
  const news: string[] = [];
  for (const m of divMatches) {
    if (Math.abs(m.homeScore - m.awayScore) >= 3) {
      const winner = m.homeScore > m.awayScore ? m.homeId : m.awayId;
      const loser = winner === m.homeId ? m.awayId : m.homeId;
      news.push(`🔥 ${name(winner)} atropela o ${name(loser)}: ${m.homeScore} a ${m.awayScore}.`);
    }
  }
  for (const m of divMatches) {
    const count = new Map<string, number>();
    for (const e of m.events)
      if (e.type === "goal" && e.playerName) count.set(e.playerName, (count.get(e.playerName) ?? 0) + 1);
    for (const [player, gols] of count)
      if (gols >= 3) news.push(`⚽ ${player} marca ${gols} gols em ${name(m.homeId)} x ${name(m.awayId)}.`);
  }
  for (const i of injured)
    news.push(`🚑 ${i.name} se lesiona e desfalca o ${user.name} por ${i.weeks} rodada${i.weeks > 1 ? "s" : ""}.`);
  return news.slice(0, 6);
}

// Custo do bicho (prêmio de motivação pago durante a partida): uma bilheteria de jogo em casa.
export function bichoCost(baseBudget: number): number {
  return matchdayRevenue(baseBudget);
}

// Níveis de bicho: quanto maior o prêmio, maior a motivação — mas com retorno
// decrescente e teto de +10% no ataque, para o dinheiro não comprar vitória.
export interface BichoLevel { key: string; label: string; costMult: number; pct: number }
export const BICHO_LEVELS: BichoLevel[] = [
  { key: "meio", label: "Meio", costMult: 0.5, pct: 3 },
  { key: "inteiro", label: "Inteiro", costMult: 1, pct: 6 },
  { key: "dobrado", label: "Dobrado", costMult: 2, pct: 10 },
];

// Aporte financeiro de início de temporada: também proporcional ao porte do clube.
export function seasonRevenue(baseBudget: number): number {
  return Math.round(baseBudget * 0.25);
}

// Agressividade tática da IA (0 conservador .. 1 agressivo), derivada da posição do
// clube na tabela: quem está em crise/rebaixamento joga mais para frente e arrisca
// mais cedo; quem está no G4/topo tem mais a perder e joga mais seguro.
export function clubAggression(game: GameState, clubId: string): number {
  const club = game.clubs.find((c) => c.id === clubId);
  if (!club) return 0.5;
  const table = game.tables[club.division];
  if (!table || table.every((r) => r.p === 0)) return 0.5; // sem jogos ainda: neutro
  const sorted = sortTable(table);
  const pos = sorted.findIndex((r) => r.clubId === clubId) + 1;
  if (pos === 0) return 0.5;
  const n = sorted.length;
  const relative = (pos - 1) / (n - 1); // 0 = líder, 1 = lanterna
  return Math.max(0.15, Math.min(0.9, 0.35 + relative * 0.55));
}

interface Store {
  game: GameState | null;
  // entropia sorteada a cada abertura de rodada (não persiste): garante que
  // repetir a mesma rodada — mesmo save, mesma semana — produza um jogo diferente
  matchEntropy: number;
  live: LiveMatch[] | null;
  lastResults: LiveMatch[] | null; // última rodada encerrada, para consulta
  liveDivision: string | null;
  paused: boolean;
  settings: Settings;
  setSettings: (s: Partial<Settings>) => void;
  loadGame: (g: GameState) => void;
  releasePlayer: (id: string) => void;
  startGame: (seed: number, clubId: string, managerName?: string) => void;
  resetGame: () => void;
  startMatchday: () => void;
  tick: () => void;
  setPaused: (p: boolean) => void;
  setStarters: (ids: string[]) => void;
  setSlotOrder: (ids: string[]) => void;
  setPenaltyTaker: (id: string | undefined) => void;
  setPosOverrides: (m: Record<string, Position> | undefined) => void;
  setFormation: (f: Formation, custom?: CustomFormation) => void;
  setCustomFormation: (custom: CustomFormation) => void;
  setDefaultTactics: (t: Partial<Tactics>) => void;
  setPlayerTraining: (id: string, i: TrainingIntensity) => void;
  setAllTraining: (i: TrainingIntensity) => void;
  setPlayerNumber: (id: string, number: number) => void;
  payBicho: (level: BichoLevel) => boolean;
  upgradeStadium: () => boolean;
  sellPlayer: (id: string) => { ok: boolean; amount?: number };
  buyPlayer: (id: string, offer: number) => { ok: boolean; message: string };
  renewContract: (id: string) => { ok: boolean; message: string };
  acceptIncomingOffer: () => void;
  declineIncomingOffer: () => void;
  dismissContractWarning: () => void;
  dismissNews: () => void;
  finishMatchday: (userTieWinnerId?: string) => void;
  skipMatchday: () => void;
  acceptJobOffer: () => void;
  declineJobOffer: () => void;
  promotePlayer: (candidateId: string) => void;
  updateLive: (fn: (matches: LiveMatch[]) => void) => void;
  touchPlayers: (fn: (players: Player[]) => void) => void;
}

export const weekFixtures = (g: GameState, week: number): Fixture[] =>
  g.fixtures.filter((f) => f.week === week && !f.played);

export const nextLeagueWeek = (g: GameState): number | null => {
  const weeks = g.fixtures.filter((f) => !f.played).map((f) => f.week);
  return weeks.length ? Math.min(...weeks) : null;
};

// O confronto de copa do usuário terminou empatado no agregado? (semana de volta,
// jogo encerrado) — nesse caso a classificação é decidida numa disputa de pênaltis
// interativa antes de encerrar a rodada.
export function needsUserShootout(g: GameState, live: LiveMatch[] | null): boolean {
  if (!live || g.fired) return false; // demitido só observa: empate decide na moeda, como os da IA
  const info = weekInfo(g.week);
  if (info.type === "league" || info.type === "contgroup" || info.leg !== 2) return false;
  const knockout = info.type === "cup" ? g.cup : g.continental;
  if (!knockout) return false;
  const m = live.find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
  if (!m || !m.finished) return false;
  const tie = knockout.rounds[info.stage]?.find(
    (t) => t.homeId === g.userClubId || t.awayId === g.userClubId,
  );
  if (!tie || tie.winnerId) return false;
  // mandante da volta é o awayId do confronto
  const aggHome = (tie.g1h ?? 0) + m.awayScore;
  const aggAway = (tie.g1a ?? 0) + m.homeScore;
  return aggHome === aggAway;
}

// O clube do usuário caiu da copa nacional nesta temporada? (perdeu algum
// confronto já decidido, em qualquer fase disputada até agora)
export const isCupEliminated = (g: GameState): boolean => {
  if (!g.cup) return false;
  return g.cup.rounds.some((ties) =>
    ties.some(
      (t) =>
        (t.homeId === g.userClubId || t.awayId === g.userClubId) &&
        t.winnerId != null &&
        t.winnerId !== g.userClubId,
    ),
  );
};

// Próxima semana a disputar, considerando liga, copa e continental intercaladas.
export const nextPlayableWeek = (g: GameState): number | null => {
  const candidates = [
    nextLeagueWeek(g),
    g.cup ? nextCupWeek(g.cup) : null,
    g.continental ? nextContWeek(g.continental) : null,
  ].filter((w): w is number => w !== null);
  return candidates.length ? Math.min(...candidates) : null;
};

// Clube da IA que abriga um jogador saindo do time do usuário (venda ou dispensa):
// entre os clubes com quem a divisão do usuário negocia, prioriza quem tem menos
// jogadores na posição (repõe carência real), desempatando pelo maior orçamento.
// Sorteia entre os 5 mais carentes para o destino não ser sempre o mesmo.
function findBuyerClub(g: GameState, playerId: string): string {
  const player = g.players.find((p) => p.id === playerId);
  const userClub = g.clubs.find((c) => c.id === g.userClubId)!;
  if (!player) return userClub.id;
  const counts = new Map<string, number>();
  for (const p of g.players)
    if (p.pos === player.pos) counts.set(p.clubId, (counts.get(p.clubId) ?? 0) + 1);
  const candidates = g.clubs
    .filter((c) => c.id !== g.userClubId && canNegotiate(c.division, userClub.division))
    .sort(
      (a, b) =>
        (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0) ||
        b.baseBudget - a.baseBudget,
    );
  if (candidates.length === 0) return userClub.id;
  const top = candidates.slice(0, 5);
  return top[Math.floor(Math.random() * top.length)].id;
}

// Luvas de renovação (+2 temporadas): ~20 salários semanais, arredondado.
export function renewalCost(p: Player): number {
  return Math.round((playerSalary(p) * 20) / 1000) * 1000;
}

// Sorteia (ou não) uma proposta de clube da IA por um jogador do usuário ao fim
// da rodada: os melhores jogadores atraem mais interesse, e contratos perto do
// fim rendem propostas menores (o comprador sabe que pode levar de graça depois).
function maybeIncomingOffer(g: GameState): GameState["incomingOffer"] {
  if (g.fired) return undefined;
  const squad = g.players.filter((p) => p.clubId === g.userClubId);
  if (squad.length <= MIN_SQUAD) return undefined;
  if (Math.random() > 0.12) return undefined; // ~1 proposta a cada 8 rodadas
  const userClub = g.clubs.find((c) => c.id === g.userClubId)!;
  const buyers = g.clubs.filter(
    (c) => c.id !== g.userClubId && canNegotiate(c.division, userClub.division),
  );
  if (buyers.length === 0) return undefined;
  // alvo: sorteio pesado pela força ao quadrado — craques no radar
  const weights = squad.map((p) => p.strength * p.strength);
  const total = weights.reduce((s, w) => s + w, 0);
  let roll = Math.random() * total;
  let target = squad[0];
  for (let i = 0; i < squad.length; i++) {
    roll -= weights[i];
    if (roll <= 0) { target = squad[i]; break; }
  }
  const buyer = buyers[Math.floor(Math.random() * buyers.length)];
  const contractFactor = (target.contract ?? 2) <= 1 ? 0.65 : 1;
  const amount =
    Math.round((askingPrice(g, target) * (0.85 + Math.random() * 0.45) * contractFactor) / 1000) * 1000;
  return { clubId: buyer.id, playerId: target.id, amount };
}

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      game: null,
      matchEntropy: (Math.random() * 4294967296) >>> 0,
      live: null,
      lastResults: null,
      liveDivision: null,
      paused: false,
      settings: { speed: 1, soundGoal: true, soundRed: true },

      setSettings: (s) => set({ settings: { ...get().settings, ...s } }),

      loadGame: (g) => set({ game: g, live: null, lastResults: null, liveDivision: null }),

      releasePlayer: (id) => {
        const g = get().game;
        if (!g || g.fired) return;
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        if (squad.length <= MIN_SQUAD) return;
        // dispensado não some do mundo: outro clube o abriga (de graça)
        const dest = findBuyerClub(g, id);
        const players = g.players.map((p) => (p.id === id ? { ...p, clubId: dest } : p));
        let starters = g.starters;
        if (starters.includes(id)) {
          const rest = players.filter((p) => p.clubId === g.userClubId);
          const sub = rest.find((p) => !starters.includes(p.id));
          starters = starters.map((s) => (s === id ? (sub?.id ?? s) : s)).filter((s) => s !== id);
        }
        set({ game: { ...g, players, starters } });
      },

      sellPlayer: (id) => {
        const g = get().game;
        if (!g || g.fired) return { ok: false };
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        if (squad.length <= MIN_SQUAD) return { ok: false };
        const player = squad.find((p) => p.id === id);
        if (!player) return { ok: false };
        const amount = askingPrice(g, player);
        // vendido segue carreira num clube comprador, em vez de ser apagado do jogo
        const dest = findBuyerClub(g, id);
        const players = g.players.map((p) => (p.id === id ? { ...p, clubId: dest } : p));
        let starters = g.starters;
        if (starters.includes(id)) {
          const rest = players.filter((p) => p.clubId === g.userClubId);
          const sub = rest.find((p) => !starters.includes(p.id));
          starters = starters.map((s) => (s === id ? (sub?.id ?? s) : s)).filter((s) => s !== id);
        }
        set({ game: { ...g, players, starters, budget: g.budget + amount } });
        return { ok: true, amount };
      },

      // Renovação de contrato: +2 temporadas (teto 5) mediante luvas proporcionais
      // ao salário do jogador. Sem renovar, contrato que zera no fim da temporada
      // faz o jogador sair de graça.
      renewContract: (id) => {
        const g = get().game;
        if (!g) return { ok: false, message: "Sem jogo ativo." };
        if (g.fired) return { ok: false, message: "Você foi demitido: não comanda mais o clube." };
        const player = g.players.find((p) => p.id === id && p.clubId === g.userClubId);
        if (!player) return { ok: false, message: "Jogador indisponível." };
        if ((player.contract ?? 1) >= 5)
          return { ok: false, message: "Contrato já está no teto de 5 temporadas." };
        const cost = renewalCost(player);
        if (cost > g.budget) return { ok: false, message: "Orçamento insuficiente para as luvas." };
        const players = g.players.map((p) =>
          p.id === id ? { ...p, contract: Math.min(5, (p.contract ?? 1) + 2) } : p,
        );
        set({ game: { ...g, players, budget: g.budget - cost } });
        return {
          ok: true,
          message: `${player.name} renovou por +2 temporadas (luvas de $${(cost / 1e3).toFixed(0)}k).`,
        };
      },

      // Proposta recebida de um clube da IA: aceitar transfere o jogador na hora.
      acceptIncomingOffer: () => {
        const g = get().game;
        const offer = g?.incomingOffer;
        if (!g || !offer || g.fired) return;
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        const player = squad.find((p) => p.id === offer.playerId);
        if (!player || squad.length <= MIN_SQUAD) {
          set({ game: { ...g, incomingOffer: undefined } });
          return;
        }
        const players = g.players.map((p) =>
          p.id === offer.playerId ? { ...p, clubId: offer.clubId } : p,
        );
        let starters = g.starters;
        if (starters.includes(offer.playerId)) {
          const rest = players.filter((p) => p.clubId === g.userClubId);
          const sub = rest.find((p) => !starters.includes(p.id));
          starters = starters
            .map((s) => (s === offer.playerId ? (sub?.id ?? s) : s))
            .filter((s) => s !== offer.playerId);
        }
        set({
          game: {
            ...g, players, starters,
            budget: g.budget + offer.amount,
            incomingOffer: undefined,
          },
        });
      },
      declineIncomingOffer: () => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, incomingOffer: undefined } });
      },

      // Marca o aviso de contratos a vencer como visto nesta temporada.
      dismissContractWarning: () => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, contractWarningSeason: g.season } });
      },

      // Fecha o modal de notícias da rodada (as manchetes só vivem nele).
      dismissNews: () => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, lastNews: undefined } });
      },

      buyPlayer: (id, offer) => {
        const g = get().game;
        if (!g) return { ok: false, message: "Sem jogo ativo." };
        if (g.fired) return { ok: false, message: "Você foi demitido: não comanda mais o clube." };
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        if (squad.length >= MAX_SQUAD)
          return { ok: false, message: `Elenco no limite máximo de ${MAX_SQUAD} jogadores.` };
        const player = g.players.find((p) => p.id === id);
        if (!player || player.clubId === g.userClubId)
          return { ok: false, message: "Jogador indisponível." };
        if (offer > g.budget)
          return { ok: false, message: "Orçamento insuficiente." };
        const chance = aiAcceptChance(g, player, offer);
        if (Math.random() > chance)
          return { ok: false, message: "O clube recusou a proposta." };
        const players = g.players.map((p) =>
          p.id === id ? { ...p, clubId: g.userClubId } : p,
        );
        set({ game: { ...g, players, budget: g.budget - offer } });
        return { ok: true, message: `Negócio fechado! ${player.name} é reforço.` };
      },

      startGame: (seed, clubId, managerName) => {
        const game = newGame(seed, clubId);
        const userClub = game.clubs.find((c) => c.id === clubId)!;
        set({
          game: {
            ...game, managerName,
            budget: game.budget + seasonRevenue(userClub.baseBudget),
            managers: createManagers(seed, game.clubs, clubId, managerName, game.players),
            managerAwards: [],
          },
          live: null,
          lastResults: null,
        });
      },
      resetGame: () => set({ game: null, live: null, lastResults: null, liveDivision: null }),

      startMatchday: () => {
        let g = get().game;
        if (!g) return;
        // temporada anterior toda disputada (liga e copas): aplica acesso e
        // rebaixamento, reconstrói o calendário, sorteia novas copas e credita o
        // aporte da nova temporada
        if (nextPlayableWeek(g) === null) {
          const userClub = g.clubs.find((c) => c.id === g!.userClubId)!;
          const seasonRng = mulberry32((g.seed ^ ((g.season + 1) * 48271)) >>> 0);
          // acesso/rebaixamento: 2 últimos da Série A trocam com os 2 primeiros da B
          const finalA = sortTable(g.tables["Série A"] ?? []);
          const finalB = sortTable(g.tables["Série B"] ?? []);
          const relegated = new Set(finalA.slice(-2).map((r) => r.clubId));
          const promoted = new Set(finalB.slice(0, 2).map((r) => r.clubId));
          const clubs = g.clubs.map((c) =>
            relegated.has(c.id) ? { ...c, division: "Série B" }
            : promoted.has(c.id) ? { ...c, division: "Série A" }
            : c,
          );
          const countryClubs = clubs.filter((c) => c.country === userClub.country);
          // Convite de clube maior: só campanha muito boa credencia o técnico, e
          // mesmo assim depende de sorte — quanto melhor a campanha, maior a chance,
          // mas nunca é garantido. O destino é sorteado entre clubes da Série A com
          // orçamento pelo menos 25% maior que o atual.
          const posA = finalA.findIndex((r) => r.clubId === userClub.id) + 1;
          const posB = finalB.findIndex((r) => r.clubId === userClub.id) + 1;
          const offerChance =
            g.fired ? 0 // demitido não recebe convite: só observa
            : posA === 1 ? 0.6 // campeão da Série A: cobiçado, mas mercado é mercado
            : posA >= 2 && posA <= 4 ? 0.3 // G4 da A chama atenção
            : posB === 1 ? 0.45 // campeão da B: acesso com moral
            : posB === 2 ? 0.25 // vice da B: subiu, mas com menos brilho
            : 0; // campanha comum não gera convite
          const suitors =
            offerChance > 0 && seasonRng() < offerChance
              ? countryClubs.filter(
                  (c) =>
                    c.division === "Série A" &&
                    c.id !== userClub.id &&
                    c.baseBudget > userClub.baseBudget * 1.25,
                )
              : [];
          const jobOffer = suitors.length > 0 ? pick(seasonRng, suitors).id : undefined;
          // ── campeões da temporada: título para os jogadores e técnicos ──
          const champions = [
            finalA[0]?.clubId,
            cupChampion(g.cup),
            g.continental ? cupChampion(g.continental, CONT_STAGES) : undefined,
          ].filter((id): id is string => !!id);
          const championCount = new Map<string, number>();
          for (const id of champions) championCount.set(id, (championCount.get(id) ?? 0) + 1);
          const playersTitled = g.players.map((p) =>
            championCount.has(p.clubId)
              ? { ...p, titles: (p.titles ?? 0) + championCount.get(p.clubId)! }
              : p,
          );
          // clubes campeões também somam títulos no ranking do save
          const clubsTitled = clubs.map((c) =>
            championCount.has(c.id)
              ? { ...c, titles: (c.titles ?? 0) + championCount.get(c.id)! }
              : c,
          );
          // ── técnicos: reputação, títulos, prêmio de Melhor Técnico e carrossel ──
          const mgrRes = processManagerSeason(
            g.seed, g.season,
            g.managers ?? createManagers(g.seed, g.clubs, g.userClubId, g.managerName, g.players),
            g.clubs, g.tables, champions, g.userClubId,
          );
          // ── contratos queimam 1 ano; expirados do usuário saem de graça ──
          const transitions = processSeasonTransitions(seasonRng, playersTitled, clubsTitled, g.userClubId);
          const awardBonus =
            mgrRes.userWonAward && !g.fired
              ? Math.round(seasonRevenue(userClub.baseBudget) * 0.25)
              : 0;
          let leagueChampionBonus = 0;
          if (!g.fired) {
            if (finalA[0]?.clubId === g.userClubId) {
              leagueChampionBonus = Math.round(seasonRevenue(userClub.baseBudget) * 2.5);
            } else if (finalB[0]?.clubId === g.userClubId) {
              leagueChampionBonus = Math.round(seasonRevenue(userClub.baseBudget) * 1.0);
            }
          }
          g = {
            ...g,
            jobOffer,
            clubs: clubsTitled,
            managers: mgrRes.managers,
            managerAwards: [...(g.managerAwards ?? []), mgrRes.award],
            seasonNews: {
              season: g.season + 1,
              bestManager: mgrRes.award.managerName,
              bestManagerClub: mgrRes.award.clubName,
              userWonAward: mgrRes.userWonAward,
              contractLosses: transitions.expiredContracts,
            },
            incomingOffer: undefined,
            season: g.season + 1,
            week: 1,
            // divisões mudaram: novo sorteio de confrontos da liga
            fixtures: buildLeagueFixtures(seasonRng, countryClubs),
            tables: Object.fromEntries(
              ["Série A", "Série B"].map((div) => [
                div, initTable(countryClubs.filter((c) => c.division === div)),
              ]),
            ),
            // clube falido não recebe aporte: o caixa fica congelado onde parou
            // (prêmio de Melhor Técnico rende um bônus extra da diretoria)
            budget: g.fired ? g.budget : g.budget + seasonRevenue(userClub.baseBudget) + awardBonus + leagueChampionBonus,
            players: transitions.updatedPlayers,
            pendingPromotions:
              transitions.pendingPromotions.length > 0 ? transitions.pendingPromotions : undefined,
            retiredLastSeason:
              transitions.retiredLastSeason.length > 0 ? transitions.retiredLastSeason : undefined,
            cup: drawCup(
              seasonRng,
              countryClubs.filter((c) => c.division === "Série A").map((c) => c.id),
              countryClubs.filter((c) => c.division === "Série B").map((c) => c.id),
            ),
            continental: drawContinental(
              mulberry32((g.seed ^ ((g.season + 1) * 79087)) >>> 0),
              clubs, g.userClubId,
              continentalData as unknown as Record<string, Record<string, string[]>>,
              // classificados: os 4 primeiros da Série A na tabela final da temporada,
              // mas o campeão da Copa Nacional (se for do mesmo país) tem vaga garantida
              // (substituindo o 4º colocado se não estiver no top 4)
              (() => {
                const top4 = finalA.slice(0, 4).map((r) => r.clubId);
                const cupChamp = cupChampion(g!.cup);
                if (cupChamp) {
                  const champClub = clubs.find((c) => c.id === cupChamp);
                  if (champClub && champClub.country === userClub.country) {
                    if (!top4.includes(cupChamp) && top4.length >= 4) {
                      top4[3] = cupChamp;
                    }
                  }
                }
                return top4;
              })(),
            ),
          };
          set({ game: g });
          return;
        }
        const week = nextPlayableWeek(g);
        if (week === null) return;
        if (g.week !== week) set({ game: { ...g, week } });
        const userClub = g.clubs.find((c) => c.id === g!.userClubId)!;
        const info = weekInfo(week);
        // semana de copa/continental: confrontos da perna atual; grupos da
        // continental: jogos da rodada de grupos; liga: jogos da rodada
        const pairs: { homeId: string; awayId: string }[] =
          info.type === "cup" && g.cup
            ? tiesForLeg(g.cup, info.stage, info.leg)
            : info.type === "contgroup" && g.continental
              ? groupFixturesForMatchday(g.continental, info.matchday)
              : info.type === "continental" && g.continental
                ? tiesForLeg(g.continental, info.stage, info.leg)
                : weekFixtures(g, week);
        // o jogo do usuário primeiro; depois os da divisão dele
        const divOrder = (f: { homeId: string; awayId: string }) => {
          if (f.homeId === g!.userClubId || f.awayId === g!.userClubId) return -1;
          const div = g!.clubs.find((c) => c.id === f.homeId)!.division;
          return div === userClub.division ? 0 : 1;
        };
        const sorted = [...pairs].sort((a, b) => divOrder(a) - divOrder(b));
        const matchCompetition = info.type === "league" ? "league"
          : (info.type === "continental" || info.type === "contgroup") ? "continental"
          : "cup";
        // técnico demitido não comanda: o ex-clube entra em campo escalado pela IA
        const isUserTeam = (id: string) => id === g!.userClubId && !g!.fired;
        const live = sorted.map((f) =>
          createLiveMatch(
            f.homeId, f.awayId,
            g.players.filter((p) => p.clubId === f.homeId),
            g.players.filter((p) => p.clubId === f.awayId),
            isUserTeam(f.homeId) ? g.starters : undefined,
            isUserTeam(f.awayId) ? g.starters : undefined,
            isUserTeam(f.homeId) ? g.defaultTactics : undefined,
            isUserTeam(f.awayId) ? g.defaultTactics : undefined,
            clubAggression(g, f.homeId),
            clubAggression(g, f.awayId),
            isUserTeam(f.homeId) ? g.slotOrder : undefined,
            isUserTeam(f.awayId) ? g.slotOrder : undefined,
            matchCompetition,
            isUserTeam(f.homeId) ? g.formation : undefined,
            isUserTeam(f.awayId) ? g.formation : undefined,
            isUserTeam(f.homeId) ? g.customFormation : undefined,
            isUserTeam(f.awayId) ? g.customFormation : undefined,
            isUserTeam(f.homeId) ? (g.morale ?? 60) / 100 : undefined,
            isUserTeam(f.awayId) ? (g.morale ?? 60) / 100 : undefined,
            isUserTeam(f.homeId) ? g.posOverrides : undefined,
            isUserTeam(f.awayId) ? g.posOverrides : undefined,
            isUserTeam(f.homeId) ? g.penaltyTakerId : undefined,
            isUserTeam(f.awayId) ? g.penaltyTakerId : undefined,
          ),
        );
        // público de cada estádio definido na abertura da rodada (e exibido nela)
        for (const m of live) m.attendance = stadiumAttendance(g, m.homeId, week);
        set({
          live, lastResults: null, liveDivision: null, paused: false,
          // entropia nova a cada rodada aberta: repetir o mesmo cenário dá outro jogo
          matchEntropy: (Math.random() * 4294967296) >>> 0,
        });
      },

      tick: () => {
        const { game, live, paused, matchEntropy } = get();
        if (!game || !live || paused) return;
        // mistura a entropia da rodada: o mesmo save na mesma semana nunca repete o jogo
        const rng = mulberry32(
          (game.seed ^ matchEntropy ^ (game.week * 7919) ^ ((live[0]?.minute ?? 0) * 104729)) >>> 0,
        );
        const idx = Object.fromEntries(game.players.map((p) => [p.id, p]));
        const next = live.map((m) => {
          const copy: LiveMatch = JSON.parse(JSON.stringify(m));
          const userSide = game.fired ? null
            : copy.homeId === game.userClubId ? "home"
            : copy.awayId === game.userClubId ? "away"
            : null;
          simulateMinute(rng, copy, idx, userSide as any);
          return copy;
        });
        // gols/cartões são gravados no idx (players clonados por referência do game)
        set({ live: next, game: { ...game, players: [...game.players] } });
      },

      setPaused: (p) => set({ paused: p }),

      // titular escalado fora da posição natural (MEI no ataque etc.); undefined limpa tudo
      setPosOverrides: (m) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, posOverrides: m && Object.keys(m).length ? m : undefined } });
      },

      setStarters: (ids) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, starters: ids, slotOrder: undefined } });
      },

      setSlotOrder: (ids) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, slotOrder: ids } });
      },

      // cobrador de pênalti designado na prancheta (undefined volta ao automático)
      setPenaltyTaker: (id) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, penaltyTakerId: id } });
      },

      // paga o bicho na prancheta pré-jogo: desconta do orçamento na hora e o time entra
      // motivado na próxima partida. Irreversível — reseta ao encerrar a rodada.
      // Pular a rodada: simula todos os jogos de uma vez, sem acompanhar ao vivo.
      // Pensado para rodadas sem o time do usuário (fases de copa, por exemplo).
      skipMatchday: () => {
        get().startMatchday();
        if (!get().live) return;
        // avança minuto a minuto até todos os jogos terminarem (com trava de segurança)
        let guard = 0;
        while (get().live?.some((m) => !m.finished) && guard++ < 200) get().tick();
        get().finishMatchday();
      },

      // Aceitar o convite troca de clube: o técnico assume o novo time com o caixa
      // do novo clube (base + aporte de temporada) e escalação inicial do novo elenco.
      acceptJobOffer: () => {
        const g = get().game;
        if (!g?.jobOffer || g.fired) return;
        const club = g.clubs.find((c) => c.id === g.jobOffer);
        if (!club) { set({ game: { ...g, jobOffer: undefined } }); return; }
        const squad = g.players.filter((p) => p.clubId === club.id);
        set({
          game: {
            ...g,
            userClubId: club.id,
            budget: club.baseBudget + seasonRevenue(club.baseBudget),
            starters: bestXI(squad, "4-4-2"),
            slotOrder: undefined,
            formation: "4-4-2",
            jobOffer: undefined,
            incomingOffer: undefined,
            // troca de cadeiras: o técnico deslocado do novo clube herda o antigo
            managers: g.managers
              ? swapUserClub(g.managers, g.userClubId, club.id)
              : g.managers,
          },
        });
      },
      declineJobOffer: () => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, jobOffer: undefined } });
      },
      promotePlayer: (candidateId) => {
        const g = get().game;
        if (!g || !g.pendingPromotions || g.pendingPromotions.length === 0) return;

        const currentPromotion = g.pendingPromotions[0];
        const selectedPlayer = currentPromotion.options.find((p) => p.id === candidateId);
        if (!selectedPlayer) return;

        const clubPlayers = g.players.filter((p) => p.clubId === g.userClubId);
        let maxIdNum = 0;
        for (const p of clubPlayers) {
          const match = p.id.match(/_p(\d+)$/);
          if (match) {
            const val = parseInt(match[1], 10);
            if (val > maxIdNum) maxIdNum = val;
          }
        }

        const newPlayer = {
          ...selectedPlayer,
          id: `${g.userClubId}_p${maxIdNum + 1}`,
        };

        const updatedPlayers = [...g.players, newPlayer];
        const updatedPromotions = g.pendingPromotions.slice(1);

        const updatedSquad = updatedPlayers.filter((p) => p.clubId === g.userClubId);
        assignShirtNumbers(updatedSquad);

        set({
          game: {
            ...g,
            players: updatedPlayers,
            pendingPromotions: updatedPromotions.length > 0 ? updatedPromotions : undefined,
          },
        });
      },

      // Comprar arquibancada: débito à vista, +8% de público em todos os jogos
      // em casa dali em diante. Nível máximo 5 (+40%).
      upgradeStadium: () => {
        const g = get().game;
        if (!g || g.fired) return false;
        const level = g.stadiumLevel ?? 0;
        const cost = stadiumUpgradeCost(g);
        if (level >= STADIUM_MAX_LEVEL || g.budget < cost) return false;
        set({ game: { ...g, budget: g.budget - cost, stadiumLevel: level + 1 } });
        return true;
      },

      payBicho: (level) => {
        const g = get().game;
        if (!g || g.fired || g.defaultTactics.bicho) return false; // já pago para a próxima partida
        const userClub = g.clubs.find((c) => c.id === g.userClubId)!;
        const cost = Math.round(bichoCost(userClub.baseBudget) * level.costMult);
        if (g.budget < cost) return false;
        set({
          game: {
            ...g,
            budget: g.budget - cost,
            pendingBicho: cost,
            defaultTactics: { ...g.defaultTactics, bicho: true, bichoPct: level.pct },
          },
        });
        return true;
      },

      setPlayerTraining: (id, i) => {
        const g = get().game;
        if (!g) return;
        const players = g.players.map((p) => (p.id === id ? { ...p, training: i } : p));
        set({ game: { ...g, players } });
      },

      // regime em massa: aplica a mesma intensidade a todo o elenco do usuário
      setAllTraining: (i) => {
        const g = get().game;
        if (!g) return;
        const players = g.players.map((p) => (p.clubId === g.userClubId ? { ...p, training: i } : p));
        set({ game: { ...g, players } });
      },

      setPlayerNumber: (id, number) => {
        const g = get().game;
        if (!g) return;
        const clubId = g.players.find((p) => p.id === id)?.clubId;
        // troca de número dentro do mesmo elenco: quem já usava o número escolhido
        // assume o número antigo do jogador editado (nunca duplica no time)
        const target = g.players.find((p) => p.id === id);
        if (!target) return;
        const swapWith = g.players.find((p) => p.clubId === clubId && p.number === number && p.id !== id);
        const players = g.players.map((p) => {
          if (p.id === id) return { ...p, number };
          if (swapWith && p.id === swapWith.id) return { ...p, number: target.number };
          return p;
        });
        set({ game: { ...g, players } });
      },

      setDefaultTactics: (t) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, defaultTactics: { ...g.defaultTactics, ...t } } });
      },

      setFormation: (formation, custom) => {
        const g = get().game;
        if (!g) return;
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        const shape = shapeOf(formation, custom ?? g.customFormation);
        const byPos = (pos: Player["pos"]) =>
          g.starters
            .map((id) => squad.find((p) => p.id === id))
            .filter((p): p is Player => !!p && p.pos === pos);
        const need = { GOL: 1, DEF: shape.DEF, MEI: shape.MEI, ATA: shape.ATA } as const;
        const kept = new Set<string>();
        (["GOL", "DEF", "MEI", "ATA"] as const).forEach((pos) => {
          byPos(pos).slice(0, need[pos]).forEach((p) => kept.add(p.id));
        });
        // completa vagas restantes com os melhores disponíveis por posição
        (["GOL", "DEF", "MEI", "ATA"] as const).forEach((pos) => {
          const missing = need[pos] - [...kept].filter((id) => squad.find((p) => p.id === id)?.pos === pos).length;
          if (missing <= 0) return;
          const candidates = squad
            .filter((p) => p.pos === pos && !kept.has(p.id))
            .sort((a, b) => b.strength - a.strength)
            .slice(0, missing);
          candidates.forEach((p) => kept.add(p.id));
        });
        // elenco curto pode não ter reservas suficientes numa posição da nova
        // formação (ex.: só 4 meias disponíveis para um 3-5-2 que pede 5): nesse
        // caso preenche as vagas restantes com o melhor disponível de qualquer
        // posição de linha, para nunca devolver um time com menos de 11.
        if (kept.size < Math.min(11, squad.length)) {
          const rest = squad
            .filter((p) => !kept.has(p.id))
            .sort((a, b) => b.strength - a.strength);
          for (const p of rest) {
            if (kept.size >= Math.min(11, squad.length)) break;
            kept.add(p.id);
          }
        }
        set({
          game: {
            ...g, formation, starters: [...kept], slotOrder: undefined,
            customFormation: custom ?? g.customFormation,
          },
        });
      },

      setCustomFormation: (custom) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, customFormation: custom } });
      },

      updateLive: (fn) => {
        const { live } = get();
        if (!live) return;
        const copy = live.map((m) => JSON.parse(JSON.stringify(m)) as LiveMatch);
        fn(copy);
        set({ live: copy });
      },

      touchPlayers: (fn) => {
        const g = get().game;
        if (!g) return;
        const players = g.players.map((p) => ({ ...p }));
        fn(players);
        set({ game: { ...g, players } });
      },

      finishMatchday: (userTieWinnerId) => {
        const { game, live, liveDivision } = get();
        if (!game || !live) return;
        const info = weekInfo(game.week);
        const isContinental = info.type === "continental" && !!game.continental;
        const isContGroup = info.type === "contgroup" && !!game.continental;
        const isCup = (info.type === "cup" && !!game.cup) || isContinental || isContGroup;
        let fixtures = game.fixtures;
        let tables = game.tables;
        let cup = game.cup;
        let continental = game.continental;
        let cupPrize = 0;
        if (isContGroup && info.type === "contgroup") {
          // fase de grupos da continental: grava os placares; a última rodada
          // fecha os grupos e sorteia as oitavas automaticamente
          const cont = JSON.parse(JSON.stringify(game.continental)) as NonNullable<typeof game.continental>;
          continental = cont;
          applyContGroupResults(
            cont,
            info.matchday,
            live.map((m) => ({
              homeId: m.homeId, awayId: m.awayId,
              homeScore: m.homeScore, awayScore: m.awayScore,
            })),
          );
          // vitória em jogo de grupo rende um prêmio de uma bilheteria de referência
          const userClubG = game.clubs.find((c) => c.id === game.userClubId)!;
          const userMatchG = live.find(
            (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
          );
          if (userMatchG) {
            const my = userMatchG.homeId === game.userClubId ? userMatchG.homeScore : userMatchG.awayScore;
            const opp = userMatchG.homeId === game.userClubId ? userMatchG.awayScore : userMatchG.homeScore;
            if (my > opp) cupPrize += matchdayRevenue(userClubG.baseBudget);
          }
        } else if (isCup && (info.type === "cup" || info.type === "continental")) {
          // grava os placares no mata-mata (copa ou continental); ao fechar a volta
          // define classificados (pênaltis em agregado empatado) e sorteia a fase seguinte
          const knockout = JSON.parse(
            JSON.stringify(isContinental ? game.continental : game.cup),
          ) as typeof game.cup;
          if (isContinental) continental = knockout;
          else cup = knockout;
          const totalStages = isContinental ? CONT_STAGES : undefined;
          const ties = tiesForLeg(knockout, info.stage, info.leg);
          const results = ties.flatMap((t) => {
            const m = live.find((x) => x.homeId === t.homeId && x.awayId === t.awayId);
            return m ? [{ tieIndex: t.tieIndex, homeScore: m.homeScore, awayScore: m.awayScore }] : [];
          });
          const rng = mulberry32((game.seed ^ get().matchEntropy ^ (game.week * 15485863)) >>> 0);
          // vencedor da disputa de pênaltis interativa (empate no agregado do usuário)
          const decided = userTieWinnerId
            ? knockout.rounds[info.stage]
                .map((t, i) => ({ t, i }))
                .filter(({ t }) => t.homeId === game.userClubId || t.awayId === game.userClubId)
                .map(({ i }) => ({ tieIndex: i, winnerId: userTieWinnerId }))
            : undefined;
          applyCupResults(rng, knockout, info.stage, info.leg, results, decided, totalStages);
          const userClub2 = game.clubs.find((c) => c.id === game.userClubId)!;
          const gate = matchdayRevenue(userClub2.baseBudget);
          // premiação por jogo: vencer uma partida de mata-mata rende mais que um jogo normal
          const userMatch = live.find(
            (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
          );
          if (userMatch) {
            const myScore = userMatch.homeId === game.userClubId ? userMatch.homeScore : userMatch.awayScore;
            const oppScore = userMatch.homeId === game.userClubId ? userMatch.awayScore : userMatch.homeScore;
            if (myScore > oppScore) cupPrize += Math.round(gate * (isContinental ? 2 : 1.5));
          }
          // premiação por chaveamento: avançar de fase paga forte e escala até a final
          if (info.leg === 2) {
            const userTie = knockout.rounds[info.stage].find(
              (t) => t.homeId === game.userClubId || t.awayId === game.userClubId,
            );
            if (userTie?.winnerId === game.userClubId) {
              if (isContinental) {
                // oitavas, quartas, semi: prêmios continentais são os mais gordos do jogo
                const STAGE_PRIZE = [10, 15, 25];
                cupPrize +=
                  info.stage === CONT_STAGES - 1
                    ? seasonRevenue(userClub2.baseBudget) * 3 // campeão continental
                    : gate * STAGE_PRIZE[info.stage];
              } else {
                // preliminar, 32, oitavas, quartas, semi: multiplicador crescente da bilheteria
                const STAGE_PRIZE = [3, 5, 8, 12, 20];
                cupPrize +=
                  info.stage === 5
                    ? seasonRevenue(userClub2.baseBudget) * 2 // campeão da copa
                    : gate * STAGE_PRIZE[info.stage];
              }
            }
          }
        } else {
          fixtures = game.fixtures.map((f) => {
            const m = live.find(
              (x) => x.homeId === f.homeId && x.awayId === f.awayId && f.week === game.week,
            );
            if (!m || f.played) return f;
            return { ...f, played: true, homeScore: m.homeScore, awayScore: m.awayScore };
          });
          // aplica cada resultado na tabela da divisão do mandante
          tables = Object.fromEntries(
            Object.entries(game.tables).map(([div, rows]) => [
              div,
              rows.map((r) => ({ ...r })),
            ]),
          );
          for (const m of live) {
            const div = game.clubs.find((c) => c.id === m.homeId)!.division;
            if (tables[div])
              applyResult(tables[div], m.homeId, m.awayId, m.homeScore, m.awayScore);
          }
        }
        // energia pós-jogo: quem jogou termina cansado; recupera 60% da diferença até
        // 100 na semana livre (regeneração assintótica — quem está mais exausto
        // recupera mais em valor absoluto, mas ninguém volta sempre "cheio" de um só golpe)
        const played = new Map<string, number>();
        const enteredField = new Set<string>();
        for (const m of live)
          for (const lp of [...m.homeLineup, ...m.awayLineup]) {
            played.set(lp.playerId, lp.energy);
            if (lp.onField || lp.subbedOut || lp.sentOff) enteredField.add(lp.playerId);
          }
        // quem estava suspenso NESTA competição cumpriu a pena na rodada (ficou de
        // fora do XI): libera só o campo da competição que acabou de rolar.
        const isLeague = info.type === "league";
        const isCupNac = info.type === "cup";
        const isCont = info.type === "continental" || info.type === "contgroup";

        const suspendedIds = new Set(
          game.players
            .filter((p) => (
              isLeague ? p.suspendedLeague :
              isCupNac ? p.suspendedCup :
              p.suspendedContinental
            ))
            .map((p) => p.id),
        );
        // lesões: rolagem determinística pós-rodada para quem entrou em campo —
        // ~3% base, mais provável para veteranos (30+) e com desconto para Raçudo;
        // quem já estava lesionado cumpre uma rodada de recuperação
        const injuryRng = mulberry32((game.seed ^ (game.week * 15485863)) >>> 0);
        const newlyInjured: { name: string; weeks: number }[] = [];
        const players = game.players.map((p) => {
          // regime individual do jogador afeta ganho de XP e recuperação; IA treina em regime normal
          const intensity: TrainingIntensity =
            p.clubId === game.userClubId ? (p.training ?? "normal") : "normal";
          const base = played.get(p.id) ?? p.energy;
          const recovered = base + (100 - base) * RECOVERY[intensity];
          let injuryWeeks = p.injuryWeeks ?? 0;
          if (injuryWeeks > 0) {
            injuryWeeks -= 1;
          } else if (enteredField.has(p.id)) {
            const pInjury =
              (0.03 + Math.max(0, p.age - 30) * 0.005) * (p.traits.includes("Raçudo") ? 0.5 : 1);
            if (injuryRng() < pInjury) {
              injuryWeeks = 1 + Math.floor(injuryRng() * 4); // 1 a 4 rodadas fora
              if (p.clubId === game.userClubId) newlyInjured.push({ name: p.name, weeks: injuryWeeks });
            }
          }
          const next = {
            ...p,
            energy: Math.min(100, Math.round(recovered)),
            apps: (p.apps ?? 0) + (enteredField.has(p.id) ? 1 : 0),
            injuryWeeks,
            suspendedLeague: isLeague && suspendedIds.has(p.id) ? false : p.suspendedLeague,
            suspendedCup: isCupNac && suspendedIds.has(p.id) ? false : p.suspendedCup,
            suspendedContinental: isCont && suspendedIds.has(p.id) ? false : p.suspendedContinental,
          };
          // evolução semanal: jogar rende muito mais XP; reservas evoluem só pelo treino
          applyWeeklyGain(next, enteredField.has(p.id), intensity);
          return next;
        });
        // receita de bilheteria: só quando o clube do usuário jogou em casa nessa
        // rodada — a renda é o público real do estádio × preço do ingresso da divisão
        const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
        const userHomeMatch = live.find((m) => m.homeId === game.userClubId);
        const attendance = !game.fired && userHomeMatch
          ? (userHomeMatch.attendance ?? stadiumAttendance(game, game.userClubId, game.week))
          : 0;
        const revenue = attendance * ticketPrice(userClub.division);
        // cota de TV/patrocínio: entra toda rodada, jogando em casa ou fora
        const tv = game.fired ? 0 : tvQuota(userClub.division);
        // folha salarial: paga toda rodada, jogando em casa ou fora. Demitido não
        // administra mais nada — receitas, prêmios e folha deixam de existir para ele.
        const wages = game.fired ? 0 : squadWageBill(game);
        const prize = game.fired ? 0 : cupPrize;
        const budget = game.budget + revenue + tv + prize - wages;
        // caixa negativo acumula semanas de dívida; a diretoria tolera até
        // BANKRUPTCY_WEEKS rodadas no vermelho antes de decretar falência e demitir
        const debtWeeks = game.fired ? game.debtWeeks : budget < 0 ? (game.debtWeeks ?? 0) + 1 : 0;
        const fired = game.fired || (debtWeeks ?? 0) >= BANKRUPTCY_WEEKS;
        // moral do time: reage ao resultado do usuário na rodada
        const userMatchM = live.find(
          (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
        );
        const morale = !game.fired && userMatchM
          ? nextMorale(
              game.morale ?? 60,
              userMatchM.homeId === game.userClubId ? userMatchM.homeScore : userMatchM.awayScore,
              userMatchM.homeId === game.userClubId ? userMatchM.awayScore : userMatchM.homeScore,
              userMatchM.homeId === game.userClubId,
            )
          : (game.morale ?? 60);
        // vitórias da rodada por técnico: acumuladas por divisão do clube na hora
        // da vitória (Série A pesa mais que B no ranking de técnicos)
        const managers = game.managers?.map((m) => {
          if (!m.clubId) return m;
          const wins = live.filter(
            (x) =>
              x.finished &&
              ((x.homeId === m.clubId && x.homeScore > x.awayScore) ||
                (x.awayId === m.clubId && x.awayScore > x.homeScore)),
          ).length;
          if (wins === 0) return m;
          const div = game.clubs.find((c) => c.id === m.clubId)?.division;
          return div === "Série A"
            ? { ...m, winsA: (m.winsA ?? 0) + wins, seasonWinsA: (m.seasonWinsA ?? 0) + wins }
            : { ...m, winsB: (m.winsB ?? 0) + wins, seasonWinsB: (m.seasonWinsB ?? 0) + wins };
        });
        // Auto-replace injured starters with healthy reserves
        let starters = game.starters ? [...game.starters] : [];
        let slotOrder = game.slotOrder ? [...game.slotOrder] : undefined;
        const posOverrides = game.posOverrides ? { ...game.posOverrides } : undefined;
        const userClubId = game.userClubId;

        const getHealthyReserves = (pos?: string, excludeIds: string[] = []) => {
          return players.filter((p) => 
            p.clubId === userClubId &&
            !starters.includes(p.id) &&
            !excludeIds.includes(p.id) &&
            !((p.injuryWeeks ?? 0) > 0) &&
            (pos ? p.pos === pos : true)
          ).sort((a, b) => b.strength - a.strength);
        };

        const replacedStarters = new Set<string>();
        starters = starters.map((sId) => {
          const p = players.find((x) => x.id === sId);
          if (p && (p.injuryWeeks ?? 0) > 0) {
            const samePos = getHealthyReserves(p.pos, Array.from(replacedStarters));
            if (samePos.length > 0) {
              const rep = samePos[0];
              replacedStarters.add(rep.id);
              if (slotOrder) {
                const idx = slotOrder.indexOf(sId);
                if (idx !== -1) slotOrder[idx] = rep.id;
              }
              if (posOverrides && posOverrides[sId]) {
                posOverrides[rep.id] = posOverrides[sId];
                delete posOverrides[sId];
              }
              return rep.id;
            }
            const anyPos = getHealthyReserves(undefined, Array.from(replacedStarters));
            if (anyPos.length > 0) {
              const rep = anyPos[0];
              replacedStarters.add(rep.id);
              if (slotOrder) {
                const idx = slotOrder.indexOf(sId);
                if (idx !== -1) slotOrder[idx] = rep.id;
              }
              if (posOverrides && posOverrides[sId]) {
                posOverrides[rep.id] = posOverrides[sId];
                delete posOverrides[sId];
              }
              return rep.id;
            }
          }
          return sId;
        });

        set({
          game: {
            ...game, fixtures, tables, players, cup, continental, managers, morale,
            prevMorale: game.morale ?? 60,
            week: game.week + 1,
            budget,
            debtWeeks,
            fired,
            starters,
            slotOrder,
            posOverrides,
            jobOffer: fired ? undefined : game.jobOffer,
            // proposta antiga expira ao fim da rodada; nova pode chegar no lugar
            incomingOffer: fired ? undefined : maybeIncomingOffer(game),
            // balanço da rodada para a tela do clube: bilheteria, prêmios, folha e o bicho pago
            lastFinance: { revenue, tv, prize, wages, attendance, bicho: game.pendingBicho ?? 0 },
            lastNews: buildRoundNews(game, live, newlyInjured),
            pendingBicho: undefined,
            // bicho vale só para a partida da rodada: pago, consumido, resetado
            defaultTactics: { ...game.defaultTactics, bicho: false, bichoPct: undefined },
          },
          live: null,
          lastResults: live,
          liveDivision: null,
        });
      },
    }),
    {
      name: "retro-manager-save",
      version: 11,
      // saves antigos: preenche campos de treinamento/pé/número/suspensão e encaixa a copa no calendário
      migrate: (state: any, version?: number) => {
        const g = state?.game;
        if (g) {
          g.players = g.players.map((p: any) => ({
            ...p, xp: p.xp ?? 0, gained: p.gained ?? 0,
            training: p.training ?? g.trainingIntensity ?? "normal",
            foot: p.foot ?? (Math.random() < 0.25 ? "canhoto" : "destro"),
            // 'suspended' antigo virou suspensão por competição
            suspendedLeague: p.suspendedLeague ?? p.suspended ?? false,
            suspendedCup: p.suspendedCup ?? false,
            number: p.number ?? 0,
            // v9: contratos com prazo e contagem de títulos
            contract: p.contract ?? 1 + Math.floor(Math.random() * 4),
            titles: p.titles ?? 0,
          }));
          // v9: ecossistema de técnicos para saves antigos
          if (!g.managers) {
            g.managers = createManagers(g.seed, g.clubs, g.userClubId, g.managerName, g.players);
            g.managerAwards = g.managerAwards ?? [];
          } else if ((version ?? 0) < 11) {
            // v10/v11: troca nomes genéricos por técnicos reais (BR) / nomes do elenco
            g.managers = remapManagerNames(g.seed, g.managers, g.clubs, g.players);
          }
          delete g.trainingIntensity;
          // numeração de camisa: atribui por clube para quem ainda não tem
          if (g.players.some((p: Player) => !p.number)) {
            for (const club of g.clubs as { id: string }[]) {
              const squad = (g.players as Player[]).filter((p) => p.clubId === club.id);
              if (squad.some((p) => !p.number)) assignShirtNumbers(squad);
            }
          }
          if (!g.cup) {
            const userClub = g.clubs.find((c: any) => c.id === g.userClubId);
            g.cup = drawCup(
              mulberry32((g.seed ^ (g.season * 48271)) >>> 0),
              g.clubs.filter((c: any) => c.country === userClub.country && c.division === "Série A").map((c: any) => c.id),
              g.clubs.filter((c: any) => c.country === userClub.country && c.division === "Série B").map((c: any) => c.id),
            );
          }
          // copa continental entrou no calendário: sorteia para saves antigos
          if (!g.continental) {
            const userClub2 = g.clubs.find((c: any) => c.id === g.userClubId);
            const serieA = (g.clubs as Club[]).filter(
              (c: any) => c.country === userClub2.country && c.division === "Série A",
            );
            const table = g.tables?.["Série A"] ?? [];
            // save em andamento: usa a classificação atual; sem jogos, o orçamento
            const top4 = table.some((r: any) => r.p > 0)
              ? sortTable(table).slice(0, 4).map((r: any) => r.clubId)
              : serieA.sort((a, b) => b.baseBudget - a.baseBudget).slice(0, 4).map((c) => c.id);
            g.continental = drawContinental(
              mulberry32((g.seed ^ (g.season * 79087)) >>> 0),
              g.clubs, g.userClubId,
              continentalData as unknown as Record<string, Record<string, string[]>>,
              top4,
            );
          }
          // reancora as rodadas da liga no calendário intercalado atual (idempotente:
          // a semana é sempre derivada da rodada) e reposiciona o ponteiro da semana
          g.fixtures = g.fixtures.map((f: Fixture) => ({ ...f, week: leagueWeek(f.round) }));
          const unplayed = g.fixtures.filter((f: Fixture) => !f.played).map((f: Fixture) => f.week);
          if (unplayed.length) g.week = Math.min(...unplayed);
        }
        return state;
      },
      partialize: (s) => ({ game: s.game, settings: s.settings }),
    },
  ),
);
