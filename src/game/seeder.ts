import type { Club, GameState, Player, Position, Tier, Trait } from "../types";
import { mulberry32, randInt, chance, pick, type Rng } from "./rng";
import { playerName } from "./names";
import { buildLeagueFixtures, initTable } from "./schedule";
import { drawCup } from "./cup";
import { bestXI, DEFAULT_TACTICS } from "./engine";
import clubsData from "../data/clubs.json";

// Elenco base de 22: 3 GOL, 7 DEF, 7 MEI, 5 ATA
const SQUAD_SHAPE: Position[] = [
  "GOL", "GOL", "GOL",
  "DEF", "DEF", "DEF", "DEF", "DEF", "DEF", "DEF",
  "MEI", "MEI", "MEI", "MEI", "MEI", "MEI", "MEI",
  "ATA", "ATA", "ATA", "ATA", "ATA",
];

const TRAITS_BY_POS: Record<Position, Trait[]> = {
  GOL: ["Paredão", "Raçudo"],
  DEF: ["Raçudo", "Veloz", "Paredão"],
  MEI: ["Criativo", "Raçudo", "Veloz"],
  ATA: ["Goleador", "Veloz", "Criativo"],
};

// Sorteio de tier escalado pelo "poder" do clube (0 = lanterna da Série B,
// 1 = gigante da Série A, pelo ranking de orçamento dentro do país). Times ricos
// têm elencos visivelmente melhores: um gigante roda ~30% craque / 50% bom,
// enquanto o clube mais pobre roda ~2% craque / 75% bagre.
function rollTier(rng: Rng, power: number): Tier {
  const pCraque = 0.02 + 0.28 * power;
  const pBom = 0.23 + 0.27 * power;
  const r = rng();
  if (r < pCraque) return "craque";
  if (r < pCraque + pBom) return "bom";
  return "bagre";
}

function tierRanges(tier: Tier): { str: [number, number]; cap: number } {
  switch (tier) {
    case "bagre": return { str: [10, 20], cap: 25 };
    case "bom": return { str: [18, 30], cap: 38 };
    case "craque": return { str: [30, 42], cap: 46 };
    case "extra": return { str: [35, 44], cap: 50 };
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
  tier: Tier,
  idNum: number,
  young = false,
): Player {
  const { str, cap } = tierRanges(tier);
  const strength = young ? randInt(rng, 10, 15) : randInt(rng, str[0], str[1]);
  const age = young ? 17 : randInt(rng, 18, 34);
  const traits: Trait[] = chance(rng, tier === "bagre" ? 0.25 : 0.7)
    ? [pick(rng, TRAITS_BY_POS[pos])]
    : [];
  const p: Player = {
    id: `${clubId}_p${idNum}`,
    clubId,
    name: playerName(rng, country),
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
    SQUAD_SHAPE.forEach((pos) => {
      const tier = rollTier(rng, power.get(club.id) ?? 0.3);
      players.push(makePlayer(rng, club.id, club.country, pos, tier, ++n));
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
