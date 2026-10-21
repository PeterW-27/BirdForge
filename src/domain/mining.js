export const ORES = Object.freeze(['coal', 'iron', 'copper', 'silver', 'gold', 'ruby']);
export const emptyHaul = () => Object.fromEntries(ORES.map((ore) => [ore, 0]));
export const mineDate = (at = new Date()) => new Date(at).toISOString().slice(0, 10);

export function seededRandom(seed) {
  let h = 2166136261;
  for (const char of String(seed)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function dailyPrices(date) {
  const random = seededRandom(date);
  const base = [150, 400, 600, 1500, 4000, 9000];
  return Object.fromEntries(ORES.map((ore, i) => [ore, Math.round(base[i] * (.9 + random() * .2))]));
}
