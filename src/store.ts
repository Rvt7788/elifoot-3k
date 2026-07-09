import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Fixture, Formation, GameState, LiveMatch, Player, Tactics, TrainingIntensity } from "./types";
import { FORMATIONS } from "./types";
import { applyWeeklyGain, RECOVERY } from "./game/training";
import {
  applyCupResults, drawCup, leagueWeek, nextCupWeek, tiesForLeg, weekInfo,
} from "./game/cup";
import { newGame } from "./game/seeder";
import { createLiveMatch, simulateMinute } from "./game/engine";
import { applyResult, sortTable } from "./game/schedule";
import { mulberry32 } from "./game/rng";
import { aiAcceptChance, askingPrice } from "./game/market";

export interface Settings {
  speed: number; // multiplicador: 0.5, 1, 2, 4
  soundGoal: boolean;
  soundRed: boolean;
}

export const MIN_SQUAD = 18;
export const MAX_SQUAD = 25;

// Receita de bilheteria por jogo em casa: proporcional ao porte do clube (baseBudget).
export function matchdayRevenue(baseBudget: number): number {
  return Math.round(baseBudget * 0.015);
}

// Custo do bicho (prêmio de motivação pago durante a partida): uma bilheteria de jogo em casa.
export function bichoCost(baseBudget: number): number {
  return matchdayRevenue(baseBudget);
}

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
  setFormation: (f: Formation) => void;
  setDefaultTactics: (t: Partial<Tactics>) => void;
  setPlayerTraining: (id: string, i: TrainingIntensity) => void;
  payBicho: () => boolean;
  sellPlayer: (id: string) => { ok: boolean; amount?: number };
  buyPlayer: (id: string, offer: number) => { ok: boolean; message: string };
  finishMatchday: (userTieWinnerId?: string) => void;
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
  if (!live || !g.cup) return false;
  const info = weekInfo(g.week);
  if (info.type !== "cup" || info.leg !== 2) return false;
  const m = live.find((x) => x.homeId === g.userClubId || x.awayId === g.userClubId);
  if (!m || !m.finished) return false;
  const tie = g.cup.rounds[info.stage]?.find(
    (t) => t.homeId === g.userClubId || t.awayId === g.userClubId,
  );
  if (!tie || tie.winnerId) return false;
  // mandante da volta é o awayId do confronto
  const aggHome = (tie.g1h ?? 0) + m.awayScore;
  const aggAway = (tie.g1a ?? 0) + m.homeScore;
  return aggHome === aggAway;
}

