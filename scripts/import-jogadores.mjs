import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

// Mapeamento de nomes de clubes do jogadores.md para o src/data/clubs.json
const CLUB_MAPPING = {
  "Flamengo": "Flamengo",
  "Palmeiras": "Palmeiras",
  "BOTAFOGO": "Botafogo",
  "Atlético-MG": "Atlético Mineiro",
  "São Paulo Futebol Clube": "São Paulo",
  "Sport Club Corinthians Paulista": "Corinthians",
  "Esporte Clube Bahia": "Bahia",
  "Fluminense Football Club": "Fluminense",
  "Grêmio Foot-Ball Porto Alegrense": "Grêmio",
  "Sport Club Internacional": "Internacional",
  "Cruzeiro Esporte Clube": "Cruzeiro",
  "Club de Regatas Vasco da Gama": "Vasco",
  "Club Athletico Paranaense": "Athletico Paranaense",
  "Red Bull Bragantino": "Red Bull Bragantino",
  "Santos Futebol Clube": "Santos",
  "Cuiabá Esporte Clube": "Cuiabá",
  "Esporte Clube Vitória": "Vitória",
  "Criciúma Esporte Clube": "Criciúma",
  "Esporte Clube Juventude": "Juventude",
  "Coritiba Foot Ball Club": "Coritiba",
  "Sport Club do Recife": "Sport",
  "Atlético Clube Goianiense": "Atlético Goianiense",
  "Goiás Esporte Clube": "Goiás",
  "Ceará Sporting Club": "Ceará",
  "América Futebol Clube": "América-MG",
  "Clube de Regatas Brasil": "CRB",
  "Avaí Futebol Clube": "Avaí",
  "Associação Chapecoense de Futebol": "Chapecoense",
  "Grêmio Novorizontino": "Novorizontino",
  "Associação Atlética Ponte Preta": "Ponte Preta",
  "Paysandu Sport Club": "Paysandu",
  "Clube do Remo": "Remo",
  "Botafogo Futebol Clube (Ribeirão Preto)": "Botafogo-SP",
  "Clube Náutico Capibaribe": "Náutico",
  "Operário Ferroviário Esporte Clube": "Operário-PR",
  "Centro Sportivo Alagoano": "CSA",
  "ABC Futebol Clube": "ABC",
  "Guarani Futebol Clube": "Guarani"
};

// Mapeamento de posições para o formato rosters.json
const POS_MAPPING = {
  "G": "GOL",
  "Goleiro": "GOL",
  "D": "DEF",
  "Defensor": "DEF",
  "M": "MEI",
  "Meio-campista": "MEI",
  "A": "ATA",
  "Atacante": "ATA"
};

