import type {
  CustomFormation, Formation, LiveMatch, LivePlayer, Marking, MatchEvent, Mentality, Player, Position, Tactics,
} from "../types";
import { shapeOf } from "../types";
import { chance, pick, pickWeighted, randInt, type Rng } from "./rng";

export const DEFAULT_TACTICS: Tactics = {
  mentality: "equilibrado",
  marking: "frouxa",
  truculencia: false,
  cera: false,
  bicho: false,
  autoSub: false,
};

const MENTALITY_ATT: Record<Mentality, number> = {
  defensivo: 0.6,
  equilibrado: 1.0,
  ofensivo: 1.35,
  tudo_ou_nada: 1.75, // aposta tudo no ataque — o time mais decidido/arriscado do jogo
};

// "Tudo ou nada" também abre mão de parte da defesa em troca desse volume ofensivo
// (time joga com a linha alta, sem se preocupar em voltar): mais chance de sofrer gol.
const MENTALITY_DEF: Record<Mentality, number> = {
  defensivo: 1.15,
  equilibrado: 1.0,
  ofensivo: 0.95,
  tudo_ou_nada: 0.65,
};

// Marcação: mais apertada rende mais desarmes (bônus no volume) mas cansa mais rápido;
// leve poupa energia porém cede mais espaço ao adversário.
// "extrema" é a marcação de retranca total: segura resultado como nenhuma outra,
// mas o time se esgota muito mais rápido — insustentável por 90 minutos.
const MARKING_DRAIN: Record<Marking, number> = {
  leve: 0.8,
  frouxa: 1.0,
  apertada: 1.3,
  extrema: 1.9,
};
const MARKING_POWER: Record<Marking, number> = {
  leve: -3,
  frouxa: 0,
  apertada: 5,
  extrema: 9,
};

// Força efetiva em campo, por energia: curva gradual, não mais um corte abrupto.
// 100-70% de energia: força cheia. 70-20%: cai linearmente até 50% da força nominal.
// Abaixo de 20%: fica travado nesse piso de 50% (não zera, mas também não piora mais).
// Usada para decidir escalação e simulação — um jogador mais fraco mas descansado
// pode valer mais em campo do que um craque exausto.
export function energyFactor(energy: number): number {
  if (energy >= 70) return 1;
  if (energy <= 20) return 0.5;
  return 0.5 + ((energy - 20) / 50) * 0.5;
}

export function effectiveStrength(p: Player): number {
  return p.strength * energyFactor(p.energy);
}

// Suspensão vale só na mesma competição: vermelho na liga não tira o jogador
// da copa, e vice-versa.
function isSuspended(p: Player, competition: "league" | "cup" | "continental"): boolean {
  if (competition === "league") return p.suspendedLeague;
  if (competition === "cup") return p.suspendedCup;
  return p.suspendedContinental ?? false;
}

// Lesionado fica fora de qualquer competição até cumprir as rodadas de recuperação.
export function isInjured(p: Player): boolean {
  return (p.injuryWeeks ?? 0) > 0;
}

// Melhor XI por posição, respeitando a formação (1 GOL + DEF/MEI/ATA da formação).
// byEnergy=false ordena só pela força nominal (ignora cansaço); byEnergy=true usa a
// força efetiva em campo, considerando o corte de energia do motor de simulação.
export function bestXI(
  squad: Player[], formation: Formation = "4-4-2", byEnergy = false, competition: "league" | "cup" | "continental" = "league",
  custom?: CustomFormation,
): string[] {
  const shape = shapeOf(formation, custom);
  const rank = byEnergy ? effectiveStrength : (p: Player) => p.strength;
  const available = squad.filter((p) => !isSuspended(p, competition) && !isInjured(p));
  const byPos = (pos: Player["pos"], count: number) =>
    available
      .filter((p) => p.pos === pos)
      .sort((a, b) => rank(b) - rank(a) || b.strength - a.strength)
      .slice(0, count);
  const picked = [
    ...byPos("GOL", 1), ...byPos("DEF", shape.DEF), ...byPos("MEI", shape.MEI), ...byPos("ATA", shape.ATA),
  ];
  // Nunca escala com menos de 11: se alguma posição não tem gente suficiente
  // (suspensões, vendas), completa com os melhores restantes fora de posição.
  if (picked.length < 11) {
    const chosen = new Set(picked.map((p) => p.id));
    const rest = available
      .filter((p) => !chosen.has(p.id))
      .sort((a, b) => rank(b) - rank(a) || b.strength - a.strength);
    picked.push(...rest.slice(0, 11 - picked.length));
  }
  return picked.map((p) => p.id);
}

// Ordena uma linha (DEF/MEI/ATA) esquerda→direita encaixando cada jogador no seu
// melhor lado: canhotos à esquerda, destros à direita; jogadores de característica
// ofensiva de flanco (Veloz) puxam para as pontas. O centro fica com os demais.
function arrangeLine(players: Player[]): Player[] {
  const n = players.length;
  if (n < 2) return players;
  const mid = (n - 1) / 2;
  // pontuação de "quão à esquerda" o jogador deve ficar (menor = mais à esquerda)
  const laneScore = (p: Player) => {
    let s = p.foot === "canhoto" ? -1 : 1; // pé define o lado natural
    if (p.traits.includes("Veloz")) s *= 1.5; // veloz reforça a vocação de flanco
    return s;
  };
  // os mais "de flanco" ocupam as pontas; os neutros ficam no miolo
  const byFlank = [...players].sort((a, b) => Math.abs(laneScore(b)) - Math.abs(laneScore(a)));
  const slots: (Player | null)[] = new Array(n).fill(null);
  let left = 0;
  let right = n - 1;
  for (const p of byFlank) {
    const wantsLeft = laneScore(p) < 0;
    if (Math.abs(laneScore(p)) < 1e-9) break; // neutros preenchem o centro depois
    if (wantsLeft && left <= mid && slots[left] === null) slots[left++] = p;
    else if (!wantsLeft && right >= mid && slots[right] === null) slots[right--] = p;
    else if (left <= right) {
      // lado preferido cheio: cai na vaga livre mais próxima do centro
      if (Math.abs(left - mid) <= Math.abs(right - mid)) slots[left++] = p;
      else slots[right--] = p;
    }
  }
  // sobra (neutros) preenche o miolo restante, mantendo a força como desempate
  const placed = new Set(slots.filter(Boolean).map((p) => p!.id));
  const rest = players.filter((p) => !placed.has(p.id)).sort((a, b) => b.strength - a.strength);
  for (let i = 0; i < n && rest.length; i++) if (slots[i] === null) slots[i] = rest.shift()!;
  return slots.filter(Boolean) as Player[];
}