// Próxima semana a disputar, considerando liga e copa intercaladas no calendário.
export const nextPlayableWeek = (g: GameState): number | null => {
  const league = nextLeagueWeek(g);
  const cup = g.cup ? nextCupWeek(g.cup) : null;
  if (league === null) return cup;
  if (cup === null) return league;
  return Math.min(league, cup);
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
        // temporada anterior toda disputada (liga e copa): reinicia o calendário,
        // sorteia nova copa e credita o aporte da nova temporada
        if (nextPlayableWeek(g) === null) {
          const userClub = g.clubs.find((c) => c.id === g!.userClubId)!;
          g = {
            ...g,
            season: g.season + 1,
            week: 1,
            fixtures: g.fixtures.map((f) => ({ ...f, played: false, homeScore: undefined, awayScore: undefined })),
            tables: Object.fromEntries(
              Object.entries(g.tables).map(([div, rows]) => [
                div, rows.map((r) => ({ ...r, pts: 0, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0 })),
              ]),
            ),
            budget: g.budget + seasonRevenue(userClub.baseBudget),
            players: g.players.map((p) => ({ ...p, gained: 0 })),
            cup: drawCup(
              mulberry32((g.seed ^ ((g.season + 1) * 48271)) >>> 0),
              g.clubs.filter((c) => c.country === userClub.country && c.division === "Série A").map((c) => c.id),
              g.clubs.filter((c) => c.country === userClub.country && c.division === "Série B").map((c) => c.id),
            ),
          };
          set({ game: g });
        }
        const week = nextPlayableWeek(g);
        if (week === null) return;
        if (g.week !== week) set({ game: { ...g, week } });
        const userClub = g.clubs.find((c) => c.id === g!.userClubId)!;
        const info = weekInfo(week);
        // semana de copa: confrontos da perna atual; semana de liga: jogos da rodada
        const pairs: { homeId: string; awayId: string }[] =
          info.type === "cup" && g.cup
            ? tiesForLeg(g.cup, info.stage, info.leg)
            : weekFixtures(g, week);
        // o jogo do usuário primeiro; depois os da divisão dele
        const divOrder = (f: { homeId: string; awayId: string }) => {
          if (f.homeId === g!.userClubId || f.awayId === g!.userClubId) return -1;
          const div = g!.clubs.find((c) => c.id === f.homeId)!.division;
          return div === userClub.division ? 0 : 1;
        };
        const sorted = [...pairs].sort((a, b) => divOrder(a) - divOrder(b));
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
          ),
        );
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
      payBicho: () => {
        const g = get().game;
        if (!g || g.defaultTactics.bicho) return false; // já pago para a próxima partida
        const userClub = g.clubs.find((c) => c.id === g.userClubId)!;
        const cost = bichoCost(userClub.baseBudget);
        if (g.budget < cost) return false;
        set({
          game: {
            ...g,
            budget: g.budget - cost,
            defaultTactics: { ...g.defaultTactics, bicho: true },
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

      setDefaultTactics: (t) => {
        const g = get().game;
        if (!g) return;
        set({ game: { ...g, defaultTactics: { ...g.defaultTactics, ...t } } });
      },

      setFormation: (formation) => {
        const g = get().game;
        if (!g) return;
        const squad = g.players.filter((p) => p.clubId === g.userClubId);
        const shape = FORMATIONS[formation];
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
        set({ game: { ...g, formation, starters: [...kept], slotOrder: undefined } });
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
        const isCup = info.type === "cup" && !!game.cup;
        let fixtures = game.fixtures;
        let tables = game.tables;
        let cup = game.cup;
        let cupPrize = 0;
        if (isCup && info.type === "cup") {
          // grava os placares na copa; ao fechar a volta define classificados
          // (pênaltis em agregado empatado) e sorteia a fase seguinte
          cup = JSON.parse(JSON.stringify(game.cup)) as typeof game.cup;
          const ties = tiesForLeg(cup, info.stage, info.leg);
          const results = ties.flatMap((t) => {
            const m = live.find((x) => x.homeId === t.homeId && x.awayId === t.awayId);
            return m ? [{ tieIndex: t.tieIndex, homeScore: m.homeScore, awayScore: m.awayScore }] : [];
          });
          const rng = mulberry32((game.seed ^ (game.week * 15485863)) >>> 0);
          // vencedor da disputa de pênaltis interativa (empate no agregado do usuário)
          const decided = userTieWinnerId
            ? cup.rounds[info.stage]
                .map((t, i) => ({ t, i }))
                .filter(({ t }) => t.homeId === game.userClubId || t.awayId === game.userClubId)
                .map(({ i }) => ({ tieIndex: i, winnerId: userTieWinnerId }))
            : undefined;
          applyCupResults(rng, cup, info.stage, info.leg, results, decided);
          const userClub2 = game.clubs.find((c) => c.id === game.userClubId)!;
          const gate = matchdayRevenue(userClub2.baseBudget);
          // premiação por jogo: vencer uma partida de copa rende mais que um jogo normal
          const userMatch = live.find(
            (m) => m.homeId === game.userClubId || m.awayId === game.userClubId,
          );
          if (userMatch) {
            const myScore = userMatch.homeId === game.userClubId ? userMatch.homeScore : userMatch.awayScore;
            const oppScore = userMatch.homeId === game.userClubId ? userMatch.awayScore : userMatch.homeScore;
            if (myScore > oppScore) cupPrize += Math.round(gate * 1.5);
          }
          // premiação por chaveamento: avançar de fase paga forte e escala até a final
          if (info.leg === 2) {
            const userTie = cup.rounds[info.stage].find(
              (t) => t.homeId === game.userClubId || t.awayId === game.userClubId,
            );
            if (userTie?.winnerId === game.userClubId) {
              // preliminar, 32, oitavas, quartas, semi: multiplicador crescente da bilheteria
              const STAGE_PRIZE = [3, 5, 8, 12, 20];
              cupPrize +=
                info.stage === 5
                  ? seasonRevenue(userClub2.baseBudget) * 2 // campeão da copa
                  : gate * STAGE_PRIZE[info.stage];
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
        // quem estava suspenso cumpriu a pena nesta rodada (ficou de fora do XI): libera para a próxima
        const suspendedIds = new Set(
          game.players.filter((p) => p.suspended).map((p) => p.id),
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
            suspended: suspendedIds.has(p.id) ? false : p.suspended,
          };
          // evolução semanal: jogar rende muito mais XP; reservas evoluem só pelo treino
          applyWeeklyGain(next, enteredField.has(p.id), intensity);
          return next;
        });
        // receita de bilheteria: só quando o clube do usuário jogou em casa nessa rodada
        const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
        const playedHome = live.some((m) => m.homeId === game.userClubId);
        const revenue = playedHome ? matchdayRevenue(userClub.baseBudget) : 0;
        set({
          game: {
            ...game, fixtures, tables, players, cup,
            week: game.week + 1,
            budget: game.budget + revenue + cupPrize,
            // bicho vale só para a partida da rodada: pago, consumido, resetado
            defaultTactics: { ...game.defaultTactics, bicho: false },
          },
          live: null,
          lastResults: live,
          liveDivision: null,
        });
      },
    }),
    {
      name: "retro-manager-save",
      version: 6,
      // saves antigos: preenche campos de treinamento/pé e encaixa a copa no calendário
      migrate: (state: any) => {
        const g = state?.game;
        if (g) {
          g.players = g.players.map((p: Player) => ({
            ...p, xp: p.xp ?? 0, gained: p.gained ?? 0,
            training: p.training ?? g.trainingIntensity ?? "normal",
            foot: p.foot ?? (Math.random() < 0.25 ? "canhoto" : "destro"),
          }));
          delete g.trainingIntensity;
          if (!g.cup) {
            const userClub = g.clubs.find((c: any) => c.id === g.userClubId);
            g.cup = drawCup(
              mulberry32((g.seed ^ (g.season * 48271)) >>> 0),
              g.clubs.filter((c: any) => c.country === userClub.country && c.division === "Série A").map((c: any) => c.id),
              g.clubs.filter((c: any) => c.country === userClub.country && c.division === "Série B").map((c: any) => c.id),
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
