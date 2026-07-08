import type { Player, TrainingIntensity } from "../types";
import { playerValue } from "./seeder";

// Sistema de evolução: cada jogador acumula XP semanal (jogar rende muito mais que
// só treinar). Ao encher a barra, ganha +1 de força até o teto oculto (cap).

// XP necessário para subir 1 ponto: cresce com a força atual — evoluir um bagre
// jovem é rápido, lapidar um craque leva a temporada inteira.
export function xpNeeded(strength: number): number {
  return 20 + strength * 2;
}

// Jovens absorvem treino muito mais rápido; a partir dos 30 a evolução quase para.
export function ageFactor(age: number): number {
  if (age <= 20) return 1.6;
  if (age <= 24) return 1.3;
  if (age <= 28) return 1.0;
  if (age <= 31) return 0.5;
  return 0.2;
}

// XP base da semana, antes do fator de idade.
export const XP_MATCH = 14; // quem entrou em campo
export const XP_TRAINING: Record<TrainingIntensity, number> = {
  leve: 4,
  normal: 6,
  pesada: 9,
};

// Recuperação de energia na semana livre, por regime (fração da diferença até 100).
// Treino pesado evolui mais, mas o elenco chega mais gasto à rodada seguinte.
export const RECOVERY: Record<TrainingIntensity, number> = {
  leve: 0.72,
  normal: 0.6,
  pesada: 0.48,
};

export function weeklyXp(
  player: Player,
  playedMatch: boolean,
  intensity: TrainingIntensity,
): number {
  const base = XP_TRAINING[intensity] + (playedMatch ? XP_MATCH : 0);
  return Math.round(base * ageFactor(player.age));
}

// Aplica o ganho semanal e converte XP acumulado em força (respeitando o teto).
// Muta o objeto recebido — chamar sobre cópias.
export function applyWeeklyGain(
  player: Player,
  playedMatch: boolean,
  intensity: TrainingIntensity,
): void {
  if (player.strength >= player.cap) {
    player.xp = 0;
    return;
  }
  let xp = (player.xp ?? 0) + weeklyXp(player, playedMatch, intensity);
  while (xp >= xpNeeded(player.strength) && player.strength < player.cap) {
    xp -= xpNeeded(player.strength);
    player.strength += 1;
    player.gained = (player.gained ?? 0) + 1;
  }
  player.xp = player.strength >= player.cap ? 0 : xp;
  player.value = playerValue(player);
}
