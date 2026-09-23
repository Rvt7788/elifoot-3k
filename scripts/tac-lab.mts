// Laboratório tático (npx tsx scripts/tac-lab.mts): o time do usuário com tática
// fixa contra a IA (estratégia pré-jogo + reações), sementes pareadas entre táticas.
//   EXP=league   números globais da Série A (IA × IA)
//   EXP=balance  formação × mentalidade e marcação em 4 cenários de força/mando
//   EXP=ingame   efeito de mudar a tática no jogo, medido só nos jogos em que mudou
//   N=...        jogos por combinação · TUNE='{"ratioExp":1.4}' sobrescreve a calibragem
import { newGame } from "../src/game/seeder";
import { createLiveMatch, simulateMinute, DEFAULT_TACTICS, TUNE } from "../src/game/engine";
import { mulberry32 } from "../src/game/rng";
import type { Tactics, Formation, LiveMatch } from "../src/types";

if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));
const g = newGame(20260712, "fla_br");
const A = g.clubs.filter((c) => c.country === "BR" && c.division === (process.env.DIV ?? "Série A"));
const top = (id: string) => {
  const s = g.players.filter((p) => p.clubId === id).sort((a, b) => b.strength - a.strength).slice(0, 11);
  return s.reduce((x, p) => x + p.strength, 0) / 11;
};
const ranked = [...A].sort((a, b) => top(b.id) - top(a.id));
const strong = ranked[2], mid1 = ranked[9], mid2 = ranked[10], weak = ranked[18];

// agenda de mudanças durante o jogo; devolve true quando a mudança foi aplicada
type Sched = (m: LiveMatch, t: Tactics, diff: number) => boolean;

function play(seed: number, userId: string, oppId: string, userHome: boolean, t: Partial<Tactics>, f: Formation, sched?: Sched) {
  const rng = mulberry32(seed >>> 0);
  const players = g.players.map((p) => ({ ...p, traits: [...p.traits] }));
  const idx = Object.fromEntries(players.map((p) => [p.id, p]));
  const us = players.filter((p) => p.clubId === userId), op = players.filter((p) => p.clubId === oppId);
  const tac: Tactics = { ...DEFAULT_TACTICS, autoSub: true, ...t };
  const m = userHome
    ? createLiveMatch(userId, oppId, us, op, undefined, undefined, tac, undefined, .5, .5, undefined, undefined, "league", f, OPPF)
    : createLiveMatch(oppId, userId, op, us, undefined, undefined, undefined, tac, .5, .5, undefined, undefined, "league", OPPF, f);
  const me = userHome ? "home" : "away";
  let triggered = false;
  while (!m.finished) {
    if (sched) {
      const diff = me === "home" ? m.homeScore - m.awayScore : m.awayScore - m.homeScore;
      if (sched(m, me === "home" ? m.homeTactics : m.awayTactics, diff)) triggered = true;
    }
    simulateMinute(rng, m, idx, me);
  }
  const gf = me === "home" ? m.homeScore : m.awayScore, ga = me === "home" ? m.awayScore : m.homeScore;
  const st = m.stats![me];
  return { gf, ga, pts: gf > ga ? 3 : gf === ga ? 1 : 0, shots: st.shots, poss: st.poss / 90, triggered };
}

type Agg = { ppg: number; win: number; draw: number; gf: number; ga: number; shots: number; poss: number };
function run(N: number, u: string, o: string, home: boolean, t: Partial<Tactics>, f: Formation = "4-4-2"): Agg {
  const a = { pts: 0, w: 0, d: 0, gf: 0, ga: 0, shots: 0, poss: 0 };
  for (let k = 0; k < N; k++) {
    const r = play(9001 + k * 7919, u, o, home, t, f);
    a.pts += r.pts; a.gf += r.gf; a.ga += r.ga; a.shots += r.shots; a.poss += r.poss;
    if (r.pts === 3) a.w++; else if (r.pts === 1) a.d++;
  }
  return { ppg: a.pts / N, win: a.w / N, draw: a.d / N, gf: a.gf / N, ga: a.ga / N, shots: a.shots / N, poss: a.poss / N };
}
const fmt = (r: Agg) =>
  `ppg ${r.ppg.toFixed(2)} V${(r.win * 100).toFixed(0)} E${(r.draw * 100).toFixed(0)} gp ${r.gf.toFixed(2)} gc ${r.ga.toFixed(2)} chutes ${r.shots.toFixed(1)} posse ${(r.poss * 100).toFixed(0)}%`;

const N = Number(process.env.N ?? 300);
const OPPF = process.env.OPPF as Formation | undefined; // formação forçada do adversário (padrão: escolha da IA)
const scenAll = [
  ["médio×médio casa", mid1.id, mid2.id, true],
  ["médio×médio fora", mid1.id, mid2.id, false],
  ["forte×fraco casa", strong.id, weak.id, true],
  ["fraco×forte fora", weak.id, strong.id, false],
] as const;
const scen = process.env.SC ? scenAll.filter((_, i) => process.env.SC!.split(",").includes(String(i))) : scenAll;
const EXP = process.env.EXP ?? "balance";

