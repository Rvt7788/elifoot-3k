import type { Club, Manager, ManagerAward, Player, TableRow } from "../types";
import { playerName } from "./names";
import { mulberry32, pick, type Rng } from "./rng";
import { sortTable } from "./schedule";
import { BR_MANAGERS, BR_MANAGERS_EXTRA } from "../data/managersBR";

// =============================================================================
// Ecossistema de técnicos: cada clube tem um técnico com reputação e títulos.
// No fim da temporada os técnicos são avaliados contra a expectativa do clube
// (posição final vs. porte/orçamento), os que decepcionam caem no carrossel de
// demissões e o prêmio de Melhor Técnico é entregue ao dono da melhor campanha.
// =============================================================================

// Gerador de nomes de técnico a partir dos jogadores do save: combina o primeiro
// nome de um jogador com o sobrenome de outro (do mesmo país), evitando repetir
// sobrenomes entre os técnicos. Sem jogadores do país, cai no pool genérico.
function managerNamer(clubs: Club[], players: Player[]) {
  const clubCountry = new Map(clubs.map((c) => [c.id, c.country]));
  const firstBy = new Map<string, string[]>();
  const lastBy = new Map<string, string[]>();
  for (const p of players) {
    const country = clubCountry.get(p.clubId);
    if (!country) continue;
    const tokens = p.name.split(" ");
    const first = tokens[0];
    const last = tokens.length > 1 ? tokens.slice(1).join(" ") : tokens[0];
    firstBy.set(country, [...(firstBy.get(country) ?? []), first]);
    lastBy.set(country, [...(lastBy.get(country) ?? []), last]);
  }
  const usedLast = new Set<string>();
  return (rng: Rng, country: string): string => {
    const firsts = firstBy.get(country) ?? [];
    const lasts = lastBy.get(country) ?? [];
    if (firsts.length === 0 || lasts.length === 0) return playerName(rng, country);
    // até 25 tentativas para achar um sobrenome ainda não usado entre os técnicos
    for (let i = 0; i < 25; i++) {
      const last = pick(rng, lasts);
      if (usedLast.has(`${country}:${last}`) && i < 24) continue;
      usedLast.add(`${country}:${last}`);
      return `${pick(rng, firsts)} ${last}`;
    }
    return playerName(rng, country);
  };
}

// Nomeador com técnicos reais do Brasil: clube da lista recebe seu técnico da
// vida real; clubes BR sem par usam a reserva (Tite, Cuca…); o restante do
// mundo usa nomes derivados dos jogadores do save.
function makeNameFor(clubs: Club[], players: Player[]) {
  const generated = managerNamer(clubs, players);
  const byClubName = new Map(
    BR_MANAGERS.filter((m) => m.club).map((m) => [m.club!, m.name]),
  );
  const clubNames = new Set(clubs.map((c) => c.name));
  // reserva: extras + técnicos nomeados cujo clube não existe no save
  const reserve = [
    ...BR_MANAGERS_EXTRA,
    ...BR_MANAGERS.filter((m) => !m.club || !clubNames.has(m.club)).map((m) => m.name),
  ];
  return {
    forClub: (rng: Rng, c: Club): string => {
      if (c.country === "BR") {
        const real = byClubName.get(c.name);
        if (real) return real;
        if (reserve.length > 0) return reserve.shift()!;
      }
      return generated(rng, c.country);
    },
    reserve,
  };
}

// Um técnico por clube; o do usuário é marcado como isUser. Reputação inicial
// segue o porte do clube (quem treina gigante já chega com moral). No Brasil os
// nomes são de técnicos reais; nos outros países, derivados dos jogadores do save.
export function createManagers(
  seed: number,
  clubs: Club[],
  userClubId: string,
  userManagerName?: string,
  players: Player[] = [],
): Manager[] {
  const rng = mulberry32((seed ^ 0x7ec) >>> 0);
  const namer = makeNameFor(clubs, players);
  const budgets = [...clubs].sort((a, b) => a.baseBudget - b.baseBudget);
  const percentile = new Map(budgets.map((c, i) => [c.id, i / Math.max(1, budgets.length - 1)]));
  const managers: Manager[] = clubs.map((c) =>
    c.id === userClubId
      ? {
          id: "user",
          name: userManagerName || "Você",
          clubId: c.id,
          reputation: 30,
          titles: 0,
          isUser: true,
        }
      : {
          id: `mgr_${c.id}`,
          name: namer.forClub(rng, c),
          clubId: c.id,
          reputation: Math.round(20 + (percentile.get(c.id) ?? 0.4) * 60),
          titles: 0,
        },
  );
  // sobras de peso viram desempregados no mercado — entram pelo carrossel
  for (const [i, name] of namer.reserve.slice(0, 10).entries()) {
    managers.push({
      id: `mgr_free_${i}`,
      name,
      clubId: null,
      reputation: Math.round(40 + rng() * 25),
      titles: 0,
    });
  }
  return managers;
}

