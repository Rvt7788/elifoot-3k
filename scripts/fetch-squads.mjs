import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error("ERRO: Variável de ambiente GEMINI_API_KEY não definida.");
  console.error("Execute o comando para definir sua chave. Exemplo:");
  console.error("$env:GEMINI_API_KEY=\"sua-chave\" (Windows/PowerShell)");
  console.error("export GEMINI_API_KEY=\"sua-chave\" (Mac/Linux)");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(API_KEY);
// Usando o modelo gemini-3.5-flash que testamos e está rodando liso sem erro 503
const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" }); 

const clubs = [
  // Inglaterra
  "Manchester City", "Arsenal", "Liverpool", "Chelsea", "Manchester United", "Newcastle", "Tottenham", "Aston Villa", "West Ham", "Brighton", "Everton", "Leicester", "Crystal Palace", "Wolves", "Fulham", "Nottingham Forest", "Bournemouth", "Brentford", "Southampton", "Ipswich Town", "Leeds United", "Burnley", "Luton Town", "Middlesbrough", "Sheffield United", "Sunderland", "Watford", "Stoke City", "West Bromwich", "Norwich City", "Swansea City", "Cardiff City", "Coventry City", "Bristol City", "Hull City", "Blackburn Rovers", "Preston North End", "Queens Park Rangers", "Millwall", "Derby County",
  
  // Espanha
  "Real Madrid", "Barcelona", "Atlético de Madrid", "Girona", "Real Sociedad", "Villarreal", "Athletic Bilbao", "Real Betis", "Sevilla", "Valencia", "Celta de Vigo", "Osasuna", "Getafe", "Mallorca", "Rayo Vallecano", "Espanyol", "Las Palmas", "Alavés", "Real Valladolid", "Leganés", "Almería", "Cádiz", "Granada", "Deportivo La Coruña", "Real Zaragoza", "Levante", "Eibar", "Elche", "Real Oviedo", "Sporting Gijón", "Racing Santander", "Tenerife", "Albacete", "Huesca", "Burgos", "Mirandés", "Cartagena", "Córdoba", "Castellón", "Málaga",
  
  // Argentina
  "River Plate", "Boca Juniors", "Racing Club", "Estudiantes", "Talleres de Córdoba", "Independiente", "San Lorenzo", "Vélez Sarsfield", "Rosario Central", "Huracán", "Newell's Old Boys", "Lanús", "Defensa y Justicia", "Godoy Cruz", "Argentinos Juniors", "Belgrano", "Atlético Tucumán", "Unión de Santa Fe", "Banfield", "Gimnasia La Plata", "Instituto", "Platense", "Barracas Central", "Central Córdoba", "Colón", "San Martín de Tucumán", "Quilmes", "Arsenal de Sarandí", "Chacarita Juniors", "Ferro Carril Oeste", "Tigre", "Independiente Rivadavia", "Aldosivi", "Sarmiento", "Deportivo Riestra", "All Boys", "Nueva Chicago", "Almirante Brown", "Temperley", "Los Andes"
];

function getPrompt(clubName) {
  return `Coloque o nome do time no cabeçalho do .json

Monte o elenco "${clubName}" 10/07/2026. Use apenas jogadores ativos no elenco profissional. Valide pela fonte oficial do clube, confira em uma fonte atual de elenco e remova qualquer atleta vendido, emprestado ou fora do clube. Se houver conflito, use a informação mais recente e confirme por notícia. 

Retorne SÓ um JSON válido seguindo EXATAMENTE esta estrutura (onde a posição é GOL, DEF, MEI ou ATA e os dados são string "nome:idade"):

{
  "${clubName}": {
    "GOL": [
      "Nome do Goleiro:idade"
    ],
    "DEF": [
      "Nome do Zagueiro 1:idade",
      "Nome do Zagueiro 2:idade",
      "Nome do Lateral:idade"
    ],
    "MEI": [
      "Nome do Meia 1:idade",
      "Nome do Meia 2:idade"
    ],
    "ATA": [
      "Nome do Atacante 1:idade",
      "Nome do Atacante 2:idade"
    ]
  }
}

Regras vitais:
1. Retorne APENAS o JSON válido. Sem blocos de código (markdown \`\`\`), sem texto explicativo antes ou depois.
2. Cada jogador deve respeitar ESTRITAMENTE o formato "Nome:idade" como exigido acima, classificado em GOL, DEF, MEI ou ATA.
3. Certifique-se de que nenhum jogador retornado está emprestado ou vendido.`;
}

async function fetchSquad(club) {
  try {
    const result = await model.generateContent(getPrompt(club));
    let text = result.response.text();
    text = text.replace(/^```json/gi, "").replace(/```$/g, "").trim();
    return JSON.parse(text);
  } catch (err) {
    console.error(`\n[ERRO] Falha ao processar o clube ${club}:`, err.message || err);
    return null;
  }
}

async function main() {
  const resultFile = "squads_generated.json";
  let results = {};
  
  if (fs.existsSync(resultFile)) {
    try {
      results = JSON.parse(fs.readFileSync(resultFile, "utf8"));
      console.log(`Arquivo ${resultFile} encontrado. Continuando de onde parou...`);
    } catch (e) {
      console.log(`Não foi possível ler ${resultFile}, começando um novo arquivo.`);
    }
  }

  for (let i = 0; i < clubs.length; i++) {
    const club = clubs[i];
    
    // Pula se já tiver sido gerado com sucesso
    if (results[club]) {
      console.log(`[${i + 1}/${clubs.length}] ${club} já está no JSON. Pulando...`);
      continue;
    }
    
    console.log(`[${i + 1}/${clubs.length}] Buscando elenco do ${club}...`);
    
    const squad = await fetchSquad(club);
    if (squad && squad[club]) {
      results[club] = squad[club];
      // Salva a cada iteração, para não perder dados se a API falhar
      fs.writeFileSync(resultFile, JSON.stringify(results, null, 2), "utf8");
      console.log(` -> Sucesso! Salvo.`);
    } else {
      console.log(` -> Falhou. Formato inesperado ou erro da API.`);
    }
    
    // Aguarda um tempo para evitar bater no rate limit da API gratuita (limite de 15 por minuto no Flash)
    await new Promise(r => setTimeout(r, 4500));
  }
  
  console.log("\nProcessamento concluído! Todos os elencos foram salvos em squads_generated.json");
}

main();
