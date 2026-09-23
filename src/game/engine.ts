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

// Divisão de cada setor entre as fases do jogo, por mentalidade: fração do setor
// que participa do ATAQUE; o resto é quem fica atrás da linha da bola. São sempre
// os mesmos 10 jogadores de linha — quem sobe não está lá para recompor. É isso que
// impede o "macete" de encher o time de atacantes: cada corpo a mais na frente é um
// a menos atrás, o rival cria mais e contra-ataca num campo aberto.
const PHASE_SPLIT: Record<Mentality, Record<"DEF" | "MEI" | "ATA", number>> = {
  defensivo: { DEF: 0.04, MEI: 0.3, ATA: 0.72 },
  equilibrado: { DEF: 0.1, MEI: 0.5, ATA: 0.85 },
  ofensivo: { DEF: 0.18, MEI: 0.62, ATA: 0.92 },
  tudo_ou_nada: { DEF: 0.3, MEI: 0.75, ATA: 1 }, // laterais e volantes no ataque, atrás só sobra a zaga
};

// Rendimento de cada setor fora da sua função: zagueiro que sobe não finaliza como
// atacante, atacante que recompõe não marca como zagueiro. Deslocar gente de função
// sempre desperdiça força — o equilibrado é a mentalidade de menor desperdício.
const PHASE_EFF = {
  atk: { DEF: 0.5, MEI: 0.9, ATA: 1 },
  def: { DEF: 1, MEI: 0.9, ATA: 0.5 },
} as const;

// Rendimento decrescente por linha: além do número natural de jogadores de cada
// setor, o excedente ocupa o mesmo espaço dos companheiros. Encher o ataque de
// gente é o caso mais crítico — três atacantes ainda somam, quatro se atropelam.
const CROWDING: Record<Position, number[]> = {
  GOL: [1],
  DEF: [1, 1, 1, 1, 0.8],
  MEI: [1, 1, 1, 1, 0.85],
  ATA: [1, 1, 0.8, 0.55],
};

// Mentalidade na disputa de território: quem propõe o jogo empurra o rival para
// trás; o defensivo cede a bola de propósito para fechar os espaços.
const MENTALITY_CTRL: Record<Mentality, number> = {
  defensivo: 0.86, equilibrado: 1, ofensivo: 1.07, tudo_ou_nada: 1.02, // tudo ou nada é chutão, não construção
};

