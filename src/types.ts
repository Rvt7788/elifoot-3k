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
  titles?: number; // títulos conquistados no save (liga, copa, continental) — ranking de clubes
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
  injuryWeeks?: number; // rodadas restantes de recuperação de lesão (0/ausente = são)
  apps?: number; // jogos disputados na temporada (zera na virada)
  goals: number; // da temporada atual (zera na virada)
  assists: number; // da temporada atual (zera na virada)
  careerGoals?: number; // acumulado das temporadas anteriores (não inclui a atual)
  careerAssists?: number; // acumulado das temporadas anteriores (não inclui a atual)
  yellows: number;
  reds: number;
  yellowsLeague: number;
  yellowsCup: number;
  yellowsContinental: number;
  suspendedLeague: boolean; // recebeu vermelho na liga: fora da próxima partida da liga
  suspendedCup: boolean; // recebeu vermelho na copa: fora da próxima partida da copa
  suspendedContinental: boolean; // recebeu vermelho na continental: fora da próxima partida da continental
  value: number;
  xp: number; // progresso de treino rumo ao próximo ponto de força
  gained: number; // pontos de força ganhos na temporada (para exibir evolução)
  training: TrainingIntensity; // regime de treino individual
  foot: Foot; // pé dominante: rende mais no lado do campo compatível (canhoto à esquerda)
  number: number; // número da camisa (1-99), editável em Elenco
  contract: number; // temporadas restantes de contrato (1 = último ano; expira no fim da temporada)
  titles: number; // títulos conquistados na carreira (liga, copa, continental) — ranking de vitoriosos
}

export type TrainingIntensity = "leve" | "normal" | "pesada";

export type Formation = "4-4-2" | "4-3-3" | "3-5-2" | "4-5-1" | "5-3-2" | "3-4-3" | "3-3-4" | "custom";

export const FORMATIONS: Record<Exclude<Formation, "custom">, { DEF: number; MEI: number; ATA: number }> = {
  "4-4-2": { DEF: 4, MEI: 4, ATA: 2 },
  "4-3-3": { DEF: 4, MEI: 3, ATA: 3 },
  "3-5-2": { DEF: 3, MEI: 5, ATA: 2 },
  "4-5-1": { DEF: 4, MEI: 5, ATA: 1 },
  "5-3-2": { DEF: 5, MEI: 3, ATA: 2 },
  "3-4-3": { DEF: 3, MEI: 4, ATA: 3 },
  "3-3-4": { DEF: 3, MEI: 3, ATA: 4 },
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
  type: "goal" | "yellow" | "red" | "sub" | "penalty";
  side: "home" | "away";
  playerName: string;
  scored?: boolean; // só para pênaltis: se a cobrança automática foi convertida
}

export interface LivePlayer {
  playerId: string;
  energy: number; // energia na partida
  yellowsMatch: number; // amarelos só nesta partida (2º vira vermelho automático)
  sentOff: boolean;
  subbedOut: boolean;
  subbedIn?: boolean; // entrou durante o jogo (para o ícone 🔄 nas listas)
  posOverride?: Position; // reposicionamento tático temporário na partida (ex: após vermelho)
  slotIdx?: number; // índice do slot específico na prancheta
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
  competition: "league" | "cup" | "continental"; // suspensão por cartão vale só na mesma competição
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
  homeMorale?: number; // moral do time (0..1): dá até ±5% de poder em campo
  awayMorale?: number;
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

// Proposta de um clube da IA por um jogador do usuário: aparece entre rodadas
// e vale até a próxima rodada ser encerrada (aceitar vende na hora).
export interface IncomingOffer {
  clubId: string; // clube comprador
  playerId: string;
  amount: number;
}

// Técnico do ecossistema: cada clube tem o seu; reputação sobe com campanhas
// acima do esperado e títulos, e o carrossel de fim de temporada realoca os
// técnicos demitidos entre os clubes vagos.
export interface Manager {
  id: string;
  name: string;
  clubId: string | null; // null = desempregado (no mercado)
  reputation: number; // 5-99
  titles: number; // títulos de liga/copa/continental na carreira
  winsA?: number; // vitórias na carreira comandando clube da Série A
  winsB?: number; // vitórias na carreira comandando clube da Série B
  seasonWinsA?: number; // vitórias na temporada atual pela Série A (zera na virada)
  seasonWinsB?: number; // vitórias na temporada atual pela Série B (zera na virada)
  isUser?: boolean; // técnico controlado pelo jogador
}

// Registro do prêmio de Melhor Técnico da temporada.
export interface ManagerAward {
  season: number;
  managerName: string;
  clubName: string;
}

// Resumo de notícias da virada de temporada, exibido nas primeiras semanas.
export interface SeasonNews {
  season: number; // temporada que está começando
  bestManager: string;
  bestManagerClub: string;
  userWonAward: boolean;
  contractLosses: string[]; // jogadores do usuário que saíram de graça (contrato expirado)
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
  posOverrides?: Record<string, Position>; // titular escalado fora da posição natural (ex.: MEI jogando de ATA)
  formation: Formation;
  customFormation?: CustomFormation; // desenhada no editor, usada quando formation === "custom"
  defaultTactics: Tactics; // como o time entra em campo (ajustável na prancheta pré-jogo)
  fixtures: Fixture[]; // liga nacional do país do usuário (A e B)
  tables: Record<string, TableRow[]>; // por divisão
  cup: CupState; // copa nacional (mata-mata de ida e volta com os 40 clubes do país)
  continental?: CupState; // copa continental (Libertadores/Champions, 16 clubes históricos)
  jobOffer?: string; // convite de clube maior após temporada de sucesso (clubId)
  pendingBicho?: number; // valor do bicho pago para a próxima partida (vira gasto no fechamento)
  lastFinance?: { revenue: number; prize: number; bicho: number; wages?: number; tv?: number; attendance?: number }; // caixa da última rodada encerrada
  lastNews?: string[]; // manchetes da última rodada (divisão do usuário)
  morale?: number; // moral do time do usuário (0-100): sobe com vitória, cai com derrota
  prevMorale?: number; // moral antes da última rodada, para a seta de tendência na Home
  stadiumLevel?: number; // arquibancadas comprou: cada nível = +8% de público em casa
  debtWeeks?: number; // rodadas consecutivas com o caixa negativo (rumo à falência)
  fired?: boolean; // faliu: técnico demitido — só observa os jogos, sem comandar nada
  pendingPromotions?: PendingPromotion[];
  retiredLastSeason?: RetiredPlayerInfo[];
  managers?: Manager[]; // um técnico por clube + eventuais desempregados
  managerAwards?: ManagerAward[]; // histórico do prêmio de Melhor Técnico por temporada
  incomingOffer?: IncomingOffer; // proposta pendente de um clube da IA por jogador do usuário
  seasonNews?: SeasonNews; // notícias da virada de temporada (prêmio, contratos expirados)
  contractWarningSeason?: number; // temporada em que o aviso de contratos a vencer já foi exibido
}
