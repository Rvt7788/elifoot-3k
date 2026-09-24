// Puxa elencos atuais da Wikipédia (en) direto do wikitext — sem resumo por IA:
// lê a seção "Current squad" de cada clube (templates {{fs player}}), busca a
// data de nascimento de cada jogador na página dele e grava "Nome:idade".
//
// Uso: node scripts/sync-wiki-rosters.mjs <PAÍS> <saida.json>   (PAÍS: IT, PT, BR)
// Saída: { "Nome do clube no jogo": { GOL: [...], DEF: [...], MEI: [...], ATA: [...] } }
// mais um relatório no console (clubes sem elenco, jogadores sem idade).
import { writeFileSync } from "node:fs";

// por país: nome do clube no jogo → título da página na Wikipédia em inglês
const CLUBS_BY_COUNTRY = { IT: {
  // Itália — Série A 2026/27
  "Atalanta": "Atalanta BC", "Bologna": "Bologna FC 1909", "Cagliari": "Cagliari Calcio",
  "Como": "Como 1907", "Fiorentina": "ACF Fiorentina", "Frosinone": "Frosinone Calcio",
  "Genoa": "Genoa CFC", "Inter de Milão": "Inter Milan", "Juventus": "Juventus FC",
  "Lazio": "SS Lazio", "Lecce": "US Lecce", "Milan": "AC Milan", "Monza": "AC Monza",
  "Napoli": "SSC Napoli", "Parma": "Parma Calcio 1913", "Roma": "AS Roma",
  "Sassuolo": "US Sassuolo Calcio", "Torino": "Torino FC", "Udinese": "Udinese Calcio",
  "Venezia": "Venezia FC",
  // Itália — Série B 2026/27
  "Cremonese": "US Cremonese", "Hellas Verona": "Hellas Verona FC", "Pisa": "Pisa SC",
  "Vicenza": "LR Vicenza", "Arezzo": "SS Arezzo", "Benevento": "Benevento Calcio",
  "Ascoli": "Ascoli Calcio 1898 FC", "Palermo": "Palermo FC", "Südtirol": "FC Südtirol",
  "Mantova": "Mantova 1911", "Modena": "Modena FC 2018", "Avellino": "US Avellino 1912",
  "Cesena": "Cesena FC", "Empoli": "Empoli FC", "Juve Stabia": "SS Juve Stabia",
  "Padova": "Calcio Padova", "Sampdoria": "UC Sampdoria", "Virtus Entella": "Virtus Entella",
  "Carrarese": "Carrarese Calcio 1908", "Catanzaro": "US Catanzaro 1929",
}, PT: {
  // Portugal — Liga 2026/27
  "Benfica": "S.L. Benfica", "Porto": "FC Porto", "Sporting CP": "Sporting CP",
  "Braga": "S.C. Braga", "Vitória de Guimarães": "Vitória S.C.", "Famalicão": "F.C. Famalicão",
  "Arouca": "F.C. Arouca", "Santa Clara": "C.D. Santa Clara", "Gil Vicente": "Gil Vicente F.C.",
  "Casa Pia": "Casa Pia A.C.", "Rio Ave": "Rio Ave F.C.", "Estoril Praia": "G.D. Estoril Praia",
  "Moreirense": "Moreirense F.C.", "Nacional": "C.D. Nacional",
  "Estrela da Amadora": "C.F. Estrela da Amadora", "Marítimo": "C.S. Marítimo",
  "Académico de Viseu": "Académico de Viseu F.C.", "Alverca": "F.C. Alverca",
  // Portugal — Liga 2 2026/27 (sem times B)
  "Tondela": "C.D. Tondela", "AVS Futebol SAD": "AVS Futebol SAD", "Amarante": "Amarante F.C.",
  "Académica": "Associação Académica de Coimbra – O.A.F.", "Chaves": "G.D. Chaves",
  "Farense": "S.C. Farense", "Feirense": "C.D. Feirense", "Felgueiras": "F.C. Felgueiras 1932",
  "Leixões": "Leixões S.C.", "Lusitânia": "Lusitânia F.C.", "Penafiel": "F.C. Penafiel",
  "Portimonense": "Portimonense S.C.", "Torreense": "S.C.U. Torreense",
  "União de Leiria": "U.D. Leiria", "Vizela": "F.C. Vizela",
  // Portugal — Liga 3 2026/27 (os mais tradicionais, completam os 40)
  "Paços de Ferreira": "F.C. Paços de Ferreira", "Oliveirense": "U.D. Oliveirense",
  "Belenenses": "C.F. Os Belenenses", "Varzim": "Varzim S.C.", "Mafra": "C.D. Mafra",
  "Trofense": "C.D. Trofense", "Sporting da Covilhã": "S.C. Covilhã",
}, BR: {
  // Brasil — Série A 2026
  "Flamengo": "CR Flamengo", "Palmeiras": "SE Palmeiras", "Botafogo": "Botafogo FR",
  "Atlético-MG": "Clube Atlético Mineiro", "São Paulo": "São Paulo FC",
  "Corinthians": "SC Corinthians Paulista", "Bahia": "Esporte Clube Bahia",
  "Fluminense": "Fluminense FC", "Cruzeiro": "Cruzeiro Esporte Clube", "Grêmio": "Grêmio FBPA",
  "Internacional": "SC Internacional", "Vasco": "CR Vasco da Gama",
  "Atlético-PR": "Club Athletico Paranaense", "RB Bragantino": "Red Bull Bragantino",
  "Santos": "Santos FC", "Vitória": "Esporte Clube Vitória", "Mirassol": "Mirassol Futebol Clube",
  "Coritiba": "Coritiba Foot Ball Club", "Remo": "Clube do Remo",
  "Chapecoense": "Associação Chapecoense de Futebol",
  // Brasil — Série B 2026
  "Fortaleza": "Fortaleza Esporte Clube", "Ceará": "Ceará Sporting Club",
  "Sport": "Sport Club do Recife", "Juventude": "Esporte Clube Juventude",
  "Cuiabá": "Cuiabá Esporte Clube", "Atlético-GO": "Atlético Clube Goianiense",
  "Goiás": "Goiás Esporte Clube", "América-MG": "América Futebol Clube (MG)",
  "Criciúma": "Criciúma Esporte Clube", "CRB": "Clube de Regatas Brasil", "Avaí": "Avaí FC",
  "Novorizontino": "Grêmio Novorizontino", "Ponte Preta": "Associação Atlética Ponte Preta",
  "Vila Nova": "Vila Nova Futebol Clube", "Botafogo-SP": "Botafogo Futebol Clube (SP)",
  "Náutico": "Clube Náutico Capibaribe", "Operário-PR": "Operário Ferroviário Esporte Clube",
  "Londrina": "Londrina Esporte Clube", "São Bernardo": "São Bernardo Futebol Clube",
  "Athletic": "Athletic Club (MG)",
} };
const COUNTRY = process.argv[2];
const CLUBS = CLUBS_BY_COUNTRY[COUNTRY];
if (!CLUBS) throw new Error(`país inválido: ${COUNTRY} (use ${Object.keys(CLUBS_BY_COUNTRY).join(", ")})`);
// Wikipédia local para quem não tem página em inglês
const LOCAL_WIKI = { IT: "it", PT: "pt", BR: "pt" }[COUNTRY];

