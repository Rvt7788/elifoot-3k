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
