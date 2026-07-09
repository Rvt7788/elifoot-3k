import type { Rng } from "./rng";

// ============================== COPA NACIONAL ==============================
// Mata-mata de ida e volta com os 40 clubes do país (Séries A e B).
// 40 não é potência de 2: uma fase preliminar com 16 sorteados (8 confrontos)
// reduz o quadro a 32 (8 vencedores + 24 isentos). Depois: 32 → 16 → quartas
// → semi → final. Empate no agregado decide nos pênaltis.

export interface CupTie {
  homeId: string; // mando da ida (volta inverte)
  awayId: string;
  g1h?: number; g1a?: number; // placar da ida
  g2h?: number; g2a?: number; // placar da volta (g2h = gols do mandante da volta, o awayId)
  winnerId?: string;
  pens?: boolean; // decidido nos pênaltis
}

export interface CupState {
  byes: string[]; // isentos da preliminar, entram na fase de 32
  rounds: CupTie[][]; // fases sorteadas até agora: [prelim, 32, 16, QF, SF, F]
}

export const CUP_STAGES = 6;
export const CUP_STAGE_NAMES = [
  "Preliminar", "Fase de 32", "Oitavas", "Quartas", "Semifinal", "Final",
];

// ========================== COPA CONTINENTAL ==============================
// Mata-mata de ida e volta com 16 clubes históricos do continente (Libertadores
// para BR/AR, Champions para a Europa) — oitavas → quartas → semi → final.
export const CONT_STAGES = 4;
export const CONT_STAGE_NAMES = ["Oitavas", "Quartas", "Semifinal", "Final"];

// A copa nacional e a continental correm intercaladas com a liga (38 rodadas): a
// ida de uma fase entra após uma rodada, a liga segue, e a volta entra algumas
// rodadas depois — ida e volta nunca em semanas coladas. Cada número abaixo é a
// rodada da liga após a qual entra UMA semana daquela competição; os pares
// (2s, 2s+1) são ida e volta da fase s. Nenhuma rodada recebe duas inserções.
// Total: 38 liga + 12 copa + 8 continental = 58 semanas.
export const CUP_INSERTS = [5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 36, 38];
export const CONT_INSERTS = [4, 7, 13, 16, 22, 25, 31, 34];
const ALL_INSERTS = [...CUP_INSERTS, ...CONT_INSERTS].sort((a, b) => a - b);
export const TOTAL_WEEKS = 38 + CUP_STAGES * 2 + CONT_STAGES * 2;

// Semana da liga considerando as semanas de copa/continental já inseridas antes dela.
export function leagueWeek(round: number): number {
  return round + ALL_INSERTS.filter((p) => p < round).length;
}

// Semana em que cai a inserção feita após a rodada `p` da liga.
const insertWeek = (p: number): number => leagueWeek(p) + 1;

// Semanas (ida, volta) da fase `stage` da copa nacional.
export function cupStageWeeks(stage: number): [number, number] {
  return [insertWeek(CUP_INSERTS[stage * 2]), insertWeek(CUP_INSERTS[stage * 2 + 1])];
}

// Semanas (ida, volta) da fase `stage` da copa continental.
export function contStageWeeks(stage: number): [number, number] {
  return [insertWeek(CONT_INSERTS[stage * 2]), insertWeek(CONT_INSERTS[stage * 2 + 1])];
}

export type WeekInfo =
  | { type: "league"; round: number }
  | { type: "cup"; stage: number; leg: 1 | 2 }
  | { type: "continental"; stage: number; leg: 1 | 2 };

// Que evento acontece numa dada semana do calendário.
export function weekInfo(week: number): WeekInfo {
  for (let s = 0; s < CUP_STAGES; s++) {
    const [ida, volta] = cupStageWeeks(s);
    if (week === ida) return { type: "cup", stage: s, leg: 1 };
    if (week === volta) return { type: "cup", stage: s, leg: 2 };
  }
  for (let s = 0; s < CONT_STAGES; s++) {
    const [ida, volta] = contStageWeeks(s);
    if (week === ida) return { type: "continental", stage: s, leg: 1 };
    if (week === volta) return { type: "continental", stage: s, leg: 2 };
  }
  const insertsBefore = ALL_INSERTS.filter((p) => insertWeek(p) < week).length;
  return { type: "league", round: week - insertsBefore };
}

