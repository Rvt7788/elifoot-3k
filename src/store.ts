import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Club, CustomFormation, Fixture, Formation, GameState, LiveMatch, Player, Tactics, TrainingIntensity } from "./types";
import { shapeOf } from "./types";
import { applyWeeklyGain, RECOVERY } from "./game/training";
import {
  applyContGroupResults, applyCupResults, CONT_STAGES, drawContinental, drawCup,
  groupFixturesForMatchday, leagueWeek, nextContWeek, nextCupWeek, tiesForLeg, weekInfo,
} from "./game/cup";
import continentalData from "./data/continental.json";
import { newGame, assignShirtNumbers } from "./game/seeder";
import { bestXI, createLiveMatch, simulateMinute } from "./game/engine";
import { applyResult, buildLeagueFixtures, initTable, sortTable } from "./game/schedule";
import { mulberry32, pick } from "./game/rng";
import { aiAcceptChance, askingPrice } from "./game/market";

export interface Settings {
  speed: number; // multiplicador: 0.5, 1, 2, 4
  soundGoal: boolean;
  soundRed: boolean;
}

export const MIN_SQUAD = 18;
export const MAX_SQUAD = 25;

// Receita de bilheteria por jogo em casa: proporcional ao porte do clube (baseBudget).
// Usada como unidade de referência de prêmios (copa, bicho); a renda real de cada
// partida agora vem do público no estádio (stadiumAttendance × ticketPrice).
export function matchdayRevenue(baseBudget: number): number {
  return Math.round(baseBudget * 0.015);
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
  const base = isA ? 30000 + power * 20000 : 5000 + power * 15000;
  const info = weekInfo(week);
  // jogo eliminatório é evento: cada fase adiante enche mais o estádio;
  // fase de grupos da continental é um degrau acima da liga
  const importance =
    info.type === "league" ? 1
    : info.type === "contgroup" ? 1.1
    : 1.15 + info.stage * 0.1;
  const rng = mulberry32((g.seed ^ (week * 2654435761) ^ strHash(homeId)) >>> 0);
  const variation = 0.85 + rng() * 0.3; // ±15% de jogo para jogo
  return Math.min(70000, Math.round(base * importance * variation));
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
  setFormation: (f: Formation, custom?: CustomFormation) => void;
  setCustomFormation: (custom: CustomFormation) => void;
  setDefaultTactics: (t: Partial<Tactics>) => void;
  setPlayerTraining: (id: string, i: TrainingIntensity) => void;
  setPlayerNumber: (id: string, number: number) => void;
  payBicho: (level: BichoLevel) => boolean;
  sellPlayer: (id: string) => { ok: boolean; amount?: number };
  buyPlayer: (id: string, offer: number) => { ok: boolean; message: string };
  finishMatchday: (userTieWinnerId?: string) => void;
  skipMatchday: () => void;
  acceptJobOffer: () => void;
  declineJobOffer: () => void;
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
  if (!live) return false;
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

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      game: null,
      live: null,
      lastResults: null,
      liveDivision: null,
      paused: false,
      settings: { speed: 1, soundGoal: true, soundRed: true },

      setSettings: (s) => set({ settings: { ...get().settings, ...s } }),

      loadGame: (g) => set({ game: g, live: null, lastResults: null, liveDivision: null }),

      releasePlayer: (id) => {
        const g = get().game;
        if (!g) return;
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        if (squad.length <= MIN_SQUAD) return;
        const players = g.players.filter((p) => p.id !== id);
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
        if (!g) return { ok: false };
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        if (squad.length <= MIN_SQUAD) return { ok: false };
        const player = squad.find((p) => p.id === id);
        if (!player) return { ok: false };
        const amount = askingPrice(g, player);
        const players = g.players.filter((p) => p.id !== id);
        let starters = g.starters;
        if (starters.includes(id)) {
          const rest = players.filter((p) => p.clubId === g.userClubId);
          const sub = rest.find((p) => !starters.includes(p.id));
          starters = starters.map((s) => (s === id ? (sub?.id ?? s) : s)).filter((s) => s !== id);
        }
        set({ game: { ...g, players, starters, budget: g.budget + amount } });
        return { ok: true, amount };
      },

      buyPlayer: (id, offer) => {
        const g = get().game;
        if (!g) return { ok: false, message: "Sem jogo ativo." };
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
          game: { ...game, managerName, budget: game.budget + seasonRevenue(userClub.baseBudget) },
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
            posA === 1 ? 0.6 // campeão da Série A: cobiçado, mas mercado é mercado
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
          g = {
            ...g,
            jobOffer,
            clubs,
            season: g.season + 1,
            week: 1,
            // divisões mudaram: novo sorteio de confrontos da liga
            fixtures: buildLeagueFixtures(seasonRng, countryClubs),
            tables: Object.fromEntries(
              ["Série A", "Série B"].map((div) => [
                div, initTable(countryClubs.filter((c) => c.division === div)),
              ]),
            ),
            budget: g.budget + seasonRevenue(userClub.baseBudget),
            players: g.players.map((p) => ({ ...p, gained: 0 })),
            cup: drawCup(
              seasonRng,
              countryClubs.filter((c) => c.division === "Série A").map((c) => c.id),
              countryClubs.filter((c) => c.division === "Série B").map((c) => c.id),
            ),
            continental: drawContinental(
              mulberry32((g.seed ^ ((g.season + 1) * 79087)) >>> 0),
              clubs, g.userClubId,
              continentalData as unknown as Record<string, Record<string, string[]>>,
              // classificados: os 4 primeiros da Série A na tabela final da temporada
              finalA.slice(0, 4).map((r) => r.clubId),
            ),
          };
          set({ game: g });
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
        // continental usa o mesmo regime de suspensões da copa (competição mata-mata)
        const matchCompetition = info.type === "league" ? "league" : "cup";
        const live = sorted.map((f) =>
          createLiveMatch(
            f.homeId, f.awayId,
            g.players.filter((p) => p.clubId === f.homeId),
            g.players.filter((p) => p.clubId === f.awayId),
            f.homeId === g.userClubId ? g.starters : undefined,
            f.awayId === g.userClubId ? g.starters : undefined,
            f.homeId === g.userClubId ? g.defaultTactics : undefined,
            f.awayId === g.userClubId ? g.defaultTactics : undefined,
            clubAggression(g, f.homeId),
            clubAggression(g, f.awayId),
            f.homeId === g.userClubId ? g.slotOrder : undefined,
            f.awayId === g.userClubId ? g.slotOrder : undefined,
            matchCompetition,
            f.homeId === g.userClubId ? g.formation : undefined,
            f.awayId === g.userClubId ? g.formation : undefined,
            f.homeId === g.userClubId ? g.customFormation : undefined,
            f.awayId === g.userClubId ? g.customFormation : undefined,
          ),
        );
        // público de cada estádio definido na abertura da rodada (e exibido nela)
        for (const m of live) m.attendance = stadiumAttendance(g, m.homeId, week);
        set({ live, lastResults: null, liveDivision: null, paused: false });
      },

      tick: () => {
        const { game, live, paused } = get();
        if (!game || !live || paused) return;
        const rng = mulberry32(
          (game.seed ^ (game.week * 7919) ^ ((live[0]?.minute ?? 0) * 104729)) >>> 0,
        );
        const idx = Object.fromEntries(game.players.map((p) => [p.id, p]));
        const next = live.map((m) => {
          const copy: LiveMatch = JSON.parse(JSON.stringify(m));
          const userSide =
            copy.homeId === game.userClubId ? "home"
            : copy.awayId === game.userClubId ? "away"
            : null;
          simulateMinute(rng, copy, idx, userSide as any);
          return copy;
        });
        // gols/cartões são gravados no idx (players clonados por referência do game)
        set({ live: next, game: { ...game, players: [...game.players] } });
      },

      setPaused: (p) => set({ paused: p }),

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
        if (!g?.jobOffer) return;
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
          },
        });
      },
      declineJobOffer: () => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, jobOffer: undefined } });
      },

      payBicho: (level) => {
        const g = get().game;
        if (!g || g.defaultTactics.bicho) return false; // já pago para a próxima partida
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
          const rng = mulberry32((game.seed ^ (game.week * 15485863)) >>> 0);
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
        // fora do XI): libera só o campo da competição que acabou de rolar. Vermelho
        // levado na liga não afeta a copa, e vice-versa.
        const suspendedIds = new Set(
          game.players
            .filter((p) => (isCup ? p.suspendedCup : p.suspendedLeague))
            .map((p) => p.id),
        );
        const players = game.players.map((p) => {
          // regime individual do jogador afeta ganho de XP e recuperação; IA treina em regime normal
          const intensity: TrainingIntensity =
            p.clubId === game.userClubId ? (p.training ?? "normal") : "normal";
          const base = played.get(p.id) ?? p.energy;
          const recovered = base + (100 - base) * RECOVERY[intensity];
          const next = {
            ...p,
            energy: Math.min(100, Math.round(recovered)),
            suspendedLeague: !isCup && suspendedIds.has(p.id) ? false : p.suspendedLeague,
            suspendedCup: isCup && suspendedIds.has(p.id) ? false : p.suspendedCup,
          };
          // evolução semanal: jogar rende muito mais XP; reservas evoluem só pelo treino
          applyWeeklyGain(next, enteredField.has(p.id), intensity);
          return next;
        });
        // receita de bilheteria: só quando o clube do usuário jogou em casa nessa
        // rodada — a renda é o público real do estádio × preço do ingresso da divisão
        const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
        const userHomeMatch = live.find((m) => m.homeId === game.userClubId);
        const revenue = userHomeMatch
          ? (userHomeMatch.attendance ?? stadiumAttendance(game, game.userClubId, game.week)) *
            ticketPrice(userClub.division)
          : 0;
        set({
          game: {
            ...game, fixtures, tables, players, cup, continental,
            week: game.week + 1,
            budget: game.budget + revenue + cupPrize,
            // balanço da rodada para a tela do clube: bilheteria, prêmios e o bicho pago
            lastFinance: { revenue, prize: cupPrize, bicho: game.pendingBicho ?? 0 },
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
      version: 8,
      // saves antigos: preenche campos de treinamento/pé/número/suspensão e encaixa a copa no calendário
      migrate: (state: any) => {
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
          }));
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
