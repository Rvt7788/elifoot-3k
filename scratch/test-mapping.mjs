import { readFileSync } from "node:fs";
import path from "node:path";

const root = "c:\\Rafael\\elifoot 3k";
const clubs = JSON.parse(readFileSync(path.join(root, "src", "data", "clubs.json"), "utf8"));
const brClubs = clubs.filter(c => c.country === "BR");

console.log("Total clubs in BR:", brClubs.length);
for (const c of brClubs) {
  console.log(`- ${c.name} (${c.shortName}) [${c.division}]`);
}
