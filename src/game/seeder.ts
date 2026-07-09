import type { Club, GameState, Player, Position, Tier, Trait } from "../types";
import { mulberry32, randInt, chance, pick, type Rng } from "./rng";
import { playerName } from "./names";
import { buildLeagueFixtures, initTable } from "./schedule";
import { drawCup } from "./cup";
import { bestXI, DEFAULT_TACTICS } from "./engine";
import clubsData from "../data/clubs.json";
import rostersData from "../data/rosters.json";

const rosters = rostersData as Record<string, Record<Position, string[]>>;

// Cada elenco tem um tamanho variável entre 16 e 22 jogadores, mantendo a
// proporção base 3 GOL / 7 DEF / 7 MEI / 5 ATA (22 titulares "cheios"); times
// menores cortam reservas nas posições de linha, nunca abaixo de 2 goleiros.
function squadShape(rng: Rng): Position[] {
  const size = randInt(rng, 16, 22);
  const base: Position[] = [
    "GOL", "GOL", "GOL",
    "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF",
    "MEI", "MEI", "MEI", "MEI", "MEI", "MEI", "MEI",
    "ATA", "ATA", "ATA", "ATA", "ATA",
  ];
  while (base.length > size) {
    // remove reservas de linha (nunca a última vaga de GOL, DEF, MEI ou ATA)
    const removable = (["DEF", "MEI", "ATA"] as const).filter(
      (pos) => base.filter((p) => p === pos).length > 2,
    );
    const posToCut = removable.length > 0 ? pick(rng, removable) : "DEF";
    base.splice(base.lastIndexOf(posToCut), 1);
  }
  return base;
}

const TRAITS_BY_POS: Record<Position, Trait[]> = {
  GOL: ["Paredão", "Raçudo"],
  DEF: ["Raçudo", "Veloz", "Paredão"],
  MEI: ["Criativo", "Raçudo", "Veloz"],
  ATA: ["Goleador", "Veloz", "Criativo"],
};

// Faixa de força média do elenco por divisão: dentro de cada divisão, o "poder"
// (percentil de orçamento no país) escala a média dentro da faixa — o lanterna
// da Série B mira ~17, o campeão ~23; na Série A vai de ~27 até ~38. Isso é o que
// determina o nível do time, não sorteio livre: um time fraco do mundo real tem
// elenco fraco, ponto — só cresce jogando/treinando (ver training.ts).
function targetStrength(division: string, power: number): number {
  return division === "Série A"
    ? 27 + power * 13 // 27 (pior da A) .. 40 (melhor da A)
    : 15 + power * 10; // 15 (pior da B) .. 25 (melhor da B)
}

// Tier é só rótulo (badge/traço), derivado da força final do jogador — não é
// mais ele quem decide a força.
function tierFromStrength(strength: number): Tier {
  if (strength >= 33) return "craque";
  if (strength >= 22) return "bom";
  return "bagre";
}

function capFor(tier: Tier): number {
  switch (tier) {
    case "bagre": return 25;
    case "bom": return 38;
    case "craque": return 46;
    case "extra": return 50;
  }
}

export function playerValue(p: { strength: number; age: number }): number {
  const base = p.strength * p.strength * 900;
  const ageFactor = p.age <= 23 ? 1.4 : p.age <= 28 ? 1.0 : p.age <= 32 ? 0.7 : 0.4;
  return Math.round((base * ageFactor) / 1000) * 1000;
}

