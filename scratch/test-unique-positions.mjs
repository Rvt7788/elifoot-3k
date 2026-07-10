import { readFileSync } from "node:fs";
import path from "node:path";

const root = "c:\\Rafael\\elifoot 3k";
let content = readFileSync(path.join(root, "jogadores.md"), "utf8");

content = content.replace(/```json/gi, "").replace(/```/g, "");
const lines = content.split(/\r?\n/);
const positions = new Set();

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line.startsWith('{"season":')) {
    const data = JSON.parse(line);
    for (const p of data.players) positions.add(p.position);
  }
}

// Balance braces for JSON objects
let pos = 0;
while (pos < content.length) {
  const nextBrace = content.indexOf("{", pos);
  if (nextBrace === -1) break;
  let braceCount = 0;
  let endPos = -1;
  let inString = false;
  let escape = false;

  for (let i = nextBrace; i < content.length; i++) {
    const char = content[i];
    if (escape) { escape = false; continue; }
    if (char === "\\") { escape = true; continue; }
    if (char === '"') { inString = !inString; continue; }
    if (!inString) {
      if (char === "{") braceCount++;
      else if (char === "}") {
        braceCount--;
        if (braceCount === 0) { endPos = i; break; }
      }
    }
  }

  if (endPos !== -1) {
    const objStr = content.substring(nextBrace, endPos + 1);
    if (objStr.includes('"team":') || objStr.includes('"team" :')) {
      try {
        const data = JSON.parse(objStr);
        for (const p of data.roster) positions.add(p.position);
      } catch (e) {}
    }
    pos = endPos + 1;
  } else {
    pos = nextBrace + 1;
  }
}

console.log("Positions found:", Array.from(positions));
