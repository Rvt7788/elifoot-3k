import { readFileSync } from "node:fs";
import path from "node:path";

const root = "c:\\Rafael\\elifoot 3k";
const r = JSON.parse(readFileSync(path.join(root, "src", "data", "rosters.json"), "utf8"));

let names = 0;
let withAge = 0;
let bad = [];

for (const [club, byPos] of Object.entries(r)) {
  for (const [pos, list] of Object.entries(byPos)) {
    for (const n of list) {
      names++;
      const m = n.match(/:(\d{2})$/);
      if (m) {
        withAge++;
        const a = parseInt(m[1], 10);
        if (a < 16 || a > 45) {
          bad.push(`${club} [${pos}]: ${n} (idade fora do limite 16-45)`);
        }
      } else if (/:/.test(n)) {
        bad.push(`${club} [${pos}]: ${n} (formato inválido com dois pontos)`);
      } else {
        // Player without age is allowed as fallback, but let's log if there are any
      }
    }
  }
}

console.log('Total de nomes:', names);
console.log('Nomes com idade:', withAge);
console.log('Entradas inválidas:', bad.length);
if (bad.length > 0) {
  console.log("Erros encontrados:");
  console.log(bad.join('\n'));
  process.exit(1);
} else {
  console.log("Validação concluída com sucesso! Todos os registros estão corretos.");
}
