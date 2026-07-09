import type {
  Formation, LiveMatch, LivePlayer, Marking, MatchEvent, Mentality, Player, Position, Tactics,
} from "../types";
import { FORMATIONS } from "../types";
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
};

// Marcação: mais apertada rende mais desarmes (bônus no volume) mas cansa mais rápido;
// leve poupa energia porém cede mais espaço ao adversário.
const MARKING_DRAIN: Record<Marking, number> = {
  leve: 0.8,
  frouxa: 1.0,
  apertada: 1.3,
};
const MARKING_POWER: Record<Marking, number> = {
  leve: -3,
  frouxa: 0,
  apertada: 5,
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

// Melhor XI por posição, respeitando a formação (1 GOL + DEF/MEI/ATA da formação).
// byEnergy=false ordena só pela força nominal (ignora cansaço); byEnergy=true usa a
// força efetiva em campo, considerando o corte de energia do motor de simulação.
export function bestXI(
  squad: Player[], formation: Formation = "4-4-2", byEnergy = false,
): string[] {
  const shape = FORMATIONS[formation];
  const rank = byEnergy ? effectiveStrength : (p: Player) => p.strength;
  const available = squad.filter((p) => !p.suspended);
  const byPos = (pos: Player["pos"], count: number) =>
    available
      .filter((p) => p.pos === pos)
      .sort((a, b) => rank(b) - rank(a) || b.strength - a.strength)
      .slice(0, count);
  return [
    ...byPos("GOL", 1), ...byPos("DEF", shape.DEF), ...byPos("MEI", shape.MEI), ...byPos("ATA", shape.ATA),
  ].map((p) => p.id);
}

// Escalação: usa os titulares definidos pelo usuário (descontando suspensos) ou o melhor XI
export function pickLineup(squad: Player[], starterIds?: string[]): LivePlayer[] {
  const valid = starterIds?.filter(
    (id) => squad.some((p) => p.id === id && !p.suspended),
  ) ?? [];
  const starters = new Set(valid.length === 11 ? valid : bestXI(squad));
  return squad.map((p) => ({
    playerId: p.id,
    energy: p.energy,
    yellowsMatch: 0,
    sentOff: false,
    subbedOut: false,
    onField: starters.has(p.id),
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
): LiveMatch {
  return {
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
    homeLineup: pickLineup(homeSquad, homeStarters),
    awayLineup: pickLineup(awaySquad, awayStarters),
    homeSubsLeft: 5, awaySubsLeft: 5,
    finished: false,
    lastAiCheck: 0,
    aiFlash: false,
    swingSide: null,
    swingUntil: 0,
    homeAggression, awayAggression,
    homeSlotOrder: homeSlotOrder ? [...homeSlotOrder] : undefined,
    awaySlotOrder: awaySlotOrder ? [...awaySlotOrder] : undefined,
  };
}

interface PlayersIndex { [id: string]: Player }

// Força efetiva em campo, com a energia da partida (LivePlayer) — mesma curva gradual.
function effStrength(p: Player, lp: LivePlayer): number {
  return p.strength * energyFactor(lp.energy);
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
    (lp) => lp.onField && !lp.sentOff && idx[lp.playerId].pos === pos,
  );
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
  if (t.bicho) power *= 1.1; // time motivado pelo prêmio joga mais
  return power;
}

// Poder defensivo: setor DEF, também sensível à energia; goleiro entra como reforço leve.
// A marcação (leve/frouxa/apertada) soma ou tira volume de desarme.
function defensePower(lineup: LivePlayer[], idx: PlayersIndex, t: Tactics, slotOrder?: string[]): number {
  const def = sectorPower(lineup, idx, "DEF", slotOrder);
  const gk = sectorPower(lineup, idx, "GOL");
  return def.total * (def.energyAvg / 100) + gk.total * 0.3 + MARKING_POWER[t.marking];
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
    (lp) => lp.onField && !lp.sentOff && idx[lp.playerId].pos === pos,
  );
  if (cands.length === 0) return null;
  return cands
    .map((lp) => idx[lp.playerId])
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
};

// Sorteia quem finaliza dentre todos em campo. O peso de cada jogador não é só
// a posição fixa: depende de quantos companheiros de setor estão em campo (a
// formação) — um 3-5-2 com 5 meias reparte mais chances de finalização entre
// eles; um 4-3-3 concentra mais no ataque — mais a mentalidade do time e uma
// dose de sorte (roll aleatório por jogador) para não ficar sempre previsível.
function pickStriker(
  rng: Rng, lineup: LivePlayer[], idx: PlayersIndex, mentality: Mentality,
): Player | null {
  const onField = lineup.filter((lp) => lp.onField && !lp.sentOff).map((lp) => idx[lp.playerId]);
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
    return p.strength ** 2 * SHOT_WEIGHT[p.pos] * formationFactor * mentalityFactor * luck;
  });
}

