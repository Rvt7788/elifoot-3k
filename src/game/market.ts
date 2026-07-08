import type { Club, GameState, Player, TableRow } from "../types";
import { sortTable } from "./schedule";

const DIV_RANK: Record<string, number> = { "Série A": 3, "Série B": 2, "Série C": 1 };

// Barreira econômica: divisões da IA só negociam com clubes até 1 nível abaixo/acima.
export function canNegotiate(buyerDiv: string, sellerDiv: string): boolean {
  const b = DIV_RANK[buyerDiv] ?? 1;
  const s = DIV_RANK[sellerDiv] ?? 1;
  return Math.abs(b - s) <= 1;
}

function clubMomentum(game: GameState, clubId: string): "crise" | "normal" | "topo" {
  const club = game.clubs.find((c) => c.id === clubId);
  if (!club) return "normal";
  const table = game.tables[club.division];
  if (!table) return "normal";
  const sorted = sortTable(table);
  const pos = sorted.findIndex((r) => r.clubId === clubId) + 1;
  if (pos === 0) return "normal";
  const n = sorted.length;
  if (pos > n - 2) return "crise"; // Z4 (últimos 2, já que dividimos em 20 times/2 rebaixados)
  if (pos <= 4) return "topo"; // G4
  return "normal";
}

// Resistência = (Força × Importância) ± Modificador de Momento do Clube
// Retorna o multiplicador sobre o valor de mercado que a IA exige para vender.
// Faixas mais duras que antes: clubes seguram seus jogadores com mais afinco,
// principalmente os importantes — negociar deixa de ser um trâmite quase garantido.
export function resistanceMultiplier(game: GameState, player: Player): number {
  const importance = player.tier === "extra" ? 3.0
    : player.tier === "craque" ? 2.1
    : player.tier === "bom" ? 1.5
    : 1.15;
  let mult = 1.2 + (importance - 1.0) * 0.75;
  const momentum = clubMomentum(game, player.clubId);
  if (momentum === "crise") mult -= 0.3; // força a saída, aceita menos, mas ainda resiste
  if (momentum === "topo") mult += 0.7; // resistência quase intransponível
  return Math.max(0.8, mult);
}

// Chance-base da IA aceitar uma oferta específica, antes da variância da negociação.
// Faixas mais estreitas e menos generosas: só ofertas claramente acima do pedido
// têm alguma garantia; perto do valor pedido ainda é bem incerto.
function baseAcceptChance(ratio: number): number {
  if (ratio >= 1.4) return 0.85;
  if (ratio >= 1.2) return 0.6;
  if (ratio >= 1.0) return 0.35;
  if (ratio >= 0.85) return 0.12;
  if (ratio >= 0.7) return 0.03;
  return 0.01;
}

// Chance final: soma o "humor do dia" do clube vendedor (variância própria de cada
// negociação, não só um número fixo por oferta) — a mesma oferta pode ser aceita hoje
// e recusada amanhã, dentro de uma faixa de ±10 pontos percentuais.
export function aiAcceptChance(
  game: GameState, player: Player, offer: number, moodRng: () => number = Math.random,
): number {
  const asking = Math.round(player.value * resistanceMultiplier(game, player));
  const ratio = offer / asking;
  const base = baseAcceptChance(ratio);
  const mood = (moodRng() - 0.5) * 0.2; // ±10 pontos percentuais
  return Math.max(0.01, Math.min(0.95, base + mood));
}

export function askingPrice(game: GameState, player: Player): number {
  return Math.round((player.value * resistanceMultiplier(game, player)) / 1000) * 1000;
}

export interface MarketFilters {
  position: string; // "ALL" | Position
  minStrength: number;
  maxStrength: number;
  trait: string; // "ALL" | Trait
  maxValue: number | null;
  query: string;
}

export function filterMarket(
  game: GameState, filters: MarketFilters,
): Player[] {
  const userClub = game.clubs.find((c) => c.id === game.userClubId)!;
  return game.players.filter((p) => {
    if (p.clubId === game.userClubId) return false;
    const club = game.clubs.find((c) => c.id === p.clubId);
    if (!club) return false;
    if (!canNegotiate(userClub.division, club.division)) return false;
    if (filters.position !== "ALL" && p.pos !== filters.position) return false;
    if (p.strength < filters.minStrength || p.strength > filters.maxStrength) return false;
    if (filters.trait !== "ALL" && !p.traits.includes(filters.trait as any)) return false;
    if (filters.maxValue !== null && askingPrice(game, p) > filters.maxValue) return false;
    if (filters.query && !p.name.toLowerCase().includes(filters.query.toLowerCase())) return false;
    return true;
  });
}