// Melhor XI encaixando cada jogador na função/lado ideal: mesma seleção do bestXI
// por força, mas cada linha é ordenada por pé/característica (canhoto à esquerda etc.).
// Retorna os titulares e a disposição esquerda→direita (slotOrder) para a prancheta.
export function bestXIByPosition(
  squad: Player[], formation: Formation = "4-4-2", competition: "league" | "cup" | "continental" = "league",
  custom?: CustomFormation,
): { starters: string[]; slotOrder: string[] } {
  const ids = bestXI(squad, formation, false, competition, custom);
  const byId = (id: string) => squad.find((p) => p.id === id)!;
  const line = (pos: Position) => arrangeLine(ids.map(byId).filter((p) => p.pos === pos));
  const ordered = [...line("GOL"), ...line("DEF"), ...line("MEI"), ...line("ATA")].map((p) => p.id);
  return { starters: ordered, slotOrder: ordered };
}

// Escalação: usa os titulares definidos pelo usuário (descontando suspensos) ou o melhor XI
export function pickLineup(
  squad: Player[],
  starterIds?: string[],
  competition: "league" | "cup" | "continental" = "league",
  formation: Formation = "4-4-2",
  custom?: CustomFormation,
  posOverrides?: Record<string, Position>,
): LivePlayer[] {
  const valid = starterIds?.filter(
    (id) => squad.some((p) => p.id === id && !isSuspended(p, competition) && !isInjured(p)),
  ) ?? [];
  const starters = new Set(valid.length === 11 ? valid : bestXI(squad, formation, false, competition, custom));
  const availableSquad = squad.filter((p) => !isInjured(p) && !isSuspended(p, competition));
  return availableSquad.map((p) => ({
    playerId: p.id,
    energy: p.energy,
    yellowsMatch: 0,
    sentOff: false,
    subbedOut: false,
    onField: starters.has(p.id),
    // escalação fora de posição definida na prancheta pré-jogo (MEI de ATA etc.)
    posOverride: starters.has(p.id) ? posOverrides?.[p.id] : undefined,
  }));
}

// Estratégia pré-jogo da IA: compara a força do próprio XI com a do adversário e
// entra em campo com postura coerente — nitidamente mais fraco recua e aperta a
// marcação; nitidamente mais forte propõe o jogo; parelho entra equilibrado.
export function aiPregameTactics(mySquad: Player[], oppSquad: Player[], aggression: number): Tactics {
  const xiStrength = (squad: Player[]) =>
    bestXI(squad).reduce((s, id) => s + (squad.find((p) => p.id === id)?.strength ?? 0), 0);
  const ratio = xiStrength(mySquad) / Math.max(1, xiStrength(oppSquad));
  const t: Tactics = { ...DEFAULT_TACTICS };
  if (ratio < 0.85) {
    t.mentality = "defensivo";
    t.marking = "apertada";
    // azarão agressivo aposta na truculência para compensar a diferença técnica
    if (aggression > 0.7) t.truculencia = true;
  } else if (ratio > 1.15) {
    t.mentality = "ofensivo";
  }
  return t;
}

export function createLiveMatch(
  homeId: string,
  awayId: string,
  homeSquad: Player[],
  awaySquad: Player[],
  homeStarters?: string[],
  awayStarters?: string[],
  homeDefaultTactics?: Tactics,
  awayDefaultTactics?: Tactics,
  homeAggression = 0.5,
  awayAggression = 0.5,
  homeSlotOrder?: string[],
  awaySlotOrder?: string[],
  competition: "league" | "cup" | "continental" = "league",
  homeFormation: Formation = "4-4-2",
  awayFormation: Formation = "4-4-2",
  homeCustomFormation?: CustomFormation,
  awayCustomFormation?: CustomFormation,
  homeMorale = 0.5,
  awayMorale = 0.5,
  homePosOverrides?: Record<string, Position>,
  awayPosOverrides?: Record<string, Position>,
): LiveMatch {
  return {
    homeMorale, awayMorale,
    competition,
    homeId, awayId,
    minute: 0, homeScore: 0, awayScore: 0,
    momentum: 0, dangerTime: 0,
    events: [],
    // lado sem táticas do usuário é IA: define a estratégia pré-jogo pelo elenco e adversário
    homeTactics: homeDefaultTactics
      ? { ...DEFAULT_TACTICS, ...homeDefaultTactics }
      : aiPregameTactics(homeSquad, awaySquad, homeAggression),
    awayTactics: awayDefaultTactics
      ? { ...DEFAULT_TACTICS, ...awayDefaultTactics }
      : aiPregameTactics(awaySquad, homeSquad, awayAggression),
    homeLineup: pickLineup(homeSquad, homeStarters, competition, homeFormation, homeCustomFormation, homePosOverrides),
    awayLineup: pickLineup(awaySquad, awayStarters, competition, awayFormation, awayCustomFormation, awayPosOverrides),
    homeSubsLeft: 5, awaySubsLeft: 5,
    finished: false,
    lastAiCheck: 0,
    aiFlash: false,
    swingSide: null,
    swingUntil: 0,
    homeAggression, awayAggression,
    homeSlotOrder: homeSlotOrder ? [...homeSlotOrder] : undefined,
    awaySlotOrder: awaySlotOrder ? [...awaySlotOrder] : undefined,
    stats: {
      home: { shots: 0, onTarget: 0, saves: 0, tackles: 0, interceptions: 0, poss: 0 },
      away: { shots: 0, onTarget: 0, saves: 0, tackles: 0, interceptions: 0, poss: 0 },
    },
  };
}

interface PlayersIndex { [id: string]: Player }

// Força efetiva em campo, com a energia da partida (LivePlayer) — mesma curva gradual.
function effStrength(p: Player, lp: LivePlayer): number {
  let s = p.strength * energyFactor(lp.energy);
  if (p.traits.includes("Raçudo")) s *= 1.12; // raçudo tem bônus de 12% na força efetiva por garra
  return s;
}

