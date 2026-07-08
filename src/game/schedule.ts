import type { Club, Fixture, TableRow } from "../types";
import type { Rng } from "./rng";

import { leagueWeek } from "./cup";

// Com 20 times por divisão a liga tem 38 rodadas. As semanas de copa entram
// intercaladas no calendário, então a semana de cada rodada é deslocada.
export function roundToWeek(round: number): number {
  return leagueWeek(round);
}

// Round-robin (algoritmo do círculo) para 20 times: 19 rodadas + returno = 38.
function roundRobin(ids: string[]): { home: string; away: string }[][] {
  const n = ids.length;
  const arr = [...ids];
  const rounds: { home: string; away: string }[][] = [];
  for (let r = 0; r < n - 1; r++) {
    const round: { home: string; away: string }[] = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i];
      const b = arr[n - 1 - i];
      // alterna mando para distribuir jogos em casa
      round.push(r % 2 === 0 ? { home: a, away: b } : { home: b, away: a });
    }
    rounds.push(round);
    arr.splice(1, 0, arr.pop()!);
  }
  const returno = rounds.map((r) =>
    r.map((m) => ({ home: m.away, away: m.home })),
  );
  return [...rounds, ...returno];
}

export function buildLeagueFixtures(rng: Rng, countryClubs: Club[]): Fixture[] {
  const fixtures: Fixture[] = [];
  for (const div of ["Série A", "Série B"]) {
    const ids = countryClubs
      .filter((c) => c.division === div)
      .map((c) => c.id)
      .sort(() => rng() - 0.5);
    roundRobin(ids).forEach((round, ri) => {
      for (const m of round) {
        fixtures.push({
          week: roundToWeek(ri + 1),
          round: ri + 1,
          homeId: m.home,
          awayId: m.away,
          played: false,
        });
      }
    });
  }
  return fixtures;
}

export function initTable(clubs: Club[]): TableRow[] {
  return clubs.map((c) => ({
    clubId: c.id,
    pts: 0, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0,
  }));
}

export function applyResult(
  table: TableRow[],
  homeId: string,
  awayId: string,
  hs: number,
  as: number,
) {
  const h = table.find((r) => r.clubId === homeId);
  const a = table.find((r) => r.clubId === awayId);
  if (!h || !a) return;
  h.p++; a.p++;
  h.gf += hs; h.ga += as;
  a.gf += as; a.ga += hs;
  if (hs > as) { h.w++; h.pts += 3; a.l++; }
  else if (hs < as) { a.w++; a.pts += 3; h.l++; }
  else { h.d++; a.d++; h.pts++; a.pts++; }
}

export function sortTable(table: TableRow[]): TableRow[] {
  return [...table].sort(
    (x, y) =>
      y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf,
  );
}