const POS = { GK: "GOL", DF: "DEF", MF: "MEI", FW: "ATA" };
// idade na virada da temporada (1º de julho), como no restante do rosters.json
const REF = new Date(Date.UTC(2026, 6, 1));
const UA = "elifoot-3k-roster-sync/1.0 (rafaelvteixeira@gmail.com)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// resposta grande derruba a conexão: tenta de novo algumas vezes
async function getJson(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      return await res.json();
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(1500 * attempt);
    }
  }
}

// wikitext de poucas páginas por chamada (são páginas inteiras), seguindo redirecionamentos
async function fetchPages(titles, wiki = "en", size = 8) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += size) {
    const batch = titles.slice(i, i + size);
    const url = `https://${wiki}.wikipedia.org/w/api.php?` + new URLSearchParams({
      action: "query", prop: "revisions", rvprop: "content", rvslots: "main",
      redirects: "1", format: "json", formatversion: "2", titles: batch.join("|"),
    });
    const json = await getJson(url);
    const alias = new Map();
    for (const n of json.query?.normalized ?? []) alias.set(n.from, n.to);
    for (const r of json.query?.redirects ?? []) alias.set(r.from, r.to);
    const content = new Map();
    for (const p of json.query?.pages ?? [])
      if (!p.missing) content.set(p.title, p.revisions?.[0]?.slots?.main?.content ?? "");
    for (const t of batch) {
      let k = t;
      for (let hop = 0; hop < 3 && alias.has(k); hop++) k = alias.get(k);
      out.set(t, content.get(k) ?? null);
    }
    await sleep(300);
  }
  return out;
}

