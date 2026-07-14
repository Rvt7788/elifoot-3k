import type { Club, GameState, Player, Position, Tier, Trait, PendingPromotion, RetiredPlayerInfo } from "../types";
import { mulberry32, randInt, chance, pick, type Rng } from "./rng";
import { playerName } from "./names";
import { buildLeagueFixtures, initTable } from "./schedule";
import { drawCup, drawContinental } from "./cup";
import { bestXI, DEFAULT_TACTICS } from "./engine";
import clubsData from "../data/clubs.json";
import rostersData from "../data/rosters.json";
import continentalData from "../data/continental.json";

const rosters = rostersData as Record<string, Record<Position, string[]>>;

// Todo elenco carrega exatamente 3 goleiros: nunca faltam para escalar (1 titular
// + 2 reservas cobrem lesão/suspensão) e nunca sobram ocupando vaga de jogador de
// linha. Rosters reais podem listar mais, mas só os 3 melhores entram.
const MAX_GOALKEEPERS = 3;
const MIN_GOALKEEPERS = 3;
const MIN_LINE_PLAYERS_BY_POS = 5;
const LINE_POSITIONS: Position[] = ["DEF", "MEI", "ATA"];

// Cada elenco nasce com profundidade minima nas posicoes de linha. Isso impede
// saves em que uma formacao valida fica impossivel por falta de defensores,
// meias ou atacantes disponiveis no clube.
function squadShape(rng: Rng): Position[] {
  const base: Position[] = [
    ...Array.from({ length: MIN_GOALKEEPERS }, () => "GOL" as const),
    ...LINE_POSITIONS.flatMap((pos) => Array.from({ length: MIN_LINE_PLAYERS_BY_POS }, () => pos)),
  ];
  const extraSlots = randInt(rng, 0, 4);
  for (let i = 0; i < extraSlots; i++) base.push(pick(rng, LINE_POSITIONS));
  return base;
}

function selectPlayersFromRoster(
  rng: Rng,
  names: string[],
  count: number
): string[] {
  if (names.length <= count) {
    return names;
  }

  const parsed = names.map((raw) => {
    const m = raw.match(/^(.*):(\d{2})$/);
    const age = m ? parseInt(m[2], 10) : 25;
    return { raw, age };
  });

  const selected: typeof parsed = [];
  const pool = [...parsed];

  while (selected.length < count && pool.length > 0) {
    // Sorteio ponderado pelo quadrado da idade para priorizar veteranos
    // mas ainda dar chances reais para jovens
    const weights = pool.map((p) => Math.pow(p.age, 2));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let r = rng() * totalWeight;

    let selectedIndex = 0;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        selectedIndex = i;
        break;
      }
    }

    selected.push(pool[selectedIndex]);
    pool.splice(selectedIndex, 1);
  }

  return selected
    .sort((a, b) => b.age - a.age)
    .map((p) => p.raw);
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
export function targetStrength(division: string, power: number): number {
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
  // curva quadrática acentuada: cada ponto de força no topo encarece muito mais
  // que na base, então montar um elenco forte exige caixa de verdade
  const base = p.strength * p.strength * 1600;
  const ageFactor = p.age <= 23 ? 1.35 : p.age <= 29 ? 1.1 : p.age <= 32 ? 0.85 : 0.5;
  return Math.round((base * ageFactor) / 1000) * 1000;
}

