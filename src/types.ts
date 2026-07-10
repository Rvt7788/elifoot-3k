export type Position = "GOL" | "DEF" | "MEI" | "ATA";
export type Foot = "destro" | "canhoto";
export type Tier = "bagre" | "bom" | "craque" | "extra";
export type Trait = "Goleador" | "Paredão" | "Veloz" | "Criativo" | "Raçudo";
export type Mentality = "defensivo" | "equilibrado" | "ofensivo" | "tudo_ou_nada";
export type Marking = "leve" | "frouxa" | "apertada" | "extrema";

export interface Club {
  id: string;
  name: string;
  shortName: string;
  division: string;
  country: string;
  region: string;
  primaryColor: string;
  secondaryColor: string;
  baseBudget: number;
}

export interface Player {
  id: string;
  clubId: string;
  name: string;
  pos: Position;
  age: number;
  strength: number;
  cap: number; // teto oculto de potencial
  tier: Tier;
  traits: Trait[];
  energy: number; // 0-100, entre partidas
  goals: number;
  assists: number;
  yellows: number;
  reds: number;
  suspendedLeague: boolean; // recebeu vermelho na liga: fora da próxima partida da liga
  suspendedCup: boolean; // recebeu vermelho na copa: fora da próxima partida da copa
  value: number;
  xp: number; // progresso de treino rumo ao próximo ponto de força
  gained: number; // pontos de força ganhos na temporada (para exibir evolução)
  training: TrainingIntensity; // regime de treino individual
  foot: Foot; // pé dominante: rende mais no lado do campo compatível (canhoto à esquerda)
  number: number; // número da camisa (1-99), editável em Elenco
}

export type TrainingIntensity = "leve" | "normal" | "pesada";

export type Formation = "4-4-2" | "4-3-3" | "3-5-2" | "4-5-1" | "5-3-2" | "3-4-3" | "custom";

export const FORMATIONS: Record<Exclude<Formation, "custom">, { DEF: number; MEI: number; ATA: number }> = {
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 },
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 },
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 },
  "4-5-1": { DEF: 4, MEI: 5, ATA: 1 },
  "5-3-2": { DEF: 5, MEI: 3, ATA: 2 },
  "3-4-3": { DEF: 3, MEI: 4, ATA: 3 },
};

// Formação livre desenhada pelo usuário no editor: um slot por posição da linha
// (x,y em % do campo). O goleiro não entra aqui — fica sempre fixo no gol.
export interface CustomFormation {
  name: string;
  slots: { pos: Position; x: number; y: number }[]; // 10 slots de linha (sem o GOL)
}

// Quantos jogadores de cada posição de linha a formação exige — igual para as
// fixas (tabela FORMATIONS) e para a customizada (conta os slots desenhados).
export function shapeOf(
  formation: Formation, custom?: CustomFormation,
): { DEF: number; MEI: number; ATA: number } {
  if (formation === "custom") {
    const s = { DEF: 0, MEI: 0, ATA: 0 };
    for (const slot of custom?.slots ?? []) s[slot.pos as "DEF" | "MEI" | "ATA"]++;
    return s;
  }
  return FORMATIONS[formation] ?? FORMATIONS["4-4-2"];
}

export interface Tactics {
  mentality: Mentality;
  marking: Marking;
  truculencia: boolean;
  cera: boolean;
  bicho: boolean; // prêmio em dinheiro pago durante a partida: motiva o time até o fim do jogo
  bichoPct?: number; // bônus de motivação do nível de bicho pago (%), teto saudável de 10
  autoSub: boolean; // substituição automática por cansaço no segundo tempo
}

export interface MatchEvent {
  minute: number;
  type: "goal" | "yellow" | "red" | "sub";
  side: "home" | "away";
  playerName: string;
}

export interface LivePlayer {
  playerId: string;
  energy: number; // energia na partida
  yellowsMatch: number; // amarelos só nesta partida (2º vira vermelho automático)
  sentOff: boolean;
  subbedOut: boolean;
  subbedIn?: boolean; // entrou durante o jogo (para o ícone 🔄 nas listas)
  onField: boolean;
}