// Bônus de pé pelo lado do campo: numa linha (DEF/MEI/ATA), canhoto rende mais na
// metade esquerda e destro na direita; no lado trocado rende menos. Centro é neutro.
function footFactor(foot: Player["foot"], index: number, lineSize: number): number {
  if (lineSize < 2) return 1;
  const mid = (lineSize - 1) / 2;
  if (index === mid) return 1; // slot central exato (linhas ímpares)
  const side: "left" | "right" = index < mid ? "left" : "right";
  const matches = (foot === "canhoto") === (side === "left");
  return matches ? 1.05 : 0.95;
}

// Linha ordenada esquerda→direita: usa o slotOrder (disposição escolhida na prancheta);
// sem ele, a IA se organiza sozinha (canhotos à esquerda) e o time do usuário cai na
// mesma ordem por força exibida na prancheta.
function orderedLine(
  lineup: LivePlayer[], idx: PlayersIndex, pos: Player["pos"], slotOrder?: string[],
): LivePlayer[] {
  const onField = lineup.filter(
    (lp) => lp.onField && !lp.sentOff && (lp.posOverride ?? idx[lp.playerId].pos) === pos,
  );
  if (onField.some((lp) => lp.slotIdx !== undefined)) {
    return [...onField].sort((a, b) => (a.slotIdx ?? 0) - (b.slotIdx ?? 0));
  }
  if (slotOrder && slotOrder.length) {
    const rank = (id: string) => {
      const i = slotOrder.indexOf(id);
      return i < 0 ? Number.MAX_SAFE_INTEGER : i;
    };
    return [...onField].sort((a, b) => rank(a.playerId) - rank(b.playerId));
  }
  // IA: arruma os pés de forma ótima (canhotos primeiro = lado esquerdo)
  return [...onField].sort((a, b) => {
    const fa = idx[a.playerId].foot === "canhoto" ? 0 : 1;
    const fb = idx[b.playerId].foot === "canhoto" ? 0 : 1;
    return fa - fb;
  });
}

function sectorPower(
  lineup: LivePlayer[], idx: PlayersIndex, pos: Player["pos"], slotOrder?: string[],
): { total: number; energyAvg: number } {
  const onField = orderedLine(lineup, idx, pos, slotOrder);
  if (onField.length === 0) return { total: 1, energyAvg: 50 };
  const total = onField.reduce(
    (s, lp, i) =>
      s +
      effStrength(idx[lp.playerId], lp) *
        (pos === "GOL" ? 1 : footFactor(idx[lp.playerId].foot, i, onField.length)),
    0,
  );
  const energyAvg = onField.reduce((s, lp) => s + lp.energy, 0) / onField.length;
  return { total, energyAvg };
}

// Poder ofensivo bruto: (Meio-Campo × Energia) + (Ataque × Mentalidade), fórmula do GDD.
function attackPower(lineup: LivePlayer[], idx: PlayersIndex, t: Tactics, slotOrder?: string[]): number {
  const mid = sectorPower(lineup, idx, "MEI", slotOrder);
  const att = sectorPower(lineup, idx, "ATA", slotOrder);
  let power = mid.total * (mid.energyAvg / 100) + att.total * MENTALITY_ATT[t.mentality];
  if (t.truculencia) power += 8; // bônus pesado de desarme no volume
  // Bicho: motivação proporcional ao nível pago, com teto saudável de +10% —
  // acima disso o prêmio viraria botão de vitória. Saves antigos (sem pct) mantêm 10.
  if (t.bicho) power *= 1 + Math.min(10, Math.max(0, t.bichoPct ?? 10)) / 100;
  return power;
}

// Poder defensivo: setor DEF, também sensível à energia; goleiro entra como reforço leve.
// A marcação (leve/frouxa/apertada) soma ou tira volume de desarme.
function defensePower(lineup: LivePlayer[], idx: PlayersIndex, t: Tactics, slotOrder?: string[]): number {
  const def = sectorPower(lineup, idx, "DEF", slotOrder);
  const gk = sectorPower(lineup, idx, "GOL");
  return (def.total * (def.energyAvg / 100) + gk.total * 0.3 + MARKING_POWER[t.marking]) * MENTALITY_DEF[t.mentality];
}

// Poder líquido do time no confronto: ataque próprio reduzido pela defesa adversária,
// então mais defensores (formações como 5-3-2) seguram melhor o jogo e formações
// ofensivas (4-3-3, 3-5-2) sofrem mais atrás.
function teamPower(
  lineup: LivePlayer[], idx: PlayersIndex, t: Tactics, oppDefense: number, slotOrder?: string[],
): number {
  const atk = attackPower(lineup, idx, t, slotOrder);
  const defFactor = 140 / (140 + oppDefense); // defesa forte adversária reduz o volume
  return atk * defFactor;
}

function bestOnField(
  lineup: LivePlayer[], idx: PlayersIndex, pos: Player["pos"],
): Player | null {
  const cands = lineup.filter(
    (lp) => lp.onField && !lp.sentOff && (lp.posOverride ?? idx[lp.playerId].pos) === pos,
  );
  if (cands.length === 0) return null;
  return cands
    .map((lp) => ({
      ...idx[lp.playerId],
      pos: lp.posOverride ?? idx[lp.playerId].pos,
    }))
    .sort((a, b) => b.strength - a.strength)[0];
}

// Peso-base de finalização por posição: atacantes concentram os gols, meias chegam
// com frequência, zagueiros aparecem na bola parada e goleiro é lenda de fim de jogo.
const SHOT_WEIGHT: Record<Position, number> = {
  ATA: 1, MEI: 0.32, DEF: 0.09, GOL: 0.003,
};

// Mentalidade também empurra quem finaliza: time ofensivo joga mais pelos pontas/
// atacantes, defensivo se apoia mais no meio (contra-ataque) e na bola parada do DEF.
const MENTALITY_SHOT_TILT: Record<Mentality, Partial<Record<Position, number>>> = {
  ofensivo: { ATA: 1.25, MEI: 0.9 },
  equilibrado: {},
  defensivo: { ATA: 0.8, MEI: 1.15, DEF: 1.3 },
  tudo_ou_nada: { ATA: 1.45, MEI: 1.05 },
};

