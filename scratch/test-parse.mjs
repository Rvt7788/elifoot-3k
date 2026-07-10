import { readFileSync } from "node:fs";
import path from "node:path";

const root = "c:\\Rafael\\elifoot 3k";
const md = readFileSync(path.join(root, "jogadores.md"), "utf8");

// We want to parse the blocks in jogadores.md.
// Let's split the file by blank lines or construct a custom parser.
// The file has:
// 1. One-line JSONs:
//    {"season":2026,"club":"Flamengo",...}
// 2. Custom array formatting:
//    [
//        BOTAFOGO
//      { ... },
//      ...
//    ]
// 3. Multi-line JSON objects:
//    {
//      "team": "São Paulo Futebol Clube",
//      "roster": [ ... ]
//    }

const lines = md.split(/\r?\n/);
let currentBlock = [];
const blocks = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  if (line === "" && currentBlock.length > 0) {
    blocks.push(currentBlock.join("\n"));
    currentBlock = [];
  } else if (line !== "") {
    currentBlock.push(lines[i]);
  }
}
if (currentBlock.length > 0) {
  blocks.push(currentBlock.join("\n"));
}

console.log(`Encontrados ${blocks.length} blocos de texto.`);

// Let's try parsing each block
const teamsData = [];

for (let idx = 0; idx < blocks.length; idx++) {
  const block = blocks[idx].trim();
  if (!block) continue;

  // Try parsing as single-line/multi-line standard JSON first
  try {
    const data = JSON.parse(block);
    if (data.club && data.players) {
      teamsData.push({
        team: data.club,
        players: data.players
      });
      continue;
    }
    if (data.team && data.roster) {
      teamsData.push({
        team: data.team,
        players: data.roster
      });
      continue;
    }
  } catch (err) {
    // Standard JSON parsing failed.
    // Let's check if it's the custom array format:
    // [
    //     BOTAFOGO
    //   { ... },
    //   ...
    // ]
    if (block.startsWith("[") && block.endsWith("]")) {
      // Find the team name. It's usually the first word/line inside the brackets.
      const linesInBlock = block.split("\n");
      let teamName = "";
      let jsonContent = "";
      for (const line of linesInBlock) {
        const trimmed = line.trim();
        if (trimmed === "[" || trimmed === "]") continue;
        if (!teamName && !trimmed.startsWith("{") && !trimmed.startsWith("}")) {
          teamName = trimmed;
        } else {
          jsonContent += line + "\n";
        }
      }
      
      if (teamName) {
        // Wrap the jsonContent in [ ... ] to parse it as a JSON array of players
        try {
          // Normalize trailing commas if any, but let's just try to parse it first
          // Wait, the JSON array could have a trailing comma before the closing bracket.
          // Let's clean it up if needed.
          const cleanedJson = "[" + jsonContent.trim().replace(/,\s*$/, "") + "]";
          const players = JSON.parse(cleanedJson);
          teamsData.push({
            team: teamName,
            players: players
          });
          continue;
        } catch (e) {
          console.error(`Erro ao parsear custom array para ${teamName}:`, e.message);
        }
      }
    }
    console.error(`Não foi possível parsear bloco ${idx + 1} (começa com: ${block.slice(0, 50)}...)`);
  }
}

console.log(`Parsed ${teamsData.length} teams.`);
for (const t of teamsData) {
  console.log(`Club: ${t.team} - Players: ${t.players?.length}`);
}
