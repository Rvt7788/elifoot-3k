// Nome da liga por código de país, para exibir por extenso (ex.: "BR" → "Liga Brasileira").
export const LEAGUE_NAMES: Record<string, string> = {
  BR: "Liga Brasileira",
  AR: "Liga Argentina",
  EN: "Liga Inglesa",
  ES: "Liga Espanhola",
  DE: "Liga Alemã",
  FR: "Liga Francesa",
  IT: "Liga Italiana",
  PT: "Liga Portuguesa",
};

export const leagueName = (country: string) => LEAGUE_NAMES[country] ?? country;

// Nome real da copa nacional de cada país (ex.: "BR" → "Copa do Brasil").
export const CUP_NAMES: Record<string, string> = {
  BR: "Copa do Brasil",
  AR: "Copa Argentina",
  EN: "Copa da Inglaterra",
  ES: "Copa do Rei",
  DE: "Copa da Alemanha",
  FR: "Copa da França",
  IT: "Copa da Itália",
  PT: "Taça de Portugal",
};

export const cupName = (country: string) => CUP_NAMES[country] ?? "Copa Nacional";

// Nome da competição continental da confederação do país.
export const continentalName = (country: string) =>
  ["BR", "AR"].includes(country) ? "Libertadores" : "Champions";