// Sorteia quem finaliza dentre todos em campo. O peso de cada jogador não é só
// a posição fixa: depende de quantos companheiros de setor estão em campo (a
// formação) — um 3-5-2 com 5 meias reparte mais chances de finalização entre
// eles; um 4-3-3 concentra mais no ataque — mais a mentalidade do time e uma
// dose de sorte (roll aleatório por jogador) para não ficar sempre previsível.
function pickStriker(
  rng: Rng, lineup: LivePlayer[], idx: PlayersIndex, mentality: Mentality,
  counter = false,
): Player | null {
  const onField = lineup
    .filter((lp) => lp.onField && !lp.sentOff)
    .map((lp) => ({
      ...idx[lp.playerId],
      pos: lp.posOverride ?? idx[lp.playerId].pos,
    }));
  if (onField.length === 0) return null;

  const countBySector: Partial<Record<Position, number>> = {};
  for (const p of onField) countBySector[p.pos] = (countBySector[p.pos] ?? 0) + 1;
  const tilt = MENTALITY_SHOT_TILT[mentality];

  return pickWeighted(rng, onField, (p) => {
    // formação: setor com mais gente em campo espalha (mas também soma) mais chances
    const sectorSize = countBySector[p.pos] ?? 1;
    const formationFactor = 0.6 + 0.4 * Math.min(sectorSize / 3, 1.5);
    const mentalityFactor = tilt[p.pos] ?? 1;
    const luck = 0.7 + rng() * 0.6; // 0.7x .. 1.3x — mesmo azarão tem seu momento
    // no contra-ataque quem dispara é o veloz; craque/extra pedem mais a bola
    const speedFactor = counter && p.traits.includes("Veloz") ? 1.8 : 1;
    const tierFactor = p.tier === "extra" ? 1.25 : p.tier === "craque" ? 1.12 : 1;
    return p.strength ** 2 * SHOT_WEIGHT[p.pos] * formationFactor * mentalityFactor * luck * speedFactor * tierFactor;
  });
}

function randomOnField(rng: Rng, lineup: LivePlayer[], idx: PlayersIndex): Player {
  const cands = lineup.filter((lp) => lp.onField && !lp.sentOff);
  return idx[pick(rng, cands).playerId];
}

// Contagem de jogadores em campo por setor efetivo (posOverride conta).
function countSector(lineup: LivePlayer[], idx: PlayersIndex, pos: Position): number {
  return lineup.filter(
    (lp) => lp.onField && !lp.sentOff && (lp.posOverride ?? idx[lp.playerId].pos) === pos,
  ).length;
}

function tryShot(
  rng: Rng, m: LiveMatch, idx: PlayersIndex, side: "home" | "away",
  counter = false,
) {
  const atkLineup = side === "home" ? m.homeLineup : m.awayLineup;
  const defLineup = side === "home" ? m.awayLineup : m.homeLineup;
  const atkTactics = side === "home" ? m.homeTactics : m.awayTactics;
  const defTactics = side === "home" ? m.awayTactics : m.homeTactics;
  const striker = pickStriker(rng, atkLineup, idx, atkTactics.mentality, counter);
  const keeper = bestOnField(defLineup, idx, "GOL");
  const bestDef = bestOnField(defLineup, idx, "DEF");
  if (!striker) return;
  const atkStats = m.stats?.[side];
  const defStats = m.stats?.[side === "home" ? "away" : "home"];
  if (atkStats) atkStats.shots++;
  // "tudo ou nada" mexe na CONVERSÃO, não só no volume: quem ataca com tudo
  // finaliza melhor (todo mundo no ataque), e quem defende nessa mentalidade
  // está com a linha lá na frente — o goleiro fica exposto ao 1×1.
  // Determina assistente em potencial antes de calcular o chute para aplicar bônus do Criativo
  let assistantLp: LivePlayer | undefined = undefined;
  if (chance(rng, 0.65)) {
    const mates = atkLineup.filter(
      (lp) =>
        lp.onField && !lp.sentOff &&
        idx[lp.playerId].id !== striker.id &&
        ((lp.posOverride ?? idx[lp.playerId].pos) === "MEI" || (lp.posOverride ?? idx[lp.playerId].pos) === "ATA"),
    );
    if (mates.length > 0) {
      // Criativo é o garçom do time: peso dobrado na escolha de quem dá o passe
      assistantLp = pickWeighted(rng, mates, (lp) =>
        idx[lp.playerId].traits.includes("Criativo") ? 2 : 1,
      );
    }
  }

  let atk = striker.strength * (striker.traits.includes("Goleador") ? 1.25 : 1);
  if (assistantLp && idx[assistantLp.playerId].traits.includes("Criativo")) {
    atk *= 1.15; // passe criativo dá bônus de 15% na finalização
  }
  // estrelinha decide chance difícil: craque e extra convertem melhor que a força crua
  if (striker.tier === "extra") atk *= 1.18;
  else if (striker.tier === "craque") atk *= 1.1;
  // contra-ataque pega a defesa aberta; Veloz dispara em velocidade e finaliza no espaço
  if (counter) atk *= striker.traits.includes("Veloz") ? 1.3 : 1.12;

  if (atkTactics.mentality === "tudo_ou_nada") atk *= 1.2;
  // confiança: moral alta melhora a frieza na conclusão, moral baixa trava a perna —
  // é o que transforma domínio em resultado nos jogos apertados
  const atkMorale = (side === "home" ? m.homeMorale : m.awayMorale) ?? 0.5;
  atk *= 1 + Math.max(-0.1, Math.min(0.11, (atkMorale - 0.5) * 0.25));
  // O goleiro é o dono do resultado apertado: peso maior que antes, Paredão segura
  // o empate sozinho; o último defensor ajuda menos que o goleiro.
  let gk = (keeper?.strength ?? 5) * 1.15 * (keeper?.traits.includes("Paredão") ? 1.3 : 1);
  gk += (bestDef?.strength ?? 5) * 0.35;
  // Vantagem numérica na defesa: cada defensor a mais que os atacantes do rival
  // fecha espaço de verdade (5 DEF × ataque de 2-3 neutraliza chance); em contra-
  // ataque a linha está desarrumada e o bônus numérico não vale.
  if (!counter) {
    const nDef = countSector(defLineup, idx, "DEF");
    const nAtk = countSector(atkLineup, idx, "ATA");
    gk *= 1 + Math.max(-0.21, Math.min(0.3, 0.08 * (nDef - nAtk)));
  }
  // marcação dura estraga a finalização; leve dá espaço
  if (defTactics.marking === "extrema") gk *= 1.12;
  else if (defTactics.marking === "apertada") gk *= 1.05;
  else if (defTactics.marking === "leve") gk *= 0.94;
  if (defTactics.mentality === "tudo_ou_nada") gk *= 0.7;
  const pGoal = Math.min(0.6, Math.max(0.05, (atk / (atk + gk)) * 0.5));
  if (chance(rng, pGoal)) {
    if (atkStats) atkStats.onTarget++; // gol conta como chute no alvo
    if (side === "home") m.homeScore++;
    else m.awayScore++;
    // pickStriker retorna uma cópia (pos ajustada pelo posOverride) — o gol tem
    // que ser gravado no jogador real do índice, senão o contador se perde
    idx[striker.id].goals++;
    m.events.push({ minute: m.minute, type: "goal", side, playerName: striker.name });
    if (assistantLp) {
      idx[assistantLp.playerId].assists++;
    }
    m.momentum = 0;
    m.dangerTime = 0;
    // quem sofreu o gol fica desorganizado nos minutos seguintes
    const conceded = side === "home" ? "away" : "home";
    m.swingSide = conceded;
    m.swingUntil = m.minute + randInt(rng, 4, 8);
  } else if (chance(rng, 0.55)) {
    // não foi gol mas foi na direção do gol: defesa do goleiro
    if (atkStats) atkStats.onTarget++;
    if (defStats) defStats.saves++;
  }
}

