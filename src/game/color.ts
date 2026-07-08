// Utilitários de cor para diferenciar visualmente mandante × visitante no mosaico.

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const n = h.length === 3
    ? h.split("").map((c) => c + c).join("")
    : h;
  const num = parseInt(n, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function luminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

// Se as cores primárias de dois clubes forem parecidas demais (confuso no mosaico),
// escurece/clareia uma delas para criar contraste, mantendo o matiz reconhecível.
export function distinctPair(homeHex: string, awayHex: string): [string, string] {
  const home = hexToRgb(homeHex);
  const away = hexToRgb(awayHex);
  if (colorDistance(home, away) > 90) return [homeHex, awayHex];
  // afasta o visitante: escurece se ambos claros, clareia se ambos escuros
  const lum = luminance(away);
  const factor = lum > 128 ? 0.55 : 1.8;
  const adjusted = away.map((c) => Math.max(20, Math.min(235, Math.round(c * factor)))) as [number, number, number];
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return [homeHex, `#${toHex(adjusted[0])}${toHex(adjusted[1])}${toHex(adjusted[2])}`];
}