function shuffle<T>(rng: Rng, arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pairUp(ids: string[]): CupTie[] {
  const ties: CupTie[] = [];
  for (let i = 0; i < ids.length; i += 2)
    ties.push({ homeId: ids[i], awayId: ids[i + 1] });
  return ties;
}

// Sorteio inicial: a preliminar é só entre clubes da Série B (16 sorteados dos 20);
// a Série A inteira e os 4 restantes da B entram direto na fase de 32.
export function drawCup(rng: Rng, serieAIds: string[], serieBIds: string[]): CupState {
  const orderB = shuffle(rng, serieBIds);
  const prelim = orderB.slice(0, 16);
  const byes = [...serieAIds, ...orderB.slice(16)];
  return { byes, rounds: [pairUp(prelim)] };
}

// Sorteio da continental: os 4 primeiros da Série A do país do usuário se
// classificam; as outras 12 vagas vão para clubes estrangeiros com histórico
// continental (continental.json), da confederação do país do usuário.
export function drawContinental(
  rng: Rng,
  clubs: { id: string; name: string; country: string }[],
  userClubId: string,
  contData: Record<string, Record<string, string[]>>,
  serieATop4: string[],
): CupState {
  const user = clubs.find((c) => c.id === userClubId)!;
  const confed = ["BR", "AR"].includes(user.country) ? "libertadores" : "champions";
  const lists = contData[confed] ?? {};
  const foreign: string[] = [];
  for (const [country, names] of Object.entries(lists)) {
    if (country === user.country) continue; // o país do usuário entra pelo top 4 da liga
    for (const name of names) {
      const club = clubs.find((c) => c.country === country && c.name === name);
      if (club) foreign.push(club.id);
    }
  }
  const picked = [...serieATop4.slice(0, 4), ...shuffle(rng, foreign)].slice(0, 16);
  return { byes: [], rounds: [pairUp(shuffle(rng, picked))] };
}

export function currentStage(cup: CupState): number {
  return cup.rounds.length - 1;
}

export function stageLegPlayed(cup: CupState, stage: number, leg: 1 | 2): boolean {
  const ties = cup.rounds[stage];
  if (!ties) return false;
  return ties.every((t) => (leg === 1 ? t.g1h != null : t.g2h != null));
}

export function cupFinished(cup: CupState, totalStages = CUP_STAGES): boolean {
  return (
    cup.rounds.length === totalStages &&
    cup.rounds[totalStages - 1].every((t) => t.winnerId)
  );
}

export function cupChampion(cup: CupState, totalStages = CUP_STAGES): string | null {
  if (!cupFinished(cup, totalStages)) return null;
  return cup.rounds[totalStages - 1][0].winnerId ?? null;
}

// Próxima semana de copa ainda não disputada (null se a copa acabou).
export function nextCupWeek(cup: CupState): number | null {
  for (let s = 0; s < CUP_STAGES; s++) {
    const [ida, volta] = cupStageWeeks(s);
    if (!stageLegPlayed(cup, s, 1)) return ida;
    if (!stageLegPlayed(cup, s, 2)) return volta;
  }
  return null;
}

// Próxima semana da continental ainda não disputada (null se acabou).
export function nextContWeek(cont: CupState): number | null {
  for (let s = 0; s < CONT_STAGES; s++) {
    const [ida, volta] = contStageWeeks(s);
    if (!stageLegPlayed(cont, s, 1)) return ida;
    if (!stageLegPlayed(cont, s, 2)) return volta;
  }
  return null;
}

// Confrontos a disputar numa perna: ida como sorteado, volta com mando invertido.
export function tiesForLeg(
  cup: CupState, stage: number, leg: 1 | 2,
): { homeId: string; awayId: string; tieIndex: number }[] {
  return (cup.rounds[stage] ?? []).map((t, i) => ({
    homeId: leg === 1 ? t.homeId : t.awayId,
    awayId: leg === 1 ? t.awayId : t.homeId,
    tieIndex: i,
  }));
}

// Grava os placares de uma perna. Na volta, fecha o agregado: empate vai para os
// pênaltis (moeda). Se a fase inteira terminou, sorteia a fase seguinte.
export function applyCupResults(
  rng: Rng,
  cup: CupState,
  stage: number,
  leg: 1 | 2,
  results: { tieIndex: number; homeScore: number; awayScore: number }[],
  // vencedores já decididos fora (disputa de pênaltis interativa do usuário)
  decided?: { tieIndex: number; winnerId: string }[],
  totalStages = CUP_STAGES,
): void {
  const ties = cup.rounds[stage];
  for (const r of results) {
    const t = ties[r.tieIndex];
    if (leg === 1) {
      t.g1h = r.homeScore;
      t.g1a = r.awayScore;
    } else {
      t.g2h = r.homeScore; // mandante da volta = awayId do confronto
      t.g2a = r.awayScore;
      const aggHome = (t.g1h ?? 0) + r.awayScore; // gols do homeId no agregado
      const aggAway = (t.g1a ?? 0) + r.homeScore;
      if (aggHome > aggAway) t.winnerId = t.homeId;
      else if (aggAway > aggHome) t.winnerId = t.awayId;
      else {
        const pre = decided?.find((d) => d.tieIndex === r.tieIndex);
        t.winnerId = pre ? pre.winnerId : rng() < 0.5 ? t.homeId : t.awayId;
        t.pens = true;
      }
    }
  }
  // fase completa: sorteia a próxima (se ainda não for a final)
  if (
    leg === 2 &&
    ties.every((t) => t.winnerId) &&
    cup.rounds.length < totalStages
  ) {
    const winners = ties.map((t) => t.winnerId!);
    const pool = stage === 0 ? [...cup.byes, ...winners] : winners;
    cup.rounds.push(pairUp(shuffle(rng, pool)));
  }
}