// Cartão vermelho, direto ou por acúmulo de 2 amarelos na partida: marca expulsão
// e suspensão automática para a próxima rodada.
function sendOff(m: LiveMatch, side: "home" | "away", player: Player, lp: LivePlayer) {
  player.reds++;
  if (m.competition === "cup") player.suspendedCup = true;
  else if (m.competition === "continental") player.suspendedContinental = true;
  else player.suspendedLeague = true;
  lp.sentOff = true;
  m.events.push({ minute: m.minute, type: "red", side, playerName: player.name });
}

function tryCards(rng: Rng, m: LiveMatch, idx: PlayersIndex, side: "home" | "away") {
  const t = side === "home" ? m.homeTactics : m.awayTactics;
  const lineup = side === "home" ? m.homeLineup : m.awayLineup;
  let pCard = 0.006;
  if (t.truculencia) pCard *= 3;
  if (t.cera) pCard *= 1.5;
  if (t.marking === "apertada") pCard *= 1.4;
  else if (t.marking === "extrema") pCard *= 1.9; // retranca no limite da falta
  else if (t.marking === "leve") pCard *= 0.7;
  if (!chance(rng, pCard)) return;
  const player = randomOnField(rng, lineup, idx);
  const lp = lineup.find((l) => l.playerId === player.id)!;
  if (chance(rng, 0.08)) {
    // vermelho direto
    sendOff(m, side, player, lp);
    return;
  }
  player.yellows++;
  lp.yellowsMatch++;
  m.events.push({ minute: m.minute, type: "yellow", side, playerName: player.name });

  if (m.competition === "cup") {
    player.yellowsCup = (player.yellowsCup ?? 0) + 1;
    if (player.yellowsCup % 3 === 0) {
      player.suspendedCup = true;
    }
  } else if (m.competition === "continental") {
    player.yellowsContinental = (player.yellowsContinental ?? 0) + 1;
    if (player.yellowsContinental % 3 === 0) {
      player.suspendedContinental = true;
    }
  } else {
    player.yellowsLeague = (player.yellowsLeague ?? 0) + 1;
    if (player.yellowsLeague % 3 === 0) {
      player.suspendedLeague = true;
    }
  }

  if (lp.yellowsMatch >= 2) {
    // 2º amarelo na mesma partida: vermelho automático
    sendOff(m, side, player, lp);
  }
}

// Regra do goleiro único: só pode haver 1 GOL em campo por vez.
// - GOL sai → só pode entrar outro GOL (reposição normal).
// - Jogador de linha sai → só pode entrar outro jogador de linha,
//   EXCETO se não houver nenhum goleiro em campo (titular expulso):
//   nesse caso um jogador de linha pode sair para um goleiro reserva entrar.
function goalkeeperRuleOk(
  lineup: LivePlayer[], idx: PlayersIndex, outPos: string, inPos: string,
): boolean {
  if (outPos === "GOL" && inPos !== "GOL") return false; // ficaria sem goleiro
  if (outPos !== "GOL" && inPos === "GOL") {
    const hasKeeperOnField = lineup.some(
      (l) => l.onField && !l.sentOff && (l.posOverride ?? idx[l.playerId].pos) === "GOL",
    );
    return !hasKeeperOnField; // só permite se o time está sem goleiro em campo
  }
  return true;
}

export function makeSub(
  m: LiveMatch, idx: PlayersIndex, side: "home" | "away",
  outId: string, inId: string,
): boolean {
  const lineup = side === "home" ? m.homeLineup : m.awayLineup;
  const subsLeft = side === "home" ? m.homeSubsLeft : m.awaySubsLeft;
  if (subsLeft <= 0) return false;
  const out = lineup.find((l) => l.playerId === outId);
  const inn = lineup.find((l) => l.playerId === inId);
  if (!out?.onField || !inn || inn.onField || inn.subbedOut || inn.sentOff) return false;
  const outPos = out.posOverride ?? idx[outId].pos;
  const inPos = inn.posOverride ?? idx[inId].pos;
  if (!goalkeeperRuleOk(lineup, idx, outPos, inPos)) return false;
  out.onField = false;
  out.subbedOut = true;
  inn.onField = true;
  inn.subbedIn = true;
  inn.slotIdx = out.slotIdx;
  inn.posOverride = out.posOverride;
  // quem entra herda o lugar (lado do campo) de quem saiu no bônus de pé
  const order = side === "home" ? m.homeSlotOrder : m.awaySlotOrder;
  if (order) {
    const i = order.indexOf(outId);
    if (i >= 0) order[i] = inId;
  }
  if (side === "home") m.homeSubsLeft--;
  else m.awaySubsLeft--;
  m.events.push({ minute: m.minute, type: "sub", side, playerName: idx[inId].name });
  return true;
}

