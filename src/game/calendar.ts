// Calendário fictício da temporada: a temporada corre ao longo de um ano civil.
// A season 1 é 2026 (2025 + season). Cada semana do calendário do jogo (1..TOTAL_WEEKS,
// ver cup.ts) vira uma data real espaçada de 7 em 7 dias a partir de meados de janeiro,
// de modo que as ~50 semanas cabem dentro do mesmo ano.

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export function seasonYear(season: number): number {
  return 2025 + season;
}

// Primeiro sábado a partir de 11/jan do ano da temporada — âncora da semana 1.
function seasonStart(season: number): Date {
  const d = new Date(seasonYear(season), 0, 11); // 11 de janeiro
  const day = d.getDay();
  const toSat = (6 - day + 7) % 7; // avança até o próximo sábado
  d.setDate(d.getDate() + toSat);
  return d;
}

// Data da semana `week` (1-indexada) da temporada.
export function weekDate(season: number, week: number): Date {
  const d = seasonStart(season);
  d.setDate(d.getDate() + (week - 1) * 7);
  return d;
}

// "sáb, 17 jan" — formato curto para exibir ao lado dos jogos.
export function formatMatchDate(season: number, week: number): string {
  const d = weekDate(season, week);
  return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]}`;
}

// "sáb, 17 jan 2026" — versão com ano, para cabeçalhos.
export function formatMatchDateFull(season: number, week: number): string {
  const d = weekDate(season, week);
  return `${DIAS[d.getDay()]}, ${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`;
}
