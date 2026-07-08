// PRNG determinístico (mulberry32) para o seed do save.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rng = () => number;

export const randInt = (rng: Rng, min: number, max: number) =>
  Math.floor(rng() * (max - min + 1)) + min;

export const pick = <T>(rng: Rng, arr: T[]): T =>
  arr[Math.floor(rng() * arr.length)];

// Sorteio ponderado: cada item tem uma chance proporcional ao seu peso (nunca zero,
// mesmo o mais fraco tem alguma chance). Usado para variar quem finaliza/marca,
// em vez de sempre escolher deterministicamente o de maior força.
export function pickWeighted<T>(rng: Rng, items: T[], weight: (item: T) => number): T {
  const weights = items.map((i) => Math.max(0.01, weight(i)));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export const chance = (rng: Rng, p: number) => rng() < p;