// Substituição por cansaço: tira o jogador de linha mais gasto (energia < 55) e põe
// um reserva descansado da mesma posição. Usada pela IA e pelo piloto automático do usuário.
export function fatigueSub(m: LiveMatch, idx: PlayersIndex, side: "home" | "away"): boolean {
  const lineup = side === "home" ? m.homeLineup : m.awayLineup;
  const tired = lineup
    .filter((l) => l.onField && !l.sentOff && l.energy < 55 && idx[l.playerId].pos !== "GOL")
    .sort((a, b) => a.energy - b.energy)[0];
  if (!tired) return false;
  const pos = idx[tired.playerId].pos;
  const fresh = lineup
    .filter((l) => !l.onField && !l.subbedOut && !l.sentOff && idx[l.playerId].pos === pos && l.energy > 70)
    .sort((a, b) => idx[b.playerId].strength - idx[a.playerId].strength || b.energy - a.energy)[0];
  if (!fresh) return false;

  // Inteligência de substituição: se o substituto for muito inferior ao titular cansado
  // (diferença maior que 15 pontos), só substitui se a energia do titular estiver crítica (< 40).
  const tiredStrength = idx[tired.playerId].strength;
  const freshStrength = idx[fresh.playerId].strength;
  if (tiredStrength - freshStrength > 15 && tired.energy >= 40) {
    return false;
  }

  return makeSub(m, idx, side, tired.playerId, fresh.playerId);
}

// Troca um jogador de DEF por um de ATA do banco (sacrifica solidez por gás ofensivo) —
// jogada de "tudo ou nada" que só faz sentido para IA agressiva perdendo o jogo.
function pushForward(m: LiveMatch, idx: PlayersIndex, side: "home" | "away", lineup: LivePlayer[]): boolean {
  const freshAttacker = lineup
    .filter((l) => !l.onField && !l.subbedOut && !l.sentOff && idx[l.playerId].pos === "ATA")
    .sort((a, b) => b.energy - a.energy)[0];
  const weakestDef = lineup
    .filter((l) => l.onField && !l.sentOff && idx[l.playerId].pos === "DEF")
    .sort((a, b) => idx[a.playerId].strength - idx[b.playerId].strength)[0];
  if (!freshAttacker || !weakestDef) return false;
  return makeSub(m, idx, side, weakestDef.playerId, freshAttacker.playerId);
}

// IA reativa com personalidade: cada clube tem uma agressividade (0-1) definida pela
// posição na tabela (times em crise arriscam mais, líderes protegem o resultado).
// Isso faz a IA reagir de forma diferente ao mesmo placar dependendo de quem ela é.
function aiThink(rng: Rng, m: LiveMatch, idx: PlayersIndex, side: "home" | "away") {
  const t = side === "home" ? m.homeTactics : m.awayTactics;
  const aggression = side === "home" ? m.homeAggression : m.awayAggression;
  const myMomentum = side === "home" ? m.momentum : -m.momentum;
  const myScore = side === "home" ? m.homeScore : m.awayScore;
  const oppScore = side === "home" ? m.awayScore : m.homeScore;
  const lineup = side === "home" ? m.homeLineup : m.awayLineup;
  let changed = false;

  const losing = myScore < oppScore;
  const winning = myScore > oppScore;
  const drawing = myScore === oppScore;

  if (myMomentum < -55 && t.mentality !== "defensivo" && rng() > aggression * 0.5) {
    // sendo amassado: time conservador recua; time agressivo aguenta e aposta na truculência
    if (chance(rng, 0.6 - aggression * 0.3)) t.mentality = "defensivo";
    else t.truculencia = true;
    changed = true;
  } else if (losing && m.minute >= 70 - aggression * 15) {
    // Total ao Ataque + atacantes frescos: times agressivos arriscam mais cedo
    t.mentality = aggression > 0.75 && m.minute >= 85 ? "tudo_ou_nada" : "ofensivo";
    t.truculencia = false;
    t.marking = "apertada"; // pressiona a saída de bola para recuperar rápido
    // acima de 0.7 de agressividade e faltando pouco, sacrifica um defensor por atacante
    if (aggression > 0.7 && m.minute >= 80) {
      changed = pushForward(m, idx, side, lineup) || changed;
    } else {
      const bench = lineup.filter(
        (l) => !l.onField && !l.subbedOut && !l.sentOff && idx[l.playerId].pos === "ATA" && l.energy > 80,
      );
      const tiredMid = lineup
        .filter((l) => l.onField && !l.sentOff && idx[l.playerId].pos !== "GOL")
        .sort((a, b) => a.energy - b.energy);
      if (bench.length > 0 && tiredMid.length > 0)
        makeSub(m, idx, side, tiredMid[0].playerId, bench[0].playerId);
    }
    changed = true;
  } else if (winning && m.minute >= 75 + aggression * 10 && !t.cera) {
    // segurar o resultado: times conservadores fecham mais cedo, agressivos demoram a recuar
    t.cera = true;
    t.mentality = "defensivo";
    // reta final segurando por 1 gol: retranca total (marcação extrema) e, se o time
    // é truculento por natureza, entra a faca também
    t.marking = m.minute >= 85 && myScore - oppScore === 1 ? "extrema" : "apertada";
    if (aggression > 0.7 && m.minute >= 85) t.truculencia = true;
    changed = true;
  } else if (drawing && m.minute >= 80 && aggression > 0.6 && rng() < 0.4) {
    // empate não serve para quem precisa da vitória: arrisca no fim
    t.mentality = "ofensivo";
    changed = true;
  } else {
    // troca por cansaço
    const tired = lineup.find(
      (l) => l.onField && !l.sentOff && l.energy < 55 && idx[l.playerId].pos !== "GOL",
    );
    if (tired) {
      const pos = idx[tired.playerId].pos;
      const fresh = lineup.find(
        (l) => !l.onField && !l.subbedOut && !l.sentOff && idx[l.playerId].pos === pos,
      );
      if (fresh && makeSub(m, idx, side, tired.playerId, fresh.playerId)) changed = true;
    }
  }
  if (changed) m.aiFlash = true;
}