function main() {
  console.log("Iniciando importação de jogadores...");

  // 1. Carregar rosters.json existente
  const rostersPath = path.join(root, "src", "data", "rosters.json");
  const rosters = JSON.parse(readFileSync(rostersPath, "utf8"));

  // 2. Carregar e limpar jogadores.md
  let mdContent = readFileSync(path.join(root, "jogadores.md"), "utf8");
  mdContent = mdContent.replace(/```json/gi, "").replace(/```/g, "");

  const lines = mdContent.split(/\r?\n/);
  const parsedTeams = [];

  let customBlockLines = [];
  let insideCustomBlock = false;

  // Parser linha por linha para tratar formatos específicos
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Formato 1: Single-line JSON (Flamengo/Palmeiras)
    if (line.startsWith('{"season":')) {
      try {
        const data = JSON.parse(line);
        parsedTeams.push({
          name: data.club,
          players: data.players
        });
        continue;
      } catch (e) {
        console.error(`Erro ao parsear JSON na linha ${i+1}:`, e.message);
      }
    }

    // Formato 2: Custom [ BOTAFOGO ... ]
    if (line === "[") {
      insideCustomBlock = true;
      customBlockLines = [];
      continue;
    }

    if (insideCustomBlock) {
      if (line === "]") {
        insideCustomBlock = false;
        const blockStr = customBlockLines.join("\n").trim();
        const firstLineBreak = blockStr.indexOf("\n");
        const teamName = blockStr.substring(0, firstLineBreak).trim();
        const playersJsonStr = "[" + blockStr.substring(firstLineBreak).trim() + "]";
        try {
          const players = JSON.parse(playersJsonStr);
          parsedTeams.push({
            name: teamName,
            players: players
          });
        } catch (e) {
          console.error(`Erro ao parsear bloco customizado para ${teamName}:`, e.message);
        }
      } else {
        customBlockLines.push(lines[i]);
      }
    }
  }

  // Formato 3: Brace-balancing parser para objetos {"team": ..., "roster": [...]}
  let pos = 0;
  while (pos < mdContent.length) {
    const nextBrace = mdContent.indexOf("{", pos);
    if (nextBrace === -1) break;

    let braceCount = 0;
    let endPos = -1;
    let inString = false;
    let escape = false;

    for (let i = nextBrace; i < mdContent.length; i++) {
      const char = mdContent[i];
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
      const objStr = mdContent.substring(nextBrace, endPos + 1);
      if (objStr.includes('"team":') || objStr.includes('"team" :')) {
        try {
          const data = JSON.parse(objStr);
          parsedTeams.push({
            name: data.team,
            players: data.roster
          });
        } catch (e) {
          // Ignora objetos internos parseados incorretamente
        }
      }
      pos = endPos + 1;
    } else {
      pos = nextBrace + 1;
    }
  }

  console.log(`Parsed ${parsedTeams.length} times do jogadores.md.`);

  // 3. Processar e agrupar jogadores por clube oficial
  const clubPlayersMap = {};

  for (const team of parsedTeams) {
    const officialName = CLUB_MAPPING[team.name];
    if (!officialName) {
      console.warn(`Aviso: Clube do jogadores.md não mapeado para nome oficial: "${team.name}"`);
      continue;
    }

    if (!clubPlayersMap[officialName]) {
      clubPlayersMap[officialName] = [];
    }

    // Adiciona os jogadores na lista do clube oficial
    for (const p of team.players) {
      // Normaliza dados do jogador
      const name = p.name ? p.name.trim() : "";
      const age = parseInt(p.age, 10);
      const mappedPos = POS_MAPPING[p.position];

      if (!name || isNaN(age) || !mappedPos) {
        console.error(`Jogador inválido no clube ${team.name}:`, p);
        continue;
      }

      clubPlayersMap[officialName].push({ name, age, position: mappedPos });
    }
  }

  // 4. Montar os novos elencos ordenados para cada clube mapeado
  let updatedCount = 0;
  for (const [officialName, players] of Object.entries(clubPlayersMap)) {
    // Deduplica jogadores pelo nome para evitar duplicatas em importações repetidas
    const uniquePlayers = [];
    const seenNames = new Set();
    for (const p of players) {
      const key = `${p.name.toLowerCase()}_${p.position}`;
      if (!seenNames.has(key)) {
        seenNames.add(key);
        uniquePlayers.push(p);
      }
    }

    // Inicializa a estrutura do elenco
    const roster = {
      GOL: [],
      DEF: [],
      MEI: [],
      ATA: []
    };

    // Agrupa e ordena por idade decrescente (priorizando veteranos)
    for (const pos of ["GOL", "DEF", "MEI", "ATA"]) {
      const posPlayers = uniquePlayers.filter(p => p.position === pos);
      // Ordenação decrescente de idade
      posPlayers.sort((a, b) => b.age - a.age);

      roster[pos] = posPlayers.map(p => `${p.name}:${p.age}`);
    }

    // Atualiza no objeto geral do rosters.json
    rosters[officialName] = roster;
    updatedCount++;
    console.log(`Clube atualizado: "${officialName}" com ${uniquePlayers.length} jogadores.`);
  }

  // 5. Salvar de volta em src/data/rosters.json
  writeFileSync(rostersPath, JSON.stringify(rosters, null, 2), "utf8");
  console.log(`\nSucesso! ${updatedCount} clubes atualizados em src/data/rosters.json.`);
}

main();