// Regenera só os NOMES dos técnicos de um save existente (mantém clube,
// reputação e títulos) — usado na migração para trocar os nomes genéricos
// repetidos pelos técnicos reais (BR) e nomes derivados do elenco (resto).
export function remapManagerNames(
  seed: number, managers: Manager[], clubs: Club[], players: Player[],
): Manager[] {
  const rng = mulberry32((seed ^ 0xbead) >>> 0);
  const namer = makeNameFor(clubs, players);
  const clubById = new Map(clubs.map((c) => [c.id, c]));
  const fallbackCountry = clubs[0]?.country ?? "BR";
  return managers.map((m) => {
    if (m.isUser) return m;
    const club = m.clubId ? clubById.get(m.clubId) : undefined;
    const name = club
      ? namer.forClub(rng, club)
      : namer.reserve.shift() ??
        managerNamer(clubs, players)(rng, fallbackCountry);
    return { ...m, name };
  });
}

export function managerOf(managers: Manager[], clubId: string): Manager | undefined {
  return managers.find((m) => m.clubId === clubId);
}

// Desempenho da temporada: posição final comparada à posição esperada pelo
// orçamento dentro da divisão. Positivo = superou a expectativa.
function overperformance(
  club: Club, divisionClubs: Club[], table: TableRow[],
): number | null {
  const sorted = sortTable(table);
  const actual = sorted.findIndex((r) => r.clubId === club.id) + 1;
  if (actual === 0) return null;
  const byBudget = [...divisionClubs].sort((a, b) => b.baseBudget - a.baseBudget);
  const expected = byBudget.findIndex((c) => c.id === club.id) + 1;
  if (expected === 0) return null;
  return expected - actual;
}

export interface ManagerSeasonResult {
  managers: Manager[];
  award: ManagerAward; // Melhor Técnico da temporada
  userWonAward: boolean;
}