if (EXP === "league") {
  const R = Number(process.env.R ?? 4);
  let n = 0, goals = 0, hw = 0, d = 0, aw = 0, zz = 0, gol = 0, shots = 0, counters = 0;
  for (let r = 0; r < R; r++) for (let i = 0; i < A.length; i++) for (let j = 0; j < A.length; j++) {
    if (i === j) continue;
    const rng = mulberry32((1000003 * r + 97 * i + j) >>> 0);
    const players = g.players.map((p) => ({ ...p, traits: [...p.traits] }));
    const idx = Object.fromEntries(players.map((p) => [p.id, p]));
    const m = createLiveMatch(A[i].id, A[j].id, players.filter((p) => p.clubId === A[i].id), players.filter((p) => p.clubId === A[j].id));
    while (!m.finished) simulateMinute(rng, m, idx, null);
    n++; goals += m.homeScore + m.awayScore;
    if (m.homeScore > m.awayScore) hw++; else if (m.homeScore < m.awayScore) aw++; else d++;
    if (m.homeScore + m.awayScore === 0) zz++;
    if (Math.abs(m.homeScore - m.awayScore) >= 4) gol++;
    shots += m.stats!.home.shots + m.stats!.away.shots;
  }
  console.log(`LIGA ${n} jogos · gols/jogo ${(goals / n).toFixed(2)} · casa ${(100 * hw / n).toFixed(1)}% empate ${(100 * d / n).toFixed(1)}% fora ${(100 * aw / n).toFixed(1)}% · 0x0 ${(100 * zz / n).toFixed(1)}% · goleadas ${(100 * gol / n).toFixed(1)}% · chutes/jogo ${(shots / n).toFixed(1)}`);
}

if (EXP === "balance") {
  const forms: Formation[] = ["4-4-2", "4-3-3", "3-5-2", "4-5-1", "5-3-2", "3-4-3", "3-3-4"];
  const ments = ["defensivo", "equilibrado", "ofensivo", "tudo_ou_nada"] as const;
  for (const [label, u, o, h] of scen) {
    const rows: [string, Agg][] = [];
    for (const f of forms) for (const me of ments) rows.push([`${f} ${me}`, run(N, u, o, h, { mentality: me }, f)]);
    rows.sort((a, b) => b[1].ppg - a[1].ppg);
    const ref = rows.find(([k]) => k === "4-4-2 equilibrado")!;
    console.log(`\n══ ${label} ══  (ref 4-4-2 equilibrado: ${fmt(ref[1])})`);
    for (const [k, r] of rows.slice(0, 6)) console.log("  " + k.padEnd(22), fmt(r));
    console.log("  …");
    for (const [k, r] of rows.slice(-4)) console.log("  " + k.padEnd(22), fmt(r));
    // resumo por mentalidade e por formação (média das linhas)
    const avg = (pred: (k: string) => boolean) => { const rs = rows.filter(([k]) => pred(k)); return rs.reduce((s, [, r]) => s + r.ppg, 0) / rs.length; };
    console.log("  mentalidade:", ments.map((me) => `${me} ${avg((k) => k.endsWith(" " + me)).toFixed(2)}`).join(" · "));
    console.log("  formação:  ", forms.map((f) => `${f} ${avg((k) => k.startsWith(f + " ")).toFixed(2)}`).join(" · "));
    const marks = (["leve", "frouxa", "apertada", "extrema"] as const).map((mk) => `${mk} ${run(N, u, o, h, { marking: mk }).ppg.toFixed(2)}`);
    console.log("  marcação (4-4-2 eq):", marks.join(" · "));
  }
}

if (EXP === "ingame") {
  // efeito pareado: mesma semente com e sem a mudança; média só nos jogos em que ela ocorreu
  const cases: [string, Sched][] = [
    ["ganhando 75' → defensivo+apertada", (m, t, d) => m.minute === 75 && d > 0 ? (t.mentality = "defensivo", t.marking = "apertada", true) : false],
    ["ganhando 80' → def+extrema", (m, t, d) => m.minute === 80 && d > 0 ? (t.mentality = "defensivo", t.marking = "extrema", true) : false],
    ["ganhando 75' → cera", (m, t, d) => m.minute === 75 && d > 0 ? (t.cera = true, true) : false],
    ["perdendo 70' → ofensivo", (m, t, d) => m.minute === 70 && d < 0 ? (t.mentality = "ofensivo", true) : false],
    ["perdendo 75' → tudo ou nada", (m, t, d) => m.minute === 75 && d < 0 ? (t.mentality = "tudo_ou_nada", true) : false],
    ["empatando 75' → ofensivo", (m, t, d) => m.minute === 75 && d === 0 ? (t.mentality = "ofensivo", true) : false],
  ];
  const NN = N * 4;
  for (const [label, u, o, h] of scen) {
    console.log(`\n══ ${label} ══`);
    for (const [name, s] of cases) {
      let n = 0, dp = 0, base = 0;
      for (let k = 0; k < NN; k++) {
        const seed = 9001 + k * 7919;
        const r1 = play(seed, u, o, h, {}, "4-4-2", s);
        if (!r1.triggered) continue;
        const r0 = play(seed, u, o, h, {}, "4-4-2");
        n++; dp += r1.pts - r0.pts; base += r0.pts;
      }
      console.log("  " + name.padEnd(34), `jogos ${String(n).padStart(4)} · ppg sem ${(base / n).toFixed(2)} → com ${((base + dp) / n).toFixed(2)} (${dp >= 0 ? "+" : ""}${(dp / n).toFixed(2)})`);
    }
  }
}