// Estatísticas de volume de jogo de um lado da partida. "poss" acumula a fração
// de posse minuto a minuto (posse % = poss / minutos jogados).
export interface SideMatchStats {
  shots: number; // finalizações totais
  onTarget: number; // chutes no gol (inclui os que viraram gol)
  saves: number; // defesas do goleiro deste lado
  tackles: number; // desarmes
  interceptions: number; // interceptações
  poss: number; // soma das frações de posse por minuto
}

export interface LiveMatch {
  competition: "league" | "cup"; // suspensão por cartão vale só na mesma competição
  homeId: string;
  awayId: string;
  minute: number;
  homeScore: number;
  awayScore: number;
  momentum: number; // -100 (fora) .. +100 (casa)
  dangerTime: number; // minutos acumulados na zona de perigo
  events: MatchEvent[];
  homeTactics: Tactics;
  awayTactics: Tactics;
  homeLineup: LivePlayer[];
  awayLineup: LivePlayer[];
  homeSubsLeft: number;
  awaySubsLeft: number;
  finished: boolean;
  lastAiCheck: number;
  aiFlash: boolean; // pisca 🔄 quando a IA mexeu
  swingSide: "home" | "away" | null; // time que acabou de sofrer gol: fica desorganizado por alguns minutos
  swingUntil: number; // minuto em que o efeito do swing termina
  homeAggression: number; // 0 (conservador) a 1 (agressivo) — personalidade tática da IA, por posição na tabela
  awayAggression: number;
  homeSlotOrder?: string[]; // ordem esquerda→direita dos titulares por linha (para o bônus de pé)
  awaySlotOrder?: string[];
  attendance?: number; // público no estádio do mandante (define a renda da partida)
  stats?: { home: SideMatchStats; away: SideMatchStats }; // volume de jogo acumulado
}

export interface Fixture {
  week: number;
  round: number;
  homeId: string;
  awayId: string;
  homeScore?: number;
  awayScore?: number;
  played: boolean;
}

export interface TableRow {
  clubId: string;
  pts: number;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
}

export interface TransferOffer {
  playerId: string;
  amount: number;
}

import type { CupState } from "./game/cup";

export interface PendingPromotion {
  position: Position;
  options: Player[];
}

export interface RetiredPlayerInfo {
  name: string;
  age: number;
  clubName: string;
}

export interface GameState {
  seed: number;
  season: number;
  week: number;
  userClubId: string;
  managerName?: string; // nome do técnico digitado na tela inicial
  budget: number;
  clubs: Club[];
  players: Player[];
  starters: string[]; // 11 titulares escolhidos pelo usuário
  slotOrder?: string[]; // ordem manual dos titulares no campo (lado esquerdo/direito por linha)
  formation: Formation;
  customFormation?: CustomFormation; // desenhada no editor, usada quando formation === "custom"
  defaultTactics: Tactics; // como o time entra em campo (ajustável na prancheta pré-jogo)
  fixtures: Fixture[]; // liga nacional do país do usuário (A e B)
  tables: Record<string, TableRow[]>; // por divisão
  cup: CupState; // copa nacional (mata-mata de ida e volta com os 40 clubes do país)
  continental?: CupState; // copa continental (Libertadores/Champions, 16 clubes históricos)
  jobOffer?: string; // convite de clube maior após temporada de sucesso (clubId)
  pendingBicho?: number; // valor do bicho pago para a próxima partida (vira gasto no fechamento)
  lastFinance?: { revenue: number; prize: number; bicho: number; wages?: number }; // caixa da última rodada encerrada
  debtWeeks?: number; // rodadas consecutivas com o caixa negativo (rumo à falência)
  fired?: boolean; // faliu: técnico demitido — só observa os jogos, sem comandar nada
  pendingPromotions?: PendingPromotion[];
  retiredLastSeason?: RetiredPlayerInfo[];
}