// Fecha a temporada dos técnicos: reputação, títulos, prêmio e carrossel.
// - `finalTables`: tabelas finais das divisões do país do usuário
// - `champions`: clubes campeões (liga A, copa nacional, continental) — cada
//   título soma para o técnico e pesa no prêmio.
export function processManagerSeason(
  seed: number,
  season: number,
  managers: Manager[],
  clubs: Club[],
  finalTables: Record<string, TableRow[]>,
  champions: string[],
  userClubId: string,
): ManagerSeasonResult {
  const rng = mulberry32((seed ^ (season * 2654435761)) >>> 0);
  // vitórias da temporada zeram na virada; as da carreira (winsA/winsB) ficam
  const next = managers.map((m) => ({ ...m, seasonWinsA: 0, seasonWinsB: 0 }));
  const byClub = new Map(next.filter((m) => m.clubId).map((m) => [m.clubId!, m]));
  const championSet = new Set(champions);

  // avaliação de campanha (só clubes com tabela — o país do usuário)
  const perf = new Map<string, number>();
  for (const [div, table] of Object.entries(finalTables)) {
    const divClubs = clubs.filter((c) => c.division === div && table.some((r) => r.clubId === c.id));
    for (const c of divClubs) {
      const op = overperformance(c, divClubs, table);
      if (op !== null) perf.set(c.id, op);
    }
  }

  // reputação e títulos
  for (const m of next) {
    if (!m.clubId) {
      m.reputation = Math.max(5, m.reputation - 3); // parado no mercado, o nome esfria
      continue;
    }
    const op = perf.get(m.clubId) ?? 0;
    const titlesWon = championSet.has(m.clubId)
      ? champions.filter((id) => id === m.clubId).length
      : 0;
    m.titles += titlesWon;
    m.reputation = Math.max(5, Math.min(99, Math.round(m.reputation + op * 2 + titlesWon * 10)));
  }

  // prêmio Melhor Técnico: melhor combinação de campanha acima do esperado e títulos
  const candidates = next.filter((m) => m.clubId && (perf.has(m.clubId) || championSet.has(m.clubId)));
  const awardScore = (m: Manager) => {
    const op = perf.get(m.clubId!) ?? 0;
    const titlesWon = champions.filter((id) => id === m.clubId).length;
    return op * 2 + titlesWon * 12;
  };
  const winner =
    [...candidates].sort((a, b) => awardScore(b) - awardScore(a))[0] ??
    byClub.get(userClubId) ?? next[0];
  const winnerClub = clubs.find((c) => c.id === winner.clubId);
  const award: ManagerAward = {
    season,
    managerName: winner.name,
    clubName: winnerClub?.name ?? "?",
  };
  if (winner) winner.reputation = Math.min(99, winner.reputation + 8);

  // carrossel de demissões: IA que ficou muito abaixo do esperado cai; os clubes
  // vagos contratam por reputação (clube maior leva o técnico mais cotado),
  // puxando também os desempregados de temporadas anteriores.
  const firedClubs: Club[] = [];
  for (const m of next) {
    if (m.isUser || !m.clubId) continue;
    const op = perf.get(m.clubId);
    if (op === undefined) continue; // clube estrangeiro sem tabela: fica
    const fireChance = op <= -6 ? 0.9 : op <= -4 ? 0.55 : op <= -2 ? 0.2 : 0;
    if (fireChance > 0 && rng() < fireChance) {
      const club = clubs.find((c) => c.id === m.clubId);
      if (club) firedClubs.push(club);
      m.clubId = null;
      m.reputation = Math.max(5, m.reputation - 6);
    }
  }
  const pool = next
    .filter((m) => !m.isUser && m.clubId === null)
    .sort((a, b) => b.reputation - a.reputation);
  const vacancies = firedClubs.sort((a, b) => b.baseBudget - a.baseBudget);
  for (const club of vacancies) {
    const hire = pool.shift();
    if (!hire) break;
    hire.clubId = club.id;
  }

  return { managers: next, award, userWonAward: !!winner.isUser };
}

// Demissão do usuário: um técnico novo, com nome inventado no mesmo gerador dos
// demais (jogadores do país), assume o ex-clube e entra no ecossistema — nada de
// "a IA assumiu". O técnico do usuário fica sem clube (clubId null) até o convite.
export function hireReplacementForUser(
  seed: number,
  season: number,
  managers: Manager[],
  clubs: Club[],
  players: Player[],
  clubId: string,
): Manager[] {
  const rng = mulberry32((seed ^ (season * 104651) ^ 0xf17e) >>> 0);
  const club = clubs.find((c) => c.id === clubId);
  const namer = managerNamer(clubs, players);
  const taken = new Set(managers.map((m) => m.name));
  let name = namer(rng, club?.country ?? "BR");
  for (let i = 0; taken.has(name) && i < 10; i++) name = namer(rng, club?.country ?? "BR");
  const replacement: Manager = {
    id: `mgr_${clubId}_s${season}`,
    name,
    clubId,
    // interino apostando na reconstrução: chega com reputação mediana
    reputation: Math.round(30 + rng() * 25),
    titles: 0,
  };
  return [...managers.map((m) => (m.isUser ? { ...m, clubId: null } : m)), replacement];
}

// Troca de clube do usuário (convite aceito): o técnico do usuário assume o novo
// clube e o técnico deslocado herda o clube antigo — ninguém some do ecossistema.
// Se o usuário estava sem clube (demitido), o deslocado vai para o mercado.
export function swapUserClub(
  managers: Manager[], oldClubId: string | null, newClubId: string,
): Manager[] {
  return managers.map((m) => {
    if (m.isUser) return { ...m, clubId: newClubId };
    if (m.clubId === newClubId) return { ...m, clubId: oldClubId };
    return m;
  });
}