export function simulateMinute(
  rng: Rng, m: LiveMatch, idx: PlayersIndex, userSide: "home" | "away" | null,
) {
  if (m.finished) return;
  m.minute++;
  m.aiFlash = false;

  // intervalo: todos recuperam um pouco de gás no vestiário (30% do que falta até 100)
  if (m.minute === 46) {
    for (const lineup of [m.homeLineup, m.awayLineup])
      for (const lp of lineup)
        if (!lp.sentOff) lp.energy = Math.min(100, lp.energy + (100 - lp.energy) * 0.3);
  }

  // energia: quem está em campo gasta ~0.55/min (mais se ofensivo, truculento ou com marcação apertada)
  for (const [lineup, t] of [
    [m.homeLineup, m.homeTactics],
    [m.awayLineup, m.awayTactics],
  ] as const) {
    const drain =
      0.55 *
      (t.mentality === "ofensivo" ? 1.2 : t.mentality === "tudo_ou_nada" ? 1.35 : 1) *
      (t.truculencia ? 1.15 : 1) *
      MARKING_DRAIN[t.marking];
    for (const lp of lineup) {
      if (lp.onField && !lp.sentOff) {
        let playerDrain = drain;
        if (idx[lp.playerId]?.traits.includes("Raçudo")) {
          playerDrain *= 0.7; // raçudo tem 30% mais resistência física e cansa menos
        }
        lp.energy = Math.max(0, lp.energy - playerDrain);
      }
    }
  }

  // deslocamento da barra de momentum: ataque de cada lado é freado pela defesa do outro.
  // A diferença de poder (formação, tática, escalação, energia) agora pesa mais que o
  // ruído aleatório — decisões do jogador e da IA se refletem de verdade no placar,
  // mas o ruído continua alto o bastante para permitir zebra e jogo imprevisível.
  const homeDef = defensePower(m.homeLineup, idx, m.homeTactics, m.homeSlotOrder);
  const awayDef = defensePower(m.awayLineup, idx, m.awayTactics, m.awaySlotOrder);
  // moral (0..1): neutra entre 40% e 60%; melhora gradualmente acima de 60% (até +10%);
  // piora gradualmente abaixo de 40% (até -10%).
  const moraleBoost = (mor: number | undefined) => {
    const morale = Math.round((mor ?? 0.6) * 100);
    if (morale > 60) {
      const pct = (morale - 60) / 35; // 0..1 de 60 a 95
      return 1.0 + 0.10 * pct;
    } else if (morale < 40) {
      const pct = (40 - morale) / 30; // 0..1 de 40 a 10
      return 1.0 - 0.10 * pct;
    } else {
      return 1.0;
    }
  };
  // Mando de campo de verdade: a casa vale ~×1,32 no poder, e a moral do mandante
  // amplia ou encolhe esse empurrão da torcida — moral alta chega perto de ×1,50,
  // moral no chão derruba para ~×1,18. Fora de casa a moral só mexe no próprio time.
  const homeMoraleN = m.homeMorale ?? 0.6;
  const homeAdv =
    1.35 +
    (homeMoraleN > 0.6 ? 0.16 * Math.min(1, (homeMoraleN - 0.6) / 0.35)
      : homeMoraleN < 0.4 ? -0.16 * Math.min(1, (0.4 - homeMoraleN) / 0.3)
      : 0);
  const hp = teamPower(m.homeLineup, idx, m.homeTactics, awayDef, m.homeSlotOrder) * homeAdv * moraleBoost(m.homeMorale);
  const ap = teamPower(m.awayLineup, idx, m.awayTactics, homeDef, m.awaySlotOrder) * moraleBoost(m.awayMorale);
  let delta = ((hp - ap) / (hp + ap)) * 34 + (rng() - 0.5) * 18;
  // "cera" do lado que trava: barra tende ao zero e adversário ganha volume sutil
  if (m.homeTactics.cera) delta = delta * 0.5 - 1.5;
  if (m.awayTactics.cera) delta = delta * 0.5 + 1.5;
  if (m.homeTactics.mentality === "defensivo") delta *= m.momentum > 0 ? 0.5 : 0.85;
  if (m.awayTactics.mentality === "defensivo") delta *= m.momentum < 0 ? 0.5 : 0.85;
  // swing pós-gol: quem sofreu o gol fica desorganizado por alguns minutos, cedendo
  // mais volume ao adversário — cria uma janela de pressão real após cada gol.
  if (m.swingSide && m.minute < m.swingUntil) {
    delta += m.swingSide === "home" ? -6 : 6;
  } else if (m.swingSide && m.minute >= m.swingUntil) {
    m.swingSide = null;
  }
  m.momentum = Math.max(-100, Math.min(100, m.momentum + delta));

  // posse de bola real: acumula a fração do minuto conforme o momentum, com teto —
  // nem o maior domínio passa de ~78% num minuto; a % final é a média do jogo todo,
  // não a foto do momentum no apito final.
  if (m.stats) {
    const share = Math.max(0.22, Math.min(0.78, 0.5 + m.momentum / 280));
    m.stats.home.poss += share;
    m.stats.away.poss += 1 - share;

    // desarmes e interceptações: quem está sendo pressionado defende mais; marcação
    // mais dura desarma mais (é para isso que ela existe), mentalidade defensiva
    // fecha linhas de passe e intercepta mais.
    const defendLoad = (sideMom: number) => Math.max(0, sideMom) / 100; // 0..1 pressão sofrida
    ([["home", -m.momentum, m.homeTactics], ["away", m.momentum, m.awayTactics]] as const).forEach(
      ([s, pressure, t]) => {
        const st = m.stats![s];
        const markFactor =
          t.marking === "extrema" ? 1.7 : t.marking === "apertada" ? 1.35 : t.marking === "leve" ? 0.75 : 1;
        if (chance(rng, (0.10 + 0.16 * defendLoad(pressure)) * markFactor)) st.tackles++;
        const mentFactor = t.mentality === "defensivo" ? 1.35 : t.mentality === "tudo_ou_nada" ? 0.7 : 1;
        if (chance(rng, (0.08 + 0.12 * defendLoad(pressure)) * mentFactor)) st.interceptions++;
      },
    );
  }

  // ── criação de chances: contínua, proporcional ao domínio ──
  // Cada lado pode finalizar em QUALQUER minuto: a probabilidade cresce com a
  // fatia de poder no jogo (share^1.7 — dominar muito rende muito mais chute),
  // com a mentalidade (volume) e com os criativos do meio. Não existe mais trava
  // de momentum: o time da casa mais forte pressiona e finaliza o jogo inteiro,
  // e goleada é consequência natural.
  const MENTALITY_VOLUME: Record<Mentality, number> = {
    defensivo: 0.65, equilibrado: 1.0, ofensivo: 1.3, tudo_ou_nada: 1.55,
  };
  const shotProb = (side: "home" | "away"): number => {
    const myPower = side === "home" ? hp : ap;
    const share = myPower / (hp + ap);
    const t = side === "home" ? m.homeTactics : m.awayTactics;
    const opp = side === "home" ? m.awayTactics : m.homeTactics;
    const lineup = side === "home" ? m.homeLineup : m.awayLineup;
    const oppLineup = side === "home" ? m.awayLineup : m.homeLineup;
    let p = 0.24 * Math.pow(share, 1.7) * MENTALITY_VOLUME[t.mentality];
    // postura defensiva do rival corta o VOLUME de chances, não só a conversão:
    // bloco baixo tira espaço; marcação dura mata a jogada antes do chute
    if (opp.mentality === "defensivo") p *= 0.82;
    if (opp.marking === "extrema") p *= 0.85;
    else if (opp.marking === "apertada") p *= 0.93;
    else if (opp.marking === "leve") p *= 1.06;
    // rival com a linha lá na frente deixa espaço: atacar contra tudo-ou-nada rende
    if (opp.mentality === "tudo_ou_nada") p *= 1.3;
    else if (opp.mentality === "ofensivo") p *= 1.08;
    // superioridade numérica na defesa rival (5 DEF x 2-3 ATA) abafa a criação
    const nDefOpp = countSector(oppLineup, idx, "DEF");
    const nAtkMine = countSector(lineup, idx, "ATA");
    if (nDefOpp > nAtkMine) p *= Math.max(0.85, 1 - 0.04 * (nDefOpp - nAtkMine));
    // criativos fabricam chances do nada (meio e ataque)
    const nCriativo = lineup.filter(
      (lp) => lp.onField && !lp.sentOff && idx[lp.playerId].traits.includes("Criativo") &&
        (lp.posOverride ?? idx[lp.playerId].pos) !== "GOL",
    ).length;
    p *= 1 + 0.06 * nCriativo;
    // truculência do rival quebra o ritmo e corta a criação (não é só cartão)
    if (opp.truculencia) p *= 0.85;
    // catimba esfria o jogo: a própria cera corta mais o rival do que a si mesmo
    if (t.cera) p *= 0.8;
    if (opp.cera) p *= 0.85;
    // swing pós-gol: quem sofreu está desorganizado e cria menos
    if (m.swingSide === side && m.minute < m.swingUntil) p *= 0.6;
    return Math.min(0.3, p);
  };
  if (chance(rng, shotProb("home"))) tryShot(rng, m, idx, "home");
  if (!m.finished && chance(rng, shotProb("away"))) tryShot(rng, m, idx, "away");

  // ── contra-ataque: a arma de quem cede o jogo ──
  // O time SEM a bola (share baixa) tem chance de contragolpe: cresce se joga
  // fechado (defensivo espera para sair no contra), com Veloz no ataque/meio, e
  // se o rival está no tudo-ou-nada com a linha lá na frente. É a única forma do
  // time fraco retrancado matar o jogo — mas não pune quem apenas propõe o jogo.
  for (const side of ["home", "away"] as const) {
    const myPower = side === "home" ? hp : ap;
    const share = myPower / (hp + ap);
    if (share >= 0.42) continue; // só quem está cedendo o jogo contra-ataca
    const t = side === "home" ? m.homeTactics : m.awayTactics;
    const opp = side === "home" ? m.awayTactics : m.homeTactics;
    const lineup = side === "home" ? m.homeLineup : m.awayLineup;
    const nVeloz = lineup.filter(
      (lp) => {
        if (!lp.onField || lp.sentOff) return false;
        const pos = lp.posOverride ?? idx[lp.playerId].pos;
        return (pos === "ATA" || pos === "MEI") && idx[lp.playerId].traits.includes("Veloz");
      },
    ).length;
    let pCounter = 0.018 + 0.006 * nVeloz;
    if (t.mentality === "defensivo") pCounter += 0.012; // retranca armada para o contra
    if (opp.mentality === "tudo_ou_nada") pCounter *= 1.7; // linha adversária no ataque
    else if (opp.mentality === "ofensivo") pCounter *= 1.25;
    // contra-ataque de verdade exige o rival escancarado: cresce com a PROFUNDIDADE
    // do domínio cedido — jogo só levemente desequilibrado quase não gera contra
    // (ser um pouco melhor não pode ser punido).
    pCounter *= Math.min(1, (0.42 - share) / 0.05);
    if (chance(rng, pCounter)) tryShot(rng, m, idx, side, true);
  }
  m.dangerTime = Math.abs(m.momentum) >= 70 ? m.dangerTime + 1 : 0;

  tryCards(rng, m, idx, "home");
  tryCards(rng, m, idx, "away");

  // IA pensa a cada 10-15 min, mas só reajusta a partir do intervalo — o plano do
  // primeiro tempo é o traçado no vestiário (estratégia pré-jogo), como no futebol real
  if (m.minute >= 45 && m.minute - m.lastAiCheck >= randInt(rng, 10, 15)) {
    m.lastAiCheck = m.minute;
    if (userSide !== "home") aiThink(rng, m, idx, "home");
    if (userSide !== "away") aiThink(rng, m, idx, "away");
  }

  // piloto automático do usuário: com "substituição automática" ligada, troca os
  // jogadores esgotados por reservas descansados no segundo tempo (checa a cada 5 min)
  if (userSide && m.minute >= 46 && m.minute % 5 === 0) {
    const t = userSide === "home" ? m.homeTactics : m.awayTactics;
    if (t.autoSub && fatigueSub(m, idx, userSide)) m.aiFlash = true;
  }

  if (m.minute >= 90) m.finished = true;
}
