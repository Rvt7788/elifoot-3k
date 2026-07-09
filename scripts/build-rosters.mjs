// Extrai os elencos reais pesquisados em levantamento_elencos.md e gera
// src/data/rosters.json: { "Nome do Clube": { GOL: [...], DEF: [...], MEI: [...], ATA: [...] } }
// Usado pelo seeder como pool de nomes reais (com fallback ao gerador procedural
// quando o clube não tiver entrada ou faltar jogador para uma posição).
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const md = readFileSync(path.join(root, "levantamento_elencos.md"), "utf8");

const rosters = {};
const clubBlockRe = /^- \[x\] \*\*(.+?)\*\* \([^)]*\)\n((?:[ \t]+- .*\n?)+)/gm;

let match;
let count = 0;
while ((match = clubBlockRe.exec(md))) {
  const clubName = match[1].trim();
  const body = match[2];
  const roster = { GOL: [], DEF: [], MEI: [], ATA: [] };
  for (const pos of ["GOL", "DEF", "MEI", "ATA"]) {
    const lineRe = new RegExp(`\\*\\*${pos}:\\*\\*\\s*(.+)`);
    const lm = body.match(lineRe);
    if (!lm) continue;
    roster[pos] = lm[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (Object.values(roster).some((arr) => arr.length > 0)) {
    rosters[clubName] = roster;
    count++;
  }
}

mkdirSync(path.join(root, "src", "data"), { recursive: true });
writeFileSync(
  path.join(root, "src", "data", "rosters.json"),
  JSON.stringify(rosters, null, 2),
);
console.log(`OK: ${count} elencos reais gravados em src/data/rosters.json`);
