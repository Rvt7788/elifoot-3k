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

// A copa corre intercalada com a liga (38 rodadas): a ida de uma fase entra após
// uma rodada, a liga segue, e a volta entra algumas rodadas depois — ida e volta
// nunca em semanas coladas. Cada número abaixo é a rodada da liga após a qual entra
// UMA semana de copa; os pares (2s, 2s+1) são ida e volta da fase s. A volta da
// final vem depois da rodada 38 — copa e liga terminam juntas. Total: 50 semanas.
export const CUP_INSERTS = [5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 36, 38];
export const TOTAL_WEEKS = 38 + CUP_STAGES * 2;

// Semana da liga considerando as semanas de copa já inseridas antes dela.
export function leagueWeek(round: number): number {
  return round + CUP_INSERTS.filter((p) => p < round).length;
}

// Semanas (ida, volta) da fase `stage` da copa.
export function cupStageWeeks(stage: number): [number, number] {
  return [
    leagueWeek(CUP_INSERTS[stage * 2]) + 1,
    leagueWeek(CUP_INSERTS[stage * 2 + 1]) + 1,
  ];
}

// Que evento acontece numa dada semana do calendário.
export function weekInfo(
  week: number,
): { type: "league"; round: number } | { type: "cup"; stage: number; leg: 1 | 2 } {
  let cupBefore = 0;
  for (let s = 0; s < CUP_STAGES; s++) {
    const [ida, volta] = cupStageWeeks(s);
    if (week === ida) return { type: "cup", stage: s, leg: 1 };
    if (week === volta) return { type: "cup", stage: s, leg: 2 };
    if (ida < week) cupBefore++;
    if (volta < week) cupBefore++;
  }
  return { type: "league", round: week - cupBefore };
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

export function currentStage(cup: CupState): number {
  return cup.rounds.length - 1;
}

export function stageLegPlayed(cup: CupState, stage: number, leg: 1 | 2): boolean {
  const ties = cup.rounds[stage];
  if (!ties) return false;
  return ties.every((t) => (leg === 1 ? t.g1h != null : t.g2h != null));
}

export function cupFinished(cup: CupState): boolean {
  return (
    cup.rounds.length === CUP_STAGES &&
    cup.rounds[CUP_STAGES - 1].every((t) => t.winnerId)
  );
}

export function cupChampion(cup: CupState): string | null {
  if (!cupFinished(cup)) return null;
  return cup.rounds[CUP_STAGES - 1][0].winnerId ?? null;
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
    cup.rounds.length < CUP_STAGES
  ) {
    const winners = ties.map((t) => t.winnerId!);
    const pool = stage === 0 ? [...cup.byes, ...winners] : winners;
    cup.rounds.push(pairUp(shuffle(rng, pool)));
  }
}