// primeiro bloco {{fs start}}…{{fs end}} depois do título do elenco principal
function parseSquad(text) {
  const heading = text.search(/^=+\s*(Current squad|First[- ]team squad|Current first[- ]team squad|First[- ]team|Squad|Players|Current players)\s*=+\s*$/im);
  if (heading < 0) return null;
  const rest = text.slice(heading);
  const start = rest.search(/\{\{\s*fs start/i);
  if (start < 0) return null;
  const endRel = rest.slice(start).search(/\{\{\s*fs end\s*\}\}/i);
  const block = rest.slice(start, endRel < 0 ? undefined : start + endRel);
  const players = [];
  const re = /\{\{\s*(?:fs player|football squad player)\s*\|([^\n]*)\}\}/gi;
  let m;
  while ((m = re.exec(block))) {
    const params = m[1];
    const pos = params.match(/\bpos\s*=\s*(GK|DF|MF|FW)/i)?.[1]?.toUpperCase();
    const nameRaw = params.match(/\bname\s*=\s*(.*?)(?:\|\s*(?:other|no|nat|pos)\s*=|$)/i)?.[1]?.trim();
    if (!pos || !nameRaw) continue;
    let target = null;
    let label = nameRaw;
    const link = nameRaw.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    const sortname = nameRaw.match(/\{\{\s*sortname\s*\|([^|}]+)\|([^|}]+)(?:\|([^|}]+))?/i);
    if (link) {
      target = link[1].trim();
      label = (link[2] ?? link[1]).trim();
    } else if (sortname) {
      label = `${sortname[1].trim()} ${sortname[2].trim()}`;
      target = sortname[3]?.trim() && !sortname[3].includes("=") ? sortname[3].trim() : label;
    }
    label = label.replace(/\s*\(.*?\)\s*$/, "").replace(/'''?/g, "").trim();
    players.push({ pos: POS[pos], name: label, target });
  }
  return players;
}

function ageFrom(text) {
  if (!text) return null;
  const m = text.match(/\{\{\s*(?:birth date and age|bda|birth date|dob)\s*\|([^}]*)\}\}/i);
  if (!m) return null;
  const nums = m[1].split("|").map((s) => s.trim()).filter((s) => /^\d+$/.test(s)).map(Number);
  if (nums.length < 3) return null;
  const [y, mo, d] = nums;
  let age = REF.getUTCFullYear() - y;
  if (mo > 7 || (mo === 7 && d > 1)) age--;
  return age >= 16 && age <= 45 ? age : null;
}

// Wikipédias locais: jogador de divisão de acesso costuma ter página só no it/pt.
// Só vale se a página for de futebolista E citar o clube — evita homônimos.
const IT_MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio",
  "agosto", "settembre", "ottobre", "novembre", "dicembre"];
function ageFromDate(y, mo, d) {
  let age = REF.getUTCFullYear() - y;
  if (mo > 7 || (mo === 7 && d > 1)) age--;
  return age >= 16 && age <= 45 ? age : null;
}
function ageFromIt(text, keyword) {
  if (!text || !/Attività\s*=\s*calciatore/i.test(text) || !text.includes(keyword)) return null;
  const y = text.match(/AnnoNascita\s*=\s*(\d{4})/)?.[1];
  if (!y) return null;
  const gm = text.match(/GiornoMeseNascita\s*=\s*(\d{1,2})[º°]?\s+([a-z]+)/i);
  const mo = gm ? IT_MONTHS.indexOf(gm[2].toLowerCase()) + 1 : 1;
  return ageFromDate(Number(y), mo || 1, gm ? Number(gm[1]) : 1);
}
function ageFromPt(text, keyword) {
  if (!text || !/futebolista|Info\/Futebolista/i.test(text) || !text.includes(keyword)) return null;
  const dni = text.match(/\{\{\s*dni(?:br)?\s*\|(?:[a-z]+=[^|}]*\|)*\s*(\d{1,2})\s*\|\s*(\d{1,2})\s*\|\s*(\d{4})/i);
  if (dni) return ageFromDate(Number(dni[3]), Number(dni[2]), Number(dni[1]));
  const dnei = text.match(/\{\{\s*(?:data de nascimento e idade|nascimento e idade)\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})/i);
  if (dnei) return ageFromDate(Number(dnei[1]), Number(dnei[2]), Number(dnei[3]));
  return null;
}
// palavra que a página do jogador precisa citar para confirmar o clube
const KEYWORD = {
  "Inter de Milão": "Inter", "AVS Futebol SAD": "AVS", "Sporting da Covilhã": "Covilhã",
  "União de Leiria": "Leiria", "Académico de Viseu": "Viseu", "Vitória de Guimarães": "Vitória",
  "Estrela da Amadora": "Amadora", "Estoril Praia": "Estoril", "Paços de Ferreira": "Paços",
  "Hellas Verona": "Verona", "Virtus Entella": "Entella", "Lusitânia": "Lusitânia",
  "Atlético-PR": "Athletico", "Atlético-MG": "Atlético", "Atlético-GO": "Atlético",
  "RB Bragantino": "Bragantino", "América-MG": "América", "Operário-PR": "Operário",
  "Botafogo-SP": "Botafogo", "Vasco": "Vasco",
};

const out = {};
const report = { noSquad: [], small: [], noAge: 0, total: 0 };
const clubPages = await fetchPages(Object.values(CLUBS));
const squads = {};
for (const [club, title] of Object.entries(CLUBS)) {
  const players = parseSquad(clubPages.get(title) ?? "");
  if (!players || players.length === 0) { report.noSquad.push(`${club} (${title})`); continue; }
  squads[club] = players;
}
const targets = [...new Set(Object.values(squads).flat().map((p) => p.target).filter(Boolean))];
const playerPages = await fetchPages(targets);
// segunda tentativa, na Wikipédia do país, para quem ficou sem idade
for (const [club, players] of Object.entries(squads))
  for (const p of players) p.age = p.target ? ageFrom(playerPages.get(p.target)) : null;
{
  const pending = Object.entries(squads)
    .flatMap(([club, players]) => players.filter((p) => p.age == null).map((p) => ({ club, p })));
  const titles = [...new Set(pending.map(({ p }) => p.name))];
  const pages = await fetchPages(titles, LOCAL_WIKI);
  for (const { club, p } of pending) {
    const kw = KEYWORD[club] ?? club;
    p.age = LOCAL_WIKI === "it" ? ageFromIt(pages.get(p.name), kw) : ageFromPt(pages.get(p.name), kw);
  }
}
for (const [club, players] of Object.entries(squads)) {
  const roster = { GOL: [], DEF: [], MEI: [], ATA: [] };
  for (const p of players) {
    const age = p.age;
    report.total++;
    if (age == null) report.noAge++;
    roster[p.pos].push(age == null ? p.name : `${p.name}:${String(age).padStart(2, "0")}`);
  }
  out[club] = roster;
  const counts = Object.values(roster).map((a) => a.length);
  if (roster.GOL.length < 2 || counts.reduce((s, n) => s + n, 0) < 18)
    report.small.push(`${club} ${counts.join("/")}`);
}

writeFileSync(process.argv[3] ?? `wiki-rosters-${COUNTRY}.json`, JSON.stringify(out, null, 2));
console.log(`clubes com elenco: ${Object.keys(out).length}/${Object.keys(CLUBS).length}`);
console.log(`jogadores: ${report.total}, sem idade: ${report.noAge}`);
console.log("sem elenco na página:", report.noSquad.join("; ") || "nenhum");
console.log("elencos curtos (GOL/DEF/MEI/ATA):", report.small.join("; ") || "nenhum");