// Salário semanal do jogador: fração do valor de mercado (quem vale mais, custa
// mais para manter). É a principal despesa do clube — elenco caro demais para a
// receita da divisão leva o caixa ao vermelho e, insistindo, à falência.
export function playerSalary(p: { strength: number; age: number }): number {
  return Math.max(300, Math.round((playerValue(p) * 0.006) / 100) * 100);
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
  realAge?: number,
): Player {
  // dispersão apertada em torno da média do time: titular e reserva têm que ser
  // PRÓXIMOS, não iguais — quem entra no XI é só um pouco melhor que o banco, e
  // não um abismo. Soma de dois randInt estreitos = curva concentrada no centro
  // (-4..+4), com cauda leve para revelação/reserva fraco em vez de -9..+9.
  const spread = randInt(rng, -2, 2) + randInt(rng, -2, 2);
  const strength = young
    ? Math.max(8, randInt(rng, Math.round(target * 0.4) - 2, Math.round(target * 0.4) + 3))
    : Math.max(8, Math.min(44, Math.round(target + spread)));
  const tier = rollTier(rng);
  // teto de evolução: parte da força atual + folga; craque tem mais talento a crescer
  const tierBonus = tier === "craque" ? randInt(rng, 6, 12) : tier === "bom" ? randInt(rng, 3, 7) : randInt(rng, 1, 4);
  const cap = young
    ? Math.min(50, Math.max(capFor(tier), strength + tierBonus + 5))
    : Math.min(50, Math.max(capFor(tier), strength + tierBonus));
  const age = young ? (realAge ?? (rng() < 0.5 ? 17 : 18)) : realAge ?? randInt(rng, 18, 34);
  const traits: Trait[] = chance(rng, tier === "bagre" ? 0.25 : 0.7)
    ? [pick(rng, TRAITS_BY_POS[pos])]
    : [];
  // Líder é raro e quase sempre veterano: o capitão natural do elenco. Rolagem à
  // parte das traits de posição — pode coexistir com qualquer outra.
  if (chance(rng, age >= 28 ? 0.10 : 0.02)) traits.push("Líder");
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
    yellowsLeague: 0,
    yellowsCup: 0,
    yellowsContinental: 0,
    suspendedLeague: false,
    suspendedCup: false,
    suspendedContinental: false,
    value: 0,
    xp: 0,
    gained: 0,
    training: "normal",
    foot: chance(rng, 0.25) ? "canhoto" : "destro",
    number: 0, // atribuído em bulk por clube depois que o elenco inteiro existe
    contract: young ? randInt(rng, 3, 4) : randInt(rng, 1, 4), // base assina longo; veterano pode estar no fim
    titles: 0,
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

// Número livre para quem chega ao elenco (contratação/promoção) sem mexer nos
// números de quem já está: tenta a faixa da posição e sobe até achar vaga.
export function freeShirtNumber(squad: Player[], pos: Position): number {
  const used = new Set(squad.map((p) => p.number));
  for (let n = NUMBER_RANGE[pos][0]; n <= 99; n++) if (!used.has(n)) return n;
  return 99;
}

// Trava contra número repetido: mantém quem tem número único e renumera só os
// duplicados/sem número, na faixa da posição.
export function fixDuplicateNumbers(squad: Player[]): void {
  const seen = new Set<number>();
  for (const p of squad) {
    if (!p.number || seen.has(p.number)) {
      const used = new Set(squad.filter((q) => q !== p).map((q) => q.number));
      for (const n of seen) used.add(n);
      let n = NUMBER_RANGE[p.pos][0];
      while (used.has(n)) n++;
      p.number = n;
    }
    seen.add(p.number);
  }
}

// Renumeração completa priorizando os titulares: eles pegam primeiro os números
// baixos da faixa de cada posição (goleiro titular = 1, zagueiros 2-6...); só
// depois os reservas recebem os números que sobraram, na mesma ordem de posição.
export function renumberSquadByStarters(squad: Player[], starterIds: string[]): void {
  const used = new Set<number>();
  const order: Record<Position, number> = { GOL: 0, DEF: 1, MEI: 2, ATA: 3 };
  const groups = [
    squad.filter((p) => starterIds.includes(p.id)),
    squad.filter((p) => !starterIds.includes(p.id)),
  ];
  for (const g of groups) {
    for (const p of [...g].sort((a, b) => order[a.pos] - order[b.pos] || b.strength - a.strength)) {
      let n = NUMBER_RANGE[p.pos][0];
      while (used.has(n)) n++;
      p.number = n;
      used.add(n);
    }
  }
}

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
    let shape: Position[] = [];
    if (roster) {
      const golNames = roster.GOL || [];
      const defNames = roster.DEF || [];
      const meiNames = roster.MEI || [];
      const ataNames = roster.ATA || [];

      const golCount = MAX_GOALKEEPERS; // sempre 3, mesmo que o roster liste mais
      const defCount = Math.max(MIN_LINE_PLAYERS_BY_POS, defNames.length);
      const meiCount = Math.max(MIN_LINE_PLAYERS_BY_POS, meiNames.length);
      const ataCount = Math.max(MIN_LINE_PLAYERS_BY_POS, ataNames.length);

      let g = golCount;
      let d = defCount;
      let m = meiCount;
      let a = ataCount;

      const maxSquadSize = 22;
      while (g + d + m + a > maxSquadSize) {
        let bestPos: Position | null = null;
        let excess = 0;

        if (g > MIN_GOALKEEPERS && (g - MIN_GOALKEEPERS) > excess) {
          bestPos = "GOL";
          excess = g - MIN_GOALKEEPERS;
        }
        if (d > MIN_LINE_PLAYERS_BY_POS && (d - MIN_LINE_PLAYERS_BY_POS) > excess) {
          bestPos = "DEF";
          excess = d - MIN_LINE_PLAYERS_BY_POS;
        }
        if (m > MIN_LINE_PLAYERS_BY_POS && (m - MIN_LINE_PLAYERS_BY_POS) > excess) {
          bestPos = "MEI";
          excess = m - MIN_LINE_PLAYERS_BY_POS;
        }
        if (a > MIN_LINE_PLAYERS_BY_POS && (a - MIN_LINE_PLAYERS_BY_POS) > excess) {
          bestPos = "ATA";
          excess = a - MIN_LINE_PLAYERS_BY_POS;
        }

        if (!bestPos) break;

        if (bestPos === "GOL") g--;
        else if (bestPos === "DEF") d--;
        else if (bestPos === "MEI") m--;
        else if (bestPos === "ATA") a--;
      }

      for (let i = 0; i < g; i++) shape.push("GOL");
      for (let i = 0; i < d; i++) shape.push("DEF");
      for (let i = 0; i < m; i++) shape.push("MEI");
      for (let i = 0; i < a; i++) shape.push("ATA");
    } else {
      shape = squadShape(rng);
    }

    const selectedRoster: Record<Position, string[]> = { GOL: [], DEF: [], MEI: [], ATA: [] };
    if (roster) {
      for (const pos of ["GOL", "DEF", "MEI", "ATA"] as Position[]) {
        const names = roster[pos] || [];
        const countForPos = shape.filter((x) => x === pos).length;
        selectedRoster[pos] = selectPlayersFromRoster(rng, names, countForPos);
      }
    }

    shape.forEach((pos) => {
      const names = selectedRoster[pos];
      const raw = names && used[pos] < names.length ? names[used[pos]++] : undefined;
      const m = raw?.match(/^(.*):(\d{2})$/);
      const realName = m ? m[1] : raw;
      const realAge = m ? parseInt(m[2], 10) : undefined;
      const p = makePlayer(rng, club.id, club.country, pos, target, ++n, false, realName, realAge);
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

// Curva suave de aposentadoria: sobe ano a ano sem virar certeza cedo — a maioria
// só pendura a chuteira entre 35 e 39, e ~5% dos jogadores de linha ainda chegam aos
// 42 (goleiros duram ~2 anos a mais). Só aos 43/45 a aposentadoria é compulsória.
const RETIRE_CHANCE = [0.005, 0.01, 0.02, 0.04, 0.08, 0.14, 0.22, 0.32, 0.45, 0.6, 0.78, 0.9]; // idades 31..42
export function rollRetirement(rng: Rng, pos: Position, age: number): boolean {
  if (age < 31) {
    return rng() < 0.001; // Aposentadoria precoce, bem rara (0.1%)
  }
  const effAge = pos === "GOL" ? age - 2 : age; // goleiro envelhece mais devagar
  if (effAge >= 43) return true;
  const p = RETIRE_CHANCE[Math.max(0, Math.min(RETIRE_CHANCE.length - 1, effAge - 31))];
  return rng() < p;
}

export function generateYouthOptions(
  rng: Rng,
  clubId: string,
  country: string,
  pos: Position,
  target: number,
  idNumStart: number
): Player[] {
  const options: Player[] = [];
  for (let i = 0; i < 4; i++) {
    const age = rng() < 0.5 ? 17 : 18;
    const p = makePlayer(rng, clubId, country, pos, target, idNumStart + i, true, undefined, age);
    // Temporary ID for candidate options
    p.id = `${clubId}_p_opt_${i}`;
    options.push(p);
  }
  return options;
}

export function processSeasonTransitions(
  rng: Rng,
  players: Player[],
  clubs: Club[],
  userClubId: string
): {
  updatedPlayers: Player[];
  pendingPromotions: PendingPromotion[];
  retiredLastSeason: RetiredPlayerInfo[];
  expiredContracts: string[]; // jogadores do usuário que saíram de graça (fim de contrato)
} {
  const activePlayers: Player[] = [];
  const pendingPromotions: PendingPromotion[] = [];
  const retiredLastSeason: RetiredPlayerInfo[] = [];
  const expiredContracts: string[] = [];

  const clubNameMap = new Map<string, string>();
  for (const c of clubs) clubNameMap.set(c.id, c.name);

  // Compute club target strength
  const power = new Map<string, number>();
  const byCountry = new Map<string, Club[]>();
  for (const c of clubs) byCountry.set(c.country, [...(byCountry.get(c.country) ?? []), c]);
  for (const list of byCountry.values()) {
    const sorted = [...list].sort((a, b) => a.baseBudget - b.baseBudget);
    sorted.forEach((c, i) => power.set(c.id, i / (sorted.length - 1)));
  }

  const clubTargets = new Map<string, number>();
  for (const c of clubs) {
    clubTargets.set(c.id, targetStrength(c.division, power.get(c.id) ?? 0.3));
  }

  // Track retirement per club
  const retirementsPerClub = new Map<string, { pos: Position; name: string; age: number }[]>();

  for (const p of players) {
    const nextAge = p.age + 1;
    if (rollRetirement(rng, p.pos, nextAge)) {
      retiredLastSeason.push({
        name: p.name,
        age: nextAge,
        clubName: clubNameMap.get(p.clubId) || p.clubId
      });
      const list = retirementsPerClub.get(p.clubId) || [];
      list.push({ pos: p.pos, name: p.name, age: nextAge });
      retirementsPerClub.set(p.clubId, list);
    } else {
      let strength = p.strength;
      let cap = p.cap;
      let loss = 0;
      if (p.pos === "GOL") {
        if (nextAge === 35 && rng() < 0.3) loss = 1;
        else if (nextAge === 36 && rng() < 0.5) loss = 1;
        else if (nextAge === 37 && rng() < 0.7) loss = 1;
        else if (nextAge >= 38) loss = rng() < 0.5 ? 1 : 2;
      } else {
        if (nextAge === 32 && rng() < 0.3) loss = 1;
        else if (nextAge === 33 && rng() < 0.5) loss = 1;
        else if (nextAge === 34 && rng() < 0.7) loss = 1;
        else if (nextAge >= 35) loss = rng() < 0.5 ? 1 : 2;
      }
      if (loss > 0) {
        strength = Math.max(1, strength - loss);
        cap = Math.min(cap, strength);
      }

      // contrato: queima 1 temporada; IA renova sozinha ao expirar. Jogador do
      // usuário com contrato zerado sai DE GRAÇA para outro clube do país — a
      // renovação tem que acontecer durante a temporada, na aba Elenco.
      let contract = (p.contract ?? 2) - 1;
      let clubId = p.clubId;
      if (contract <= 0) {
        if (p.clubId === userClubId) {
          const userCountry = clubs.find((c) => c.id === userClubId)?.country;
          const sameCountry = clubs.filter((c) => c.id !== userClubId && c.country === userCountry);
          const destinations = sameCountry.length > 0 ? sameCountry : clubs.filter((c) => c.id !== userClubId);
          if (destinations.length > 0) {
            clubId = destinations[Math.floor(rng() * destinations.length)].id;
            expiredContracts.push(p.name);
          }
          contract = Math.max(2, Math.round(2 + rng() * 2)); // contrato novo no destino
        } else {
          contract = Math.max(2, Math.round(2 + rng() * 2)); // IA renova por 2-4 anos
        }
      }

      const updatedP: Player = {
        ...p,
        clubId,
        contract,
        age: nextAge,
        strength,
        cap,
        gained: -loss, // valor negativo indica declínio na UI
        energy: 100,
        // gols/assistências da temporada zeram, mas somam no acumulado da carreira
        careerGoals: (p.careerGoals ?? 0) + p.goals,
        careerAssists: (p.careerAssists ?? 0) + p.assists,
        goals: 0,
        assists: 0,
        apps: 0,
        yellows: 0,
        reds: 0,
        yellowsLeague: 0,
        yellowsCup: 0,
        yellowsContinental: 0,
        suspendedLeague: false,
        suspendedCup: false,
        suspendedContinental: false
      };
      updatedP.value = playerValue(updatedP);
      activePlayers.push(updatedP);
    }
  }

  // Process replacement players
  for (const c of clubs) {
    const retired = retirementsPerClub.get(c.id) || [];
    if (retired.length === 0) continue;

    // maior sufixo de id com o PREFIXO deste clube em todo o universo: jogador
    // vendido leva o id do clube de origem junto, então olhar só o elenco atual
    // permitia recriar um id já existente em outro clube (colisão)
    let maxIdNum = 0;
    for (const p of activePlayers) {
      const match = p.id.match(/^(.*)_p(\d+)$/);
      if (match && match[1] === c.id) {
        const val = parseInt(match[2], 10);
        if (val > maxIdNum) maxIdNum = val;
      }
    }

    for (const r of retired) {
      const target = clubTargets.get(c.id) ?? 20;

      if (c.id === userClubId) {
        // User club: generate 4 candidate options
        const options = generateYouthOptions(rng, c.id, c.country, r.pos, target, maxIdNum + 1);
        pendingPromotions.push({
          position: r.pos,
          options
        });
        maxIdNum += 4;
      } else {
        // AI club: generate 4 options, pick the best one automatically
        const options = generateYouthOptions(rng, c.id, c.country, r.pos, target, maxIdNum + 1);
        options.sort((a, b) => b.strength - a.strength);
        const best = options[0];
        best.id = `${c.id}_p${maxIdNum + 1}`;
        activePlayers.push(best);
        maxIdNum += 1;
      }
    }

    // Reassign shirt numbers for AI squads
    if (c.id !== userClubId) {
      const updatedSquad = activePlayers.filter(p => p.clubId === c.id);
      assignShirtNumbers(updatedSquad);
    }
  }

  return {
    updatedPlayers: activePlayers,
    pendingPromotions,
    retiredLastSeason,
    expiredContracts
  };
}
