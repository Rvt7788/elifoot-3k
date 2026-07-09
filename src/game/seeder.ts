import type { Club, GameState, Player, Position, Tier, Trait } from "../types";
import { mulberry32, randInt, chance, pick, type Rng } from "./rng";
import { playerName } from "./names";
import { buildLeagueFixtures, initTable } from "./schedule";
import { drawCup, drawContinental } from "./cup";
import { bestXI, DEFAULT_TACTICS } from "./engine";
import clubsData from "../data/clubs.json";
import rostersData from "../data/rosters.json";
import continentalData from "../data/continental.json";

const rosters = rostersData as Record<string, Record<Position, string[]>>;

const MIN_GOALKEEPERS = 3;
const MIN_LINE_PLAYERS_BY_POS = 5;
const LINE_POSITIONS: Position[] = ["DEF", "MEI", "ATA"];

// Cada elenco nasce com profundidade m�nima nas posi��es de linha. Isso impede
// saves em que uma forma��o v�lida fica imposs�vel por falta de defensores,
// meias ou atacantes dispon�veis no clube.
function squadShape(rng: Rng): Position[] {
  const base: Position[] = [
    ...Array.from({ length: MIN_GOALKEEPERS }, () => "GOL" as const),
    ...LINE_POSITIONS.flatMap((pos) => Array.from({ length: MIN_LINE_PLAYERS_BY_POS }, () => pos)),
  ];
  const extraSlots = randInt(rng, 0, 4);
  for (let i = 0; i < extraSlots; i++) base.push(pick(rng, LINE_POSITIONS));
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

// Tier é só rótulo (badge de estrela / traço) e NÃO depende da força: craque é
// raridade, não "quem é forte". Assim um craque pode surgir em qualquer time e
// nem todo titular de Série A vira estrela. (extra é atribuído à parte.)
function rollTier(rng: Rng): Tier {
  const r = rng();
  if (r < 0.03) return "craque"; // ~3% ★★
  if (r < 0.15) return "bom"; // ~12% ★
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
  const tier = rollTier(rng);
  // teto de evolução: parte da força atual + folga; craque tem mais talento a crescer
  const tierBonus = tier === "craque" ? randInt(rng, 6, 12) : tier === "bom" ? randInt(rng, 3, 7) : randInt(rng, 1, 4);
  const cap = young ? 46 : Math.min(50, Math.max(capFor(tier), strength + tierBonus));
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
    suspendedLeague: false,
    suspendedCup: false,
    value: 0,
    xp: 0,
    gained: 0,
    training: "normal",
    foot: chance(rng, 0.25) ? "canhoto" : "destro",
    number: 0, // atribuído em bulk por clube depois que o elenco inteiro existe
  };
  p.value = playerValue(p);
  return p;
}

// Faixa clássica de numeração por posição — evita repetir dentro do mesmo elenco;
// estoura a faixa (elenco grande) cai pra frente sem colidir.
const NUMBER_RANGE: Record<Position, [number, number]> = {
  GOL: [1, 1],
  DEF: [2, 6],
  MEI: [7, 10],
  ATA: [9, 11],
};

export function assignShirtNumbers(squad: Player[]): void {
  const used = new Set<number>();
  const byPos: Record<Position, Player[]> = { GOL: [], DEF: [], MEI: [], ATA: [] };
  for (const p of squad) byPos[p.pos].push(p);
  (["GOL", "DEF", "MEI", "ATA"] as Position[]).forEach((pos) => {
    const [start] = NUMBER_RANGE[pos];
    let n = start;
    for (const p of byPos[pos].sort((a, b) => b.strength - a.strength)) {
      while (used.has(n)) n++;
      p.number = n;
      used.add(n);
      n++;
    }
  });
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
    const clubSquad: Player[] = [];
    squadShape(rng).forEach((pos) => {
      const names = roster?.[pos];
      const realName = names && used[pos] < names.length ? names[used[pos]++] : undefined;
      const p = makePlayer(rng, club.id, club.country, pos, target, ++n, false, realName);
      clubSquad.push(p);
      players.push(p);
    });
    assignShirtNumbers(clubSquad);
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
    continental: drawContinental(
      rng, clubs, userClubId,
      continentalData as unknown as Record<string, Record<string, string[]>>,
      // temporada 1 (sem tabela): os 4 maiores orçamentos da Série A do país
      countryClubs
        .filter((c) => c.division === "Série A")
        .sort((a, b) => b.baseBudget - a.baseBudget)
        .slice(0, 4)
        .map((c) => c.id),
    ),
  };
}
