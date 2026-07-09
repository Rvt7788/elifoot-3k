// Consolida os JSONs de ligas da raiz + scripts/extra-clubs.json em src/data/clubs.json.
// Redistribui cada país em Série A (20) e Série B (20) por baseBudget.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

const SOURCES = [
  { file: "ligabrasil.json", country: "BR", region: "América do Sul" },
  { file: "ligaargentina.json", country: "AR", region: "América do Sul" },
  { file: "ligainglaterra.json", country: "EN", region: "Europa" },
  { file: "ligaespanha.json", country: "ES", region: "Europa" },
  { file: "ligaalema.json", country: "DE", region: "Europa" },
  { file: "ligafrancesa.json", country: "FR", region: "Europa" },
  { file: "ligaportuguesa.json", country: "PT", region: "Europa" },
  { file: "ligaitaliana.json", country: "IT", region: "Europa" },
];

const extras = JSON.parse(
  readFileSync(path.join(root, "scripts", "extra-clubs.json"), "utf8"),
);

const all = [];
for (const src of SOURCES) {
  const clubs = [
    ...JSON.parse(readFileSync(path.join(root, src.file), "utf8")),
    ...(extras[src.country] ?? []),
  ];
  clubs.sort((a, b) => b.baseBudget - a.baseBudget);
  clubs.slice(0, 40).forEach((c, i) => {
    all.push({
      ...c,
      division: i < 20 ? "Série A" : "Série B",
      country: src.country,
      region: src.region,
    });
  });
  if (clubs.length < 40)
    console.warn(`${src.file}: só ${clubs.length} clubes (esperado >= 40)`);
}

mkdirSync(path.join(root, "src", "data"), { recursive: true });
writeFileSync(
  path.join(root, "src", "data", "clubs.json"),
  JSON.stringify(all, null, 2),
);
console.log(`OK: ${all.length} clubes gravados em src/data/clubs.json`);
