// Simulação em massa da engine (npx tsx scripts/sim-engine.mts): roda centenas
// de jogos IA×IA e agrega padrões — gols, pênaltis, cartões, subs, liderança.
import { newGame } from "../src/game/seeder";
import { createLiveMatch, simulateMinute } from "../src/game/engine";
import { mulberry32 } from "../src/game/rng";
import type { LiveMatch } from "../src/types";

const g = newGame(20260712, "fla_br");
const clubsBR = g.clubs.filter((c) => c.country === "BR");
const serieA = clubsBR.filter((c) => c.division === "Série A");

function playMatch(seed: number, homeId: string, awayId: string): LiveMatch {
  const rng = mulberry32(seed >>> 0);
  // clona jogadores para não acumular gols/cartões entre partidas
  const players = g.players.map((p) => ({ ...p, traits: [...p.traits] }));
  const idx = Object.fromEntries(players.map((p) => [p.id, p]));
  const m = createLiveMatch(
    homeId, awayId,
    players.filter((p) => p.clubId === homeId),
    players.filter((p) => p.clubId === awayId),
  );
  while (!m.finished) simulateMinute(rng, m, idx, null);
  return m;
}

// ── Rodada A: round-robin da Série A, N repetições ──
const N_ROUNDS = 8;
let matches = 0, goals = 0, homeGoals = 0, awayGoals = 0;
let homeWins = 0, draws = 0, awayWins = 0;
let pens = 0, pensScored = 0;
const penMatchDist: Record<number, number> = {};
let yellows = 0, reds = 0, subs = 0;
const scorelines: Record<string, number> = {};
let zeroZero = 0, goleadas = 0; // 4+ de diferença
let maxGoalsMatch = 0;

for (let r = 0; r < N_ROUNDS; r++) {
  for (let i = 0; i < serieA.length; i++) {
    for (let j = 0; j < serieA.length; j++) {
      if (i === j) continue;
      const m = playMatch(1000003 * r + 97 * i + j, serieA[i].id, serieA[j].id);
      matches++;
      goals += m.homeScore + m.awayScore;
      homeGoals += m.homeScore; awayGoals += m.awayScore;
      if (m.homeScore > m.awayScore) homeWins++;
      else if (m.homeScore < m.awayScore) awayWins++;
      else draws++;
      const pm = m.events.filter((e) => e.type === "penalty");
      pens += pm.length;
      pensScored += pm.filter((e) => e.scored).length;
      penMatchDist[pm.length] = (penMatchDist[pm.length] ?? 0) + 1;
      yellows += m.events.filter((e) => e.type === "yellow").length;
      reds += m.events.filter((e) => e.type === "red").length;
      subs += m.events.filter((e) => e.type === "sub").length;
      const key = `${m.homeScore}x${m.awayScore}`;
      scorelines[key] = (scorelines[key] ?? 0) + 1;
      if (m.homeScore + m.awayScore === 0) zeroZero++;
      if (Math.abs(m.homeScore - m.awayScore) >= 4) goleadas++;
      maxGoalsMatch = Math.max(maxGoalsMatch, m.homeScore + m.awayScore);
    }
  }
}

console.log("═══ LIGA SÉRIE A —", matches, "jogos ═══");
console.log(`Gols/jogo: ${(goals / matches).toFixed(2)} (casa ${(homeGoals / matches).toFixed(2)} × fora ${(awayGoals / matches).toFixed(2)})`);
console.log(`Casa ${(100 * homeWins / matches).toFixed(1)}% · Empate ${(100 * draws / matches).toFixed(1)}% · Fora ${(100 * awayWins / matches).toFixed(1)}%`);
console.log(`Pênaltis/jogo: ${(pens / matches).toFixed(3)} · conversão ${(100 * pensScored / Math.max(1, pens)).toFixed(1)}%`);
console.log("Pênaltis por jogo:", Object.entries(penMatchDist).map(([k, v]) => `${k}: ${(100 * v / matches).toFixed(1)}%`).join(" · "));
console.log(`Amarelos/jogo: ${(yellows / matches).toFixed(2)} · Vermelhos/jogo: ${(reds / matches).toFixed(3)} · Subs/jogo: ${(subs / matches).toFixed(2)}`);
console.log(`0x0: ${(100 * zeroZero / matches).toFixed(1)}% · Goleadas (dif 4+): ${(100 * goleadas / matches).toFixed(1)}% · Máx gols num jogo: ${maxGoalsMatch}`);
const topScores = Object.entries(scorelines).sort((a, b) => b[1] - a[1]).slice(0, 8);
console.log("Placares mais comuns:", topScores.map(([k, v]) => `${k} (${(100 * v / matches).toFixed(1)}%)`).join(" · "));