function randomOnField(rng: Rng, lineup: LivePlayer[], idx: PlayersIndex): Player {
  const cands = lineup.filter((lp) => lp.onField && !lp.sentOff);
  return idx[pick(rng, cands).playerId];
}

function tryShot(
  rng: Rng, m: LiveMatch, idx: PlayersIndex, side: "home" | "away",
) {
  const atkLineup = side === "home" ? m.homeLineup : m.awayLineup;
  const defLineup = side === "home" ? m.awayLineup : m.homeLineup;
  const atkTactics = side === "home" ? m.homeTactics : m.awayTactics;
  const striker = pickStriker(rng, atkLineup, idx, atkTactics.mentality);
  const keeper = bestOnField(defLineup, idx, "GOL");
  const bestDef = bestOnField(defLineup, idx, "DEF");
  if (!striker) return;
  let atk = striker.strength * (striker.traits.includes("Goleador") ? 1.25 : 1);
  let gk = (keeper?.strength ?? 5) * (keeper?.traits.includes("Paredão") ? 1.3 : 1);
  gk += (bestDef?.strength ?? 5) * 0.4; // último defensor ajuda a segurar a finalização
  const pGoal = Math.min(0.65, Math.max(0.08, (atk / (atk + gk)) * 0.55));
  if (chance(rng, pGoal)) {
    if (side === "home") m.homeScore++;
    else m.awayScore++;
    striker.goals++;
    m.events.push({ minute: m.minute, type: "goal", side, playerName: striker.name });
    if (chance(rng, 0.65)) {
      const mates = atkLineup.filter(
        (lp) =>
          lp.onField && !lp.sentOff &&
          idx[lp.playerId].id !== striker.id &&
          (idx[lp.playerId].pos === "MEI" || idx[lp.playerId].pos === "ATA"),
      );
      if (mates.length > 0) idx[pick(rng, mates).playerId].assists++;
    }
    m.momentum = 0;
    m.dangerTime = 0;
    // quem sofreu o gol fica desorganizado nos minutos seguintes
    const conceded = side === "home" ? "away" : "home";
    m.swingSide = conceded;
    m.swingUntil = m.minute + randInt(rng, 4, 8);
  }
}

// Cartão vermelho, direto ou por acúmulo de 2 amarelos na partida: marca expulsão
// e suspensão automática para a próxima rodada.
function sendOff(m: LiveMatch, side: "home" | "away", player: Player, lp: LivePlayer) {
  player.reds++;
  player.suspended = true;
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
      (l) => l.onField && !l.sentOff && idx[l.playerId].pos === "GOL",
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
  if (!goalkeeperRuleOk(lineup, idx, idx[outId].pos, idx[inId].pos)) return false;
  out.onField = false;
  out.subbedOut = true;
  inn.onField = true;
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
    .sort((a, b) => b.energy - a.energy)[0];
  if (!fresh) return false;
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
    t.mentality = "ofensivo";
    t.truculencia = false;
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
      0.55 * (t.mentality === "ofensivo" ? 1.2 : 1) * (t.truculencia ? 1.15 : 1) * MARKING_DRAIN[t.marking];
    for (const lp of lineup)
      if (lp.onField && !lp.sentOff) lp.energy = Math.max(0, lp.energy - drain);
  }

  // deslocamento da barra de momentum: ataque de cada lado é freado pela defesa do outro.
  // A diferença de poder (formação, tática, escalação, energia) agora pesa mais que o
  // ruído aleatório — decisões do jogador e da IA se refletem de verdade no placar,
  // mas o ruído continua alto o bastante para permitir zebra e jogo imprevisível.
  const homeDef = defensePower(m.homeLineup, idx, m.homeTactics, m.homeSlotOrder);
  const awayDef = defensePower(m.awayLineup, idx, m.awayTactics, m.awaySlotOrder);
  const hp = teamPower(m.homeLineup, idx, m.homeTactics, awayDef, m.homeSlotOrder) * 1.08; // fator casa
  const ap = teamPower(m.awayLineup, idx, m.awayTactics, homeDef, m.awaySlotOrder);
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

  // zona de perigo
  if (Math.abs(m.momentum) >= 70) {
    m.dangerTime++;
    const attacking: "home" | "away" = m.momentum > 0 ? "home" : "away";
    const attTactics = attacking === "home" ? m.homeTactics : m.awayTactics;
    // gatilho do contra-ataque: 15% (dobra se o atacante for ofensivo)
    const pCounter = attTactics.mentality === "ofensivo" ? 0.3 : 0.15;
    if (chance(rng, pCounter)) {
      m.momentum = attacking === "home" ? -80 : 80;
      m.dangerTime = 0;
      tryShot(rng, m, idx, attacking === "home" ? "away" : "home");
    } else if (m.dangerTime >= 2 && chance(rng, 0.35)) {
      tryShot(rng, m, idx, attacking);
      m.dangerTime = 0;
    }
  } else {
    m.dangerTime = 0;
  }

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