export function makePlayer(
  rng: Rng,
  clubId: string,
  country: string,
  pos: Position,
  target: number,
  idNum: number,
  young = false,
  realName?: string,
): Player {
  // dispersão em torno da média do time: a maioria fica perto do nível do clube,
  // com cauda para cima (revelação) e para baixo (reserva fraco)
  const spread = randInt(rng, -6, 6) + randInt(rng, -3, 3);
  const strength = young
    ? randInt(rng, 10, 15)
    : Math.max(8, Math.min(44, Math.round(target + spread)));
  const tier = tierFromStrength(strength);
  const cap = young ? 46 : Math.max(capFor(tier), strength + randInt(rng, 2, 8));
  const age = young ? 17 : randInt(rng, 18, 34);
  const traits: Trait[] = chance(rng, tier === "bagre" ? 0.25 : 0.7)
    ? [pick(rng, TRAITS_BY_POS[pos])]
    : [];
  const p: Player = {
    id: `${clubId}_p${idNum}`,
    clubId,
    name: realName ?? playerName(rng, country),
    pos,
    age,
    strength,
    cap,
    tier,
    traits,
    energy: 100,
    goals: 0,
    assists: 0,
    yellows: 0,
    reds: 0,
    suspended: false,
    value: 0,
    xp: 0,
    gained: 0,
    training: "normal",
    foot: chance(rng, 0.25) ? "canhoto" : "destro",
  };
  p.value = playerValue(p);
  return p;
}

export function newGame(seed: number, userClubId: string): GameState {
  const rng = mulberry32(seed);
  const clubs = clubsData as Club[];
  const players: Player[] = [];

  // "poder" de cada clube: percentil de orçamento dentro do próprio país (0..1) —
  // como as faixas de orçamento das divisões não se sobrepõem, a Série A inteira
  // fica acima da Série B no ranking, com gradação também dentro de cada divisão
  const power = new Map<string, number>();
  const byCountry = new Map<string, Club[]>();
  for (const c of clubs) byCountry.set(c.country, [...(byCountry.get(c.country) ?? []), c]);
  for (const list of byCountry.values()) {
    const sorted = [...list].sort((a, b) => a.baseBudget - b.baseBudget);
    sorted.forEach((c, i) => power.set(c.id, i / (sorted.length - 1)));
  }

  let n = 0;
  for (const club of clubs) {
    const target = targetStrength(club.division, power.get(club.id) ?? 0.3);
    const roster = rosters[club.name];
    // cada posição consome os nomes reais pesquisados na ordem listada; quando
    // acabam (elenco real menor que o shape sorteado), cai no gerador procedural
    const used: Record<Position, number> = { GOL: 0, DEF: 0, MEI: 0, ATA: 0 };
    squadShape(rng).forEach((pos) => {
      const names = roster?.[pos];
      const realName = names && used[pos] < names.length ? names[used[pos]++] : undefined;
      players.push(makePlayer(rng, club.id, club.country, pos, target, ++n, false, realName));
    });
  }

  // Os 5 Extra-Classe do universo: sorteados entre clubes distintos
  const chosen = new Set<string>();
  while (chosen.size < 5) {
    const club = pick(rng, clubs);
    if (chosen.has(club.id)) continue;
    chosen.add(club.id);
    const candidates = players.filter(
      (p) => p.clubId === club.id && (p.pos === "MEI" || p.pos === "ATA"),
    );
    const star = pick(rng, candidates);
    star.tier = "extra";
    star.strength = randInt(rng, 35, 44);
    star.cap = 50;
    star.age = randInt(rng, 19, 27);
    star.value = playerValue(star);
  }

  const userClub = clubs.find((c) => c.id === userClubId)!;
  const countryClubs = clubs.filter((c) => c.country === userClub.country);
  const fixtures = buildLeagueFixtures(rng, countryClubs);

  const tables: GameState["tables"] = {};
  for (const div of ["Série A", "Série B"]) {
    tables[div] = initTable(countryClubs.filter((c) => c.division === div));
  }

  return {
    seed,
    season: 1,
    week: 1,
    userClubId,
    budget: userClub.baseBudget,
    starters: bestXI(players.filter((p) => p.clubId === userClubId), "4-4-2"),
    formation: "4-4-2",
    defaultTactics: { ...DEFAULT_TACTICS },
    clubs,
    players,
    fixtures,
    tables,
    cup: drawCup(
      rng,
      countryClubs.filter((c) => c.division === "Série A").map((c) => c.id),
      countryClubs.filter((c) => c.division === "Série B").map((c) => c.id),
    ),
  };
}
