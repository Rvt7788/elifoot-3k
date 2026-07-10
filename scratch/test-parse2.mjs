import { readFileSync } from "node:fs";
import path from "node:path";

const root = "c:\\Rafael\\elifoot 3k";
let content = readFileSync(path.join(root, "jogadores.md"), "utf8");

// Step 1: Remove markdown code block markers
content = content.replace(/```json/gi, "");
content = content.replace(/```/g, "");

// Step 2: Let's extract Flamengo and Palmeiras lines
// These are single-line JSONs starting with {"season":
const lines = content.split(/\r?\n/);
const teams = [];

let customBlocks = [];
let insideCustomBlock = false;
let customBlockLines = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  // Check if it's one of the single line JSON entries (Flamengo/Palmeiras)
  if (line.startsWith('{"season":')) {
    try {
      const data = JSON.parse(line);
      teams.push({
        name: data.club,
        players: data.players.map(p => ({
          name: p.name,
          position: p.position,
          age: p.age
        }))
      });
      continue;
    } catch (e) {
      console.error(`Failed to parse single-line JSON on line ${i+1}:`, e.message);
    }
  }

  // Check if it is the start of a custom bracket block (Botafogo / Atletico-MG)
  if (line === "[") {
    insideCustomBlock = true;
    customBlockLines = [];
    continue;
  }

  if (insideCustomBlock) {
    if (line === "]") {
      insideCustomBlock = false;
      // Process the custom block
      const blockStr = customBlockLines.join("\n").trim();
      // The first non-empty line/part of the block is the team name, e.g. BOTAFOGO or Atlético-MG
      const firstLineBreak = blockStr.indexOf("\n");
      const teamName = blockStr.substring(0, firstLineBreak).trim();
      const playersJsonStr = "[" + blockStr.substring(firstLineBreak).trim() + "]";
      try {
        const players = JSON.parse(playersJsonStr);
        teams.push({
          name: teamName,
          players: players.map(p => ({
            name: p.name,
            position: p.position,
            age: p.age
          }))
        });
      } catch (e) {
        console.error(`Failed to parse custom block players for ${teamName}:`, e.message);
      }
      continue;
    } else {
      customBlockLines.push(lines[i]);
      continue;
    }
  }
}

// Now let's try to find all valid JSON objects starting with { and ending with }
// in the remaining text or the whole text, but ignoring the ones we already handled.
// Wait! The rest of the file consists of JSON objects:
// {
//   "team": "...",
//   "roster": [ ... ]
// }
// We can use a regex to match these JSON objects or a simple parser that balances curly braces.
// Let's write a simple brace-balancing parser for the entire content, ignoring Flamengo/Palmeiras lines and the custom [ ] blocks.
// Better: we can extract all { ... } objects that have a "team" property.
// Let's search for `{` and balance braces to extract full JSON objects.

let pos = 0;
while (pos < content.length) {
  const nextBrace = content.indexOf("{", pos);
  if (nextBrace === -1) break;

  // Let's see if this { is part of a "team" object.
  // We can balance braces to extract the whole object.
  let braceCount = 0;
  let endPos = -1;
  let inString = false;
  let escape = false;

  for (let i = nextBrace; i < content.length; i++) {
    const char = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") {
        braceCount++;
      } else if (char === "}") {
        braceCount--;
        if (braceCount === 0) {
          endPos = i;
          break;
        }
      }
    }
  }

  if (endPos !== -1) {
    const objStr = content.substring(nextBrace, endPos + 1);
    // Let's see if it's a team object
    if (objStr.includes('"team":') || objStr.includes('"team" :')) {
      try {
        const data = JSON.parse(objStr);
        teams.push({
          name: data.team,
          players: data.roster.map(p => ({
            name: p.name,
            position: p.position,
            age: p.age
          }))
        });
      } catch (e) {
        // It might be a player object inside a roster, or invalid JSON, ignore or log
      }
    }
    pos = endPos + 1;
  } else {
    pos = nextBrace + 1;
  }
}

console.log(`Parsed ${teams.length} teams.`);
for (const t of teams) {
  console.log(`Club: ${t.name} - Players: ${t.players?.length}`);
}