// Marcação: mais apertada rende mais desarmes (bônus no volume) mas cansa mais rápido;
// leve poupa energia porém cede mais espaço ao adversário.
// "extrema" é a marcação de retranca total: segura resultado como nenhuma outra,
// mas o time se esgota muito mais rápido — insustentável por 90 minutos.
const MARKING_DRAIN: Record<Marking, number> = {
  leve: 0.8,
  frouxa: 1.0,
  apertada: 1.22,
  extrema: 1.9,
};
// Solidez da fase defensiva e recuperação de bola (território) por marcação.
const MARKING_DEF: Record<Marking, number> = {
  leve: 0.93,
  frouxa: 1,
  apertada: 1.08,
  extrema: 1.17,
};
const MARKING_CTRL: Record<Marking, number> = {
  leve: 0.94,
  frouxa: 1,
  apertada: 1.06,
  extrema: 1.08,
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

// Formação pré-jogo da IA: a faixa de opções vem da força relativa (mais fraco
// fecha o meio ou a defesa, mais forte abre o time) e, dentro dela, cada clube tem
// o seu estilo de casa. Sem isso a IA jogava sempre de 4-4-2 e qualquer desenho
// que encaixasse contra o 4-4-2 virava receita garantida.
export function aiPregameFormation(
  clubId: string, mySquad: Player[], oppSquad: Player[],
  competition: "league" | "cup" | "continental" = "league",
): Exclude<Formation, "custom"> {
  const xiStrength = (squad: Player[]) =>
    bestXI(squad, "4-4-2", false, competition).reduce((s, id) => s + (squad.find((p) => p.id === id)?.strength ?? 0), 0);
  const ratio = xiStrength(mySquad) / Math.max(1, xiStrength(oppSquad));
  const band: Exclude<Formation, "custom">[] =
    ratio < 0.85 ? ["4-5-1", "5-3-2", "4-4-2"]
    : ratio < 0.95 ? ["4-5-1", "4-4-2", "3-5-2"]
    : ratio <= 1.05 ? ["4-4-2", "4-3-3", "3-5-2", "4-5-1"]
    : ratio <= 1.15 ? ["4-3-3", "4-4-2", "3-5-2"]
    : ["4-3-3", "3-4-3", "4-4-2"];
  const available = mySquad.filter((p) => !isSuspended(p, competition) && !isInjured(p));
  const canFill = (f: Exclude<Formation, "custom">) => {
    const shape = shapeOf(f);
    const n = (pos: Position) => available.filter((p) => p.pos === pos).length;
    return n("GOL") >= 1 && n("DEF") >= shape.DEF && n("MEI") >= shape.MEI && n("ATA") >= shape.ATA;
  };
  // estilo da casa: hash estável do clube escolhe a preferida dentro da faixa
  let h = 0;
  for (const ch of clubId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const ordered = [...band.slice(h % band.length), ...band.slice(0, h % band.length)];
  return ordered.find(canFill) ?? "4-4-2";
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
  homeFormationArg?: Formation,
  awayFormationArg?: Formation,
  homeCustomFormation?: CustomFormation,
  awayCustomFormation?: CustomFormation,
  homeMorale = 0.5,
  awayMorale = 0.5,
  homePosOverrides?: Record<string, Position>,
  awayPosOverrides?: Record<string, Position>,
  homePenaltyTakerId?: string,
  awayPenaltyTakerId?: string,
  homeCaptainId?: string,
  awayCaptainId?: string,
): LiveMatch {
  // lado do usuário (com táticas) usa a formação dele; lado da IA escolhe a sua
  const homeFormation: Formation = homeFormationArg
    ?? (homeDefaultTactics ? "4-4-2" : aiPregameFormation(homeId, homeSquad, awaySquad, competition));
  const awayFormation: Formation = awayFormationArg
    ?? (awayDefaultTactics ? "4-4-2" : aiPregameFormation(awayId, awaySquad, homeSquad, competition));
  return {
    homeMorale, awayMorale,
    homePenaltyTakerId, awayPenaltyTakerId,
    homeCaptainId, awayCaptainId,
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
    homeFormation, awayFormation,
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
): { total: number; count: number } {
  const onField = orderedLine(lineup, idx, pos, slotOrder);
  if (onField.length === 0) return { total: 0, count: 0 };
  const contrib = onField
    .map((lp, i) =>
      effStrength(idx[lp.playerId], lp) *
        (pos === "GOL" ? 1 : footFactor(idx[lp.playerId].foot, i, onField.length)))
    .sort((a, b) => b - a);
  // linha congestionada rende menos por jogador: os mais fortes contam cheio e os
  // excedentes disputam o mesmo espaço (o 4º atacante pouco acrescenta)
  const crowd = CROWDING[pos];
  const total = contrib.reduce((s, v, i) => s + v * (crowd[i] ?? crowd[crowd.length - 1]), 0);
  // intensidade: além da curva individual, o setor inteiro perde ritmo com o cansaço
  const energyAvg = onField.reduce((s, lp) => s + lp.energy, 0) / onField.length;
  return { total: total * (0.6 + 0.4 * energyAvg / 100), count: onField.length };
}

// Como o time se distribui em campo neste minuto: força e corpos em cada fase.
interface TeamShape {
  atk: number; // força de quem participa do ataque
  def: number; // força de quem fica atrás da linha da bola
  total: number; // força total do time (escala da comparação ataque×defesa)
  ctrl: number; // disputa de meio-campo: posse e território
  atkBodies: number; // gente chegando na área rival
  defBodies: number; // gente recompondo atrás
  restDef: number; // zagueiros que ficam na cobertura quando o time sobe (contragolpe)
  nDef: number; // zagueiros em campo (linha de trás)
  nAta: number; // atacantes em campo (quem prende a zaga rival)
}

// Referências de um 4-4-2 equilibrado: as contas de volume e de conversão são
// relativas a esse time "padrão", então ele joga exatamente como o motor calibrado.
const REF_EDGE = -0.185; // (ataque − defesa rival) / força média, 4-4-2 equilibrado × igual
const REF_ATK_BODIES = 4.1;
const REF_BODY_RATIO = 5.9 / 4.1;
const REF_REST_DEF = 3.6;

// Calibragem global (scripts/tac-lab.mts varre esses valores): mando de campo,
// volume de chances, peso do território e da relação ataque×defesa, contragolpe.
export const TUNE = {
  homeAdv: 1.08,
  chanceBase: 0.038,
  shareExp: 1,
  ratioExp: 4,
  counterBase: 0.005,
  exposureCap: 4,
  expBodies: 1,
  expRest: 3,
};

// Vantagem do ataque de um lado sobre a defesa do outro, relativa ao 4-4-2 padrão.
// Comparação por DIFERENÇA, na escala da força média dos dois times: mover um
// jogador da defesa para o ataque abre o jogo na mesma medida para os dois lados
// (mais chances para mim, mais para o rival). Jogo aberto favorece quem é melhor;
// jogo fechado, o mais fraco — não existe forma "grátis" de atacar mais.
function edgeFactor(me: TeamShape, opp: TeamShape): number {
  const edge = (me.atk - opp.def) / ((me.total + opp.total) / 2);
  return Math.max(0.2, Math.min(5, Math.exp(TUNE.ratioExp * (edge - REF_EDGE))));
}

// Encaixe das linhas: a zaga precisa de um homem de sobra sobre os atacantes do
// rival. Três zagueiros contra dois atacantes é seguro; contra três, cada um fica
// no mano a mano e qualquer bola nas costas vira chance clara. Devolve o quanto a
// defesa fica exposta (1 = coberta; maior = sem sobra ou em inferioridade).
function backlineExposure(def: TeamShape, atk: TeamShape): number {
  const spare = def.nDef - atk.nAta;
  return spare >= 1 ? 1 : spare >= 0 ? 1.15 : 1.3;
}

// q = qualidade geral do time no dia (mando, moral, liderança, bicho, expulsões):
// vale nas duas fases, não só no ataque.
function teamShape(lineup: LivePlayer[], idx: PlayersIndex, t: Tactics, q: number, slotOrder?: string[]): TeamShape {
  const split = PHASE_SPLIT[t.mentality];
  let atk = 0, def = 0, total = 0, atkBodies = 0, defBodies = 0;
  const s = {} as Record<"DEF" | "MEI" | "ATA", { total: number; count: number }>;
  for (const pos of ["DEF", "MEI", "ATA"] as const) {
    s[pos] = sectorPower(lineup, idx, pos, slotOrder);
    atk += s[pos].total * split[pos] * PHASE_EFF.atk[pos];
    def += s[pos].total * (1 - split[pos]) * PHASE_EFF.def[pos];
    total += s[pos].total;
    atkBodies += s[pos].count * split[pos];
    defBodies += s[pos].count * (1 - split[pos]);
  }
  // o meio manda na posse, mas todo mundo toca na bola; linha com menos meias perde o miolo
  const ctrl = (s.MEI.total + 0.35 * (s.DEF.total + s.ATA.total)) * MENTALITY_CTRL[t.mentality] * MARKING_CTRL[t.marking];
  def *= MARKING_DEF[t.marking] * (t.truculencia ? 1.04 : 1);
  return {
    atk: Math.max(1, atk * q), def: Math.max(1, def * q), total: Math.max(1, total * q), ctrl: Math.max(1, ctrl * q),
    atkBodies: Math.max(0.5, atkBodies), defBodies: Math.max(0.5, defBodies),
    restDef: s.DEF.count * (1 - split.DEF),
    nDef: s.DEF.count,
    nAta: s.ATA.count,
  };
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

// Jogadores a menos em campo (expulsões): base de todas as penalidades de
// inferioridade numérica — 9 homens não cobrem o campo de 11.
function menDown(lineup: LivePlayer[]): number {
  const n = lineup.filter((lp) => lp.onField && !lp.sentOff).length;
  return Math.max(0, 11 - n);
}

// Capitão em campo: o designado (se está jogando); senão o Líder mais forte em
// campo; senão o mais forte. Mesma regra da prancheta (game/roles.ts).
function captainOnField(lineup: LivePlayer[], idx: PlayersIndex, captainId?: string): Player | null {
  const onField = lineup.filter((lp) => lp.onField && !lp.sentOff).map((lp) => idx[lp.playerId]);
  if (onField.length === 0) return null;
  const chosen = captainId && onField.find((p) => p.id === captainId);
  if (chosen) return chosen;
  const leaders = onField.filter((p) => p.traits.includes("Líder"));
  const pool = leaders.length > 0 ? leaders : onField;
  return [...pool].sort((a, b) => b.strength - a.strength)[0];
}

// Fator liderança: um capitão Líder em campo organiza e motiva o time — bônus
// de ~5% no poder. Sem Líder com a braçadeira, não há bônus (capitão comum é neutro).
function leadershipFactor(lineup: LivePlayer[], idx: PlayersIndex, captainId?: string): number {
  const cap = captainOnField(lineup, idx, captainId);
  return cap?.traits.includes("Líder") ? 1.05 : 1;
}

// Escolhe o cobrador de pênalti. Prioridade: o designado na prancheta (se está em
// campo); senão o ATA mais forte em campo (mesmo padrão exibido na prancheta);
// sem atacante, o melhor batedor de linha. Nunca o goleiro.
function pickPenaltyTaker(lineup: LivePlayer[], idx: PlayersIndex, takerId?: string): Player | null {
  const onField = lineup.filter(
    (lp) => lp.onField && !lp.sentOff && (lp.posOverride ?? idx[lp.playerId].pos) !== "GOL",
  );
  if (onField.length === 0) return null;
  if (takerId) {
    const chosen = onField.find((lp) => lp.playerId === takerId);
    if (chosen) return idx[chosen.playerId];
  }
  const cands = onField.map((lp) => ({
    p: idx[lp.playerId],
    pos: lp.posOverride ?? idx[lp.playerId].pos,
  }));
  const atas = cands.filter((c) => c.pos === "ATA");
  if (atas.length > 0) return atas.sort((a, b) => b.p.strength - a.p.strength)[0].p;
  const score = (p: Player) => {
    let s = p.strength;
    if (p.traits.includes("Goleador")) s += 8; // artilheiro é o cobrador natural
    if (p.tier === "extra") s += 4;
    else if (p.tier === "craque") s += 2;
    return s;
  };
  return cands.map((c) => c.p).sort((a, b) => score(b) - score(a))[0];
}

// Intervalo mínimo entre gols na MESMA partida (qualquer time): nenhum gol pode
// sair a menos de 2 minutos do gol anterior. Evita a enxurrada de gols no mesmo
// minuto e dá respiro ao jogo. Pênaltis convertidos também contam como gol aqui.
const MIN_GOAL_GAP = 2;
function goalTooSoon(m: LiveMatch): boolean {
  for (let i = m.events.length - 1; i >= 0; i--) {
    const e = m.events[i];
    if (e.type === "goal") return m.minute - e.minute < MIN_GOAL_GAP;
  }
  return false;
}

// Cobrança automática de pênalti: converte com probabilidade alta (~75% base),
// ajustada pela força do cobrador contra o goleiro. Grava o gol e o evento.
function takePenalty(rng: Rng, m: LiveMatch, idx: PlayersIndex, side: "home" | "away") {
  const atkLineup = side === "home" ? m.homeLineup : m.awayLineup;
  const defLineup = side === "home" ? m.awayLineup : m.homeLineup;
  const takerId = side === "home" ? m.homePenaltyTakerId : m.awayPenaltyTakerId;
  const taker = pickPenaltyTaker(atkLineup, idx, takerId);
  const keeper = bestOnField(defLineup, idx, "GOL");
  if (!taker) return;
  const atkStats = m.stats?.[side];
  const defStats = m.stats?.[side === "home" ? "away" : "home"];
  if (atkStats) atkStats.shots++;
  // pênalti é chute quase certo: base 0.75, cobrador forte sobe, goleiro Paredão salva mais
  let pConv = 0.75 + (taker.strength - (keeper?.strength ?? 5)) * 0.012;
  if (taker.traits.includes("Goleador")) pConv += 0.05;
  if (keeper?.traits.includes("Paredão")) pConv -= 0.08;
  pConv = Math.min(0.92, Math.max(0.5, pConv));
  // respeita o intervalo mínimo entre gols: pênalti que sairia cedo demais é
  // defendido pelo goleiro (mesmo desfecho de uma cobrança perdida)
  const scored = !goalTooSoon(m) && chance(rng, pConv);
  if (scored) {
    if (atkStats) atkStats.onTarget++;
    if (side === "home") m.homeScore++;
    else m.awayScore++;
    idx[taker.id].goals++;
    m.events.push({ minute: m.minute, type: "penalty", side, playerName: taker.name, scored: true });
    m.events.push({ minute: m.minute, type: "goal", side, playerName: taker.name });
    m.momentum = 0;
    m.dangerTime = 0;
    const conceded = side === "home" ? "away" : "home";
    m.swingSide = conceded;
    m.swingUntil = m.minute + randInt(rng, 4, 8);
  } else {
    // defendido/perdido: conta como chute no alvo defendido pelo goleiro
    if (atkStats) atkStats.onTarget++;
    if (defStats) defStats.saves++;
    m.events.push({ minute: m.minute, type: "penalty", side, playerName: taker.name, scored: false });
  }
}

function tryShot(
  rng: Rng, m: LiveMatch, idx: PlayersIndex, side: "home" | "away",
  atkShape: TeamShape, defShape: TeamShape, counter = false,
) {
  const atkLineup = side === "home" ? m.homeLineup : m.awayLineup;
  const defLineup = side === "home" ? m.awayLineup : m.homeLineup;
  const atkTactics = side === "home" ? m.homeTactics : m.awayTactics;
  const defTactics = side === "home" ? m.awayTactics : m.homeTactics;
  // pênalti: uma pequena fração das jogadas de ataque termina em falta na área. A
  // marcação dura do rival aumenta o risco de pênalti (entra mais forte na dividida).
  // Base calibrada para ~0,25 pênalti/jogo somando os dois lados (com ~9 chances
  // por lado); os multiplicadores táticos podem até dobrar isso, mas 3 pênaltis
  // numa partida volta a ser raridade, não rotina como era com a base de 3,5%.
  let pPenalty = 0.014;
  if (defTactics.marking === "extrema") pPenalty *= 2;
  else if (defTactics.marking === "apertada") pPenalty *= 1.5;
  else if (defTactics.marking === "leve") pPenalty *= 0.6;
  if (defTactics.truculencia) pPenalty *= 1.6;
  if (chance(rng, pPenalty)) {
    takePenalty(rng, m, idx, side);
    return;
  }
  const striker = pickStriker(rng, atkLineup, idx, atkTactics.mentality, counter);
  const keeper = bestOnField(defLineup, idx, "GOL");
  const bestDef = bestOnField(defLineup, idx, "DEF");
  if (!striker) return;
  const atkStats = m.stats?.[side];
  const defStats = m.stats?.[side === "home" ? "away" : "home"];
  if (atkStats) atkStats.shots++;
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

  // confiança: moral alta melhora a frieza na conclusão, moral baixa trava a perna —
  // é o que transforma domínio em resultado nos jogos apertados
  const atkMorale = (side === "home" ? m.homeMorale : m.awayMorale) ?? 0.5;
  atk *= 1 + Math.max(-0.1, Math.min(0.11, (atkMorale - 0.5) * 0.25));
  // O goleiro é o dono do resultado apertado: peso maior que antes, Paredão segura
  // o empate sozinho; o último defensor ajuda menos que o goleiro.
  let gk = (keeper?.strength ?? 5) * 1.15 * (keeper?.traits.includes("Paredão") ? 1.3 : 1);
  gk += (bestDef?.strength ?? 5) * 0.35;
  // Superioridade numérica na área: gente recompondo contra gente chegando. Vale
  // para os dois lados — encher a área rival facilita a conclusão, mas quem subiu
  // não está atrás, e a próxima chance do adversário encontra a defesa mais vazia.
  // No contragolpe só conta a zaga que ficou na cobertura: time que manda os
  // laterais e volantes ao ataque é pego com 2-3 atrás e o goleiro exposto.
  // zaga sem sobra sobre os atacantes: o finalizador chega no mano a mano
  gk /= Math.sqrt(backlineExposure(defShape, atkShape));
  const cover = counter
    ? defShape.restDef / REF_REST_DEF
    : (defShape.defBodies / atkShape.atkBodies) / REF_BODY_RATIO;
  gk *= counter
    ? Math.max(0.5, Math.min(1.15, cover ** 0.8)) // cobertura rala no contragolpe é fatal
    : Math.max(0.72, Math.min(1.3, Math.sqrt(cover)));
  // time desfalcado defende com espaços abertos: cada expulso facilita a
  // conclusão do rival (a linha não fecha, o goleiro fica mais exposto)
  gk *= Math.max(0.7, 1 - 0.08 * menDown(defLineup));
  // marcação dura atrapalha a finalização; leve dá espaço
  if (defTactics.marking === "extrema") gk *= 1.06;
  else if (defTactics.marking === "apertada") gk *= 1.03;
  else if (defTactics.marking === "leve") gk *= 0.97;
  const pGoal = Math.min(0.6, Math.max(0.05, (atk / (atk + gk)) * 0.5));
  if (chance(rng, pGoal)) {
    // intervalo mínimo entre gols: a chance de gol vira defesa do goleiro,
    // preservando a estatística de finalização sem estourar o placar no mesmo minuto
    if (goalTooSoon(m)) {
      if (atkStats) atkStats.onTarget++;
      if (defStats) defStats.saves++;
      return;
    }
    if (atkStats) atkStats.onTarget++; // gol conta como chute no alvo
    if (side === "home") m.homeScore++;
    else m.awayScore++;
    // pickStriker retorna uma cópia (pos ajustada pelo posOverride) — o gol tem
    // que ser gravado no jogador real do índice, senão o contador se perde
    idx[striker.id].goals++;
    m.events.push({
      minute: m.minute,
      type: "goal",
      side,
      playerName: striker.name,
      assistName: assistantLp ? idx[assistantLp.playerId].name : undefined,
    });
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
  // capitão Líder em campo acalma o time e conversa com o juiz: menos cartões
  if (leadershipFactor(lineup, idx, side === "home" ? m.homeCaptainId : m.awayCaptainId) > 1) pCard *= 0.8;
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
  if (isInjured(idx[inId])) return false; // lesionado não entra em campo, nunca
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

// Substituição por cansaço — algoritmo único da IA e do piloto automático do usuário:
// sai SEMPRE o jogador de linha com menor energia do time (abaixo de 55) e entra o
// reserva da MESMA posição com a melhor força efetiva (força × energia). A troca só
// acontece se for vantajosa: o reserva precisa render mais em campo, agora, do que
// o titular exausto — senão o time segura o cansado mesmo.
export function fatigueSub(m: LiveMatch, idx: PlayersIndex, side: "home" | "away"): boolean {
  const lineup = side === "home" ? m.homeLineup : m.awayLineup;
  const eff = (lp: LivePlayer) => idx[lp.playerId].strength * energyFactor(lp.energy);
  const tired = lineup
    .filter((l) => l.onField && !l.sentOff && l.energy < 55 && idx[l.playerId].pos !== "GOL")
    .sort((a, b) => a.energy - b.energy)[0];
  if (!tired) return false;
  const pos = idx[tired.playerId].pos;
  const fresh = lineup
    .filter((l) => !l.onField && !l.subbedOut && !l.sentOff && idx[l.playerId].pos === pos)
    .sort((a, b) => eff(b) - eff(a))[0];
  if (!fresh) return false;
  if (eff(fresh) <= eff(tired)) return false; // não vale a pena: mantém o titular
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
  // snapshot para detectar mudança REAL: os ramos abaixo reatribuem os mesmos
  // valores em checagens seguidas — sem comparar, o 🔄 piscava sem nada mudar
  const before = { ...t };
  let changed = false;

  const losing = myScore < oppScore;
  const winning = myScore > oppScore;
  const drawing = myScore === oppScore;

  if (myMomentum < -55 && t.mentality !== "defensivo" && rng() > aggression * 0.5) {
    // sendo amassado: time conservador recua; time agressivo aguenta e aposta na truculência
    if (chance(rng, 0.6 - aggression * 0.3)) t.mentality = "defensivo";
    else t.truculencia = true;
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
        changed = makeSub(m, idx, side, tiredMid[0].playerId, bench[0].playerId) || changed;
    }
  } else if (winning && m.minute >= 75 + aggression * 10 && !t.cera) {
    // segurar o resultado: times conservadores fecham mais cedo, agressivos demoram a recuar
    t.cera = true;
    t.mentality = "defensivo";
    // reta final segurando por 1 gol: retranca total (marcação extrema) e, se o time
    // é truculento por natureza, entra a faca também
    t.marking = m.minute >= 85 && myScore - oppScore === 1 ? "extrema" : "apertada";
    if (aggression > 0.7 && m.minute >= 85) t.truculencia = true;
  } else if (drawing && m.minute >= 80 && aggression > 0.6 && rng() < 0.4) {
    // empate não serve para quem precisa da vitória: arrisca no fim
    t.mentality = "ofensivo";
  } else {
    // troca por cansaço: mesmo algoritmo do piloto automático (mais cansado sai,
    // melhor força efetiva da posição entra, e só quando a troca é vantajosa)
    if (fatigueSub(m, idx, side)) changed = true;
  }
  // só pisca o 🔄 se a tática realmente mudou de valor ou se houve substituição
  const tacticsChanged =
    before.mentality !== t.mentality || before.marking !== t.marking ||
    before.truculencia !== t.truculencia || before.cera !== t.cera;
  if (tacticsChanged || changed) m.aiFlash = true;
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
      MARKING_DRAIN[t.marking] *
      // com 10 corre-se pelos 11; com 9, ainda mais — o time desfalcado se esgota
      (1 + 0.15 * menDown(lineup));
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

  // ── qualidade do time no dia: vale para atacar E para defender ──
  // inferioridade numérica: além de perder a força e o corpo do expulso nas contas
  // de setor, o time a menos perde organização/cobertura — ~10% por jogador a menos.
  const homeShort = Math.max(0.65, 1 - 0.1 * menDown(m.homeLineup));
  const awayShort = Math.max(0.65, 1 - 0.1 * menDown(m.awayLineup));
  // moral (0..1): neutra entre 40% e 60%; melhora gradualmente acima de 60% (até +6%);
  // piora gradualmente abaixo de 40% (até -6%).
  const moraleBoost = (mor: number | undefined) => {
    const morale = Math.round((mor ?? 0.6) * 100);
    if (morale > 60) return 1 + 0.06 * Math.min(1, (morale - 60) / 35);
    if (morale < 40) return 1 - 0.06 * Math.min(1, (40 - morale) / 30);
    return 1;
  };
  // Mando de campo: a torcida empurra o time nas duas fases, e a moral do mandante
  // amplia ou encolhe esse empurrão. Fora de casa a moral só mexe no próprio time.
  const homeMoraleN = m.homeMorale ?? 0.6;
  const homeAdv =
    TUNE.homeAdv +
    (homeMoraleN > 0.6 ? 0.05 * Math.min(1, (homeMoraleN - 0.6) / 0.35)
      : homeMoraleN < 0.4 ? -0.05 * Math.min(1, (0.4 - homeMoraleN) / 0.3)
      : 0);
  // Bicho: motivação proporcional ao nível pago, com teto de +10% no nível máximo
  // (vale só metade disso na qualidade, que já pesa nas duas fases do jogo).
  const bichoBoost = (t: Tactics) => t.bicho ? 1 + Math.min(10, Math.max(0, t.bichoPct ?? 10)) / 200 : 1;
  const homeQ = homeAdv * moraleBoost(m.homeMorale) * homeShort * bichoBoost(m.homeTactics) *
    leadershipFactor(m.homeLineup, idx, m.homeCaptainId);
  const awayQ = moraleBoost(m.awayMorale) * awayShort * bichoBoost(m.awayTactics) *
    leadershipFactor(m.awayLineup, idx, m.awayCaptainId);
  const H = teamShape(m.homeLineup, idx, m.homeTactics, homeQ, m.homeSlotOrder);
  const A = teamShape(m.awayLineup, idx, m.awayTactics, awayQ, m.awaySlotOrder);

  // ── território (barra de momentum) ──
  // O meio-campo decide quem fica com a bola e empurra o outro para trás. A barra
  // persegue esse equilíbrio com inércia e ruído: há fases de pressão de verdade,
  // e é nelas que saem as chances. Quem sofreu gol fica desorganizado por uns minutos.
  const cH = H.ctrl ** 1.5, cA = A.ctrl ** 1.5;
  let target = (cH / (cH + cA) - 0.5) * 250;
  if (m.swingSide && m.minute < m.swingUntil) {
    target += m.swingSide === "home" ? -30 : 30;
  } else if (m.swingSide && m.minute >= m.swingUntil) {
    m.swingSide = null;
  }
  // cera: quem catimba esfria o jogo — a barra tende ao meio
  if (m.homeTactics.cera || m.awayTactics.cera) target *= 0.6;
  m.momentum += (target - m.momentum) * 0.25 + (rng() - 0.5) * 20;
  m.momentum = Math.max(-100, Math.min(100, m.momentum));
  // fatia de território/posse do mandante neste minuto
  const homeShare = Math.max(0.2, Math.min(0.8, 0.5 + m.momentum / 250));

  if (m.stats) {
    m.stats.home.poss += homeShare;
    m.stats.away.poss += 1 - homeShare;

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

  // ── criação de chances: ataque próprio contra a DEFESA do rival ──
  // O volume depende do território (quem tem a bola ataca mais) e de quanto a força
  // que sobe supera a força que fica atrás do outro lado. Atacar não protege: o
  // ataque do rival continua medido contra a SUA defesa, que ficou mais leve.
  const chanceProb = (side: "home" | "away"): number => {
    const me = side === "home" ? H : A;
    const opp = side === "home" ? A : H;
    const share = side === "home" ? homeShare : 1 - homeShare;
    const t = side === "home" ? m.homeTactics : m.awayTactics;
    const oppT = side === "home" ? m.awayTactics : m.homeTactics;
    const lineup = side === "home" ? m.homeLineup : m.awayLineup;
    let p = TUNE.chanceBase * (share / 0.5) ** TUNE.shareExp * edgeFactor(me, opp);
    // criativos fabricam chances do nada (meio e ataque)
    const nCriativo = lineup.filter(
      (lp) => lp.onField && !lp.sentOff && idx[lp.playerId].traits.includes("Criativo") &&
        (lp.posOverride ?? idx[lp.playerId].pos) !== "GOL",
    ).length;
    p *= 1 + 0.05 * nCriativo;
    // truculência do rival quebra o ritmo e corta a criação (não é só cartão)
    if (oppT.truculencia) p *= 0.88;
    // zaga rival sem sobra: bola nas costas vira chance
    p *= backlineExposure(opp, me);
    // catimba esfria o jogo: a própria cera corta mais o próprio ataque que o do rival
    if (t.cera) p *= 0.8;
    if (oppT.cera) p *= 0.88;
    // swing pós-gol: quem sofreu está desorganizado e cria menos
    if (m.swingSide === side && m.minute < m.swingUntil) p *= 0.7;
    return Math.min(0.35, p);
  };
  if (chance(rng, chanceProb("home"))) tryShot(rng, m, idx, "home", H, A);
  if (chance(rng, chanceProb("away"))) tryShot(rng, m, idx, "away", A, H);

  // ── contra-ataque: a arma de quem cede a bola ──
  // Cresce quanto mais gente o rival manda ao ataque (laterais e volantes fora de
  // posição), quanto menos território o time tem (bola roubada com o campo todo pela
  // frente), com Veloz na frente e com o time montado para isso (defensivo). Contra
  // quem ataca com cautela quase não existe.
  for (const side of ["home", "away"] as const) {
    const me = side === "home" ? H : A;
    const opp = side === "home" ? A : H;
    const share = side === "home" ? homeShare : 1 - homeShare;
    const t = side === "home" ? m.homeTactics : m.awayTactics;
    const lineup = side === "home" ? m.homeLineup : m.awayLineup;
    const nVeloz = lineup.filter(
      (lp) => {
        if (!lp.onField || lp.sentOff) return false;
        const pos = lp.posOverride ?? idx[lp.playerId].pos;
        return (pos === "ATA" || pos === "MEI") && idx[lp.playerId].traits.includes("Veloz");
      },
    ).length;
    // exposição do rival: gente que subiu e não volta a tempo, e zaga rala na cobertura
    const exposure = Math.min(TUNE.exposureCap, (opp.atkBodies / REF_ATK_BODIES) ** TUNE.expBodies * (REF_REST_DEF / Math.max(1.5, opp.restDef)) ** TUNE.expRest);
    let pCounter = TUNE.counterBase * ((1 - share) / 0.5) * exposure * (1 + 0.2 * nVeloz);
    if (t.mentality === "defensivo") pCounter *= 1.4; // retranca armada para sair no contra
    // precisa de alguém lá na frente para puxar o contragolpe
    pCounter *= Math.min(1, me.atkBodies / 2.5);
    pCounter *= Math.sqrt(edgeFactor(me, opp));
    // com 10 ou 9 homens não sobra perna nem gente para sair no contragolpe
    pCounter *= Math.pow(0.6, menDown(lineup));
    if (chance(rng, pCounter)) tryShot(rng, m, idx, side, me, opp, true);
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