// ── Rodada B: efeito da liderança — mesmo confronto, com e sem capitão Líder ──
// Pareado: cada semente roda DUAS vezes (com e sem Líder no capitão do mandante),
// então a única diferença entre os cenários é o próprio trait.
function leadershipExperiment(nGames: number) {
  const pair = [serieA[2], serieA[3]];
  const run = (seed: number, withLeader: boolean) => {
    const rng = mulberry32(seed >>> 0);
    const players = g.players.map((p) => ({ ...p, traits: p.traits.filter((t) => t !== "Líder") }));
    const homeSquad = players.filter((p) => p.clubId === pair[0].id);
    const cap = [...homeSquad].sort((a, b) => b.strength - a.strength)[0];
    if (withLeader) cap.traits.push("Líder");
    const idx = Object.fromEntries(players.map((p) => [p.id, p]));
    const m = createLiveMatch(pair[0].id, pair[1].id, homeSquad, players.filter((p) => p.clubId === pair[1].id));
    while (!m.finished) simulateMinute(rng, m, idx, null);
    return m;
  };
  const acc = { with: { w: 0, gf: 0, ga: 0, y: 0 }, without: { w: 0, gf: 0, ga: 0, y: 0 } };
  for (let k = 0; k < nGames; k++) {
    for (const withLeader of [true, false]) {
      const m = run(777 + k * 31, withLeader);
      const a = withLeader ? acc.with : acc.without;
      if (m.homeScore > m.awayScore) a.w++;
      a.gf += m.homeScore; a.ga += m.awayScore;
      a.y += m.events.filter((e) => e.type === "yellow" && e.side === "home").length;
    }
  }
  console.log(`\n═══ LIDERANÇA (pareado) — ${pair[0].name} × ${pair[1].name}, ${nGames} sementes ═══`);
  const line = (label: string, a: { w: number; gf: number; ga: number; y: number }) =>
    console.log(`${label}: vitórias ${(100 * a.w / nGames).toFixed(1)}% · gols pró ${(a.gf / nGames).toFixed(2)} · contra ${(a.ga / nGames).toFixed(2)} · amarelos ${(a.y / nGames).toFixed(2)}`);
  line("COM capitão Líder", acc.with);
  line("SEM Líder        ", acc.without);
}
leadershipExperiment(1500);

// ── Rodada C: prevalência do trait Líder ──
let leaders = 0, clubsWithLeader = 0;
for (const c of clubsBR) {
  const squad = g.players.filter((p) => p.clubId === c.id);
  const l = squad.filter((p) => p.traits.includes("Líder")).length;
  leaders += l;
  if (l > 0) clubsWithLeader++;
}
console.log(`\n═══ LÍDERES (BR, ${clubsBR.length} clubes) ═══`);
console.log(`Líderes por elenco: ${(leaders / clubsBR.length).toFixed(2)} · clubes com ao menos 1: ${(100 * clubsWithLeader / clubsBR.length).toFixed(0)}%`);

// ── Rodada D: expectativa de lesões com a taxa nova ──
console.log(`\n═══ LESÕES (analítico, 1,2% base por atleta em campo) ═══`);
console.log(`~${(14 * 0.012).toFixed(2)} lesões/rodada por clube → 1 a cada ${(1 / (14 * 0.012)).toFixed(1)} rodadas`);
