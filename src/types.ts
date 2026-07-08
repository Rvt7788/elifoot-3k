export type Position = "GOL" | "DEF" | "MEI" | "ATA";
export type Foot = "destro" | "canhoto";
export type Tier = "bagre" | "bom" | "craque" | "extra";
export type Trait = "Goleador" | "Paredão" | "Veloz" | "Criativo" | "Raçudo";
export type Mentality = "defensivo" | "equilibrado" | "ofensivo";
export type Marking = "leve" | "frouxa" | "apertada";

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
  suspended: boolean; // recebeu vermelho na última partida: fora da próxima rodada
  value: number;
  xp: number; // progresso de treino rumo ao próximo ponto de força
  gained: number; // pontos de força ganhos na temporada (para exibir evolução)
  training: TrainingIntensity; // regime de treino individual
  foot: Foot; // pé dominante: rende mais no lado do campo compatível (canhoto à esquerda)
}

export type TrainingIntensity = "leve" | "normal" | "pesada";

export type Formation = "4-4-2" | "4-3-3" | "3-5-2" | "4-2-3-1" | "5-3-2";

export const FORMATIONS: Record<Formation, { DEF: number; MEI: number; ATA: number }> = {
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 },
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 },
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 },
  "4-2-3-1": { DEF: 4, MEI: 5, ATA: 1 },
  "5-3-2": { DEF: 5, MEI: 3, ATA: 2 },
};

export interface Tactics {
  mentality: Mentality;
  marking: Marking;
  truculencia: boolean;
  cera: boolean;
  bicho: boolean; // prêmio em dinheiro pago durante a partida: motiva o time até o fim do jogo
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
  onField: boolean;
}

export interface LiveMatch {
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

export interface GameState {
  seed: number;
  season: number;
  week: number;
  userClubId: string;
  budget: number;
  clubs: Club[];
  players: Player[];
  starters: string[]; // 11 titulares escolhidos pelo usuário
  slotOrder?: string[]; // ordem manual dos titulares no campo (lado esquerdo/direito por linha)
  formation: Formation;
  defaultTactics: Tactics; // como o time entra em campo (ajustável na prancheta pré-jogo)
  fixtures: Fixture[]; // liga nacional do país do usuário (A e B)
  tables: Record<string, TableRow[]>; // por divisão
  cup: CupState; // copa nacional (mata-mata de ida e volta com os 40 clubes do país)
}
