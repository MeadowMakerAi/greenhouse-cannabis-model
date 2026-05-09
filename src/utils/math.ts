export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const round = (n: number, decimals = 1) => {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
};
export const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
export const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
export const min = (xs: number[]) => (xs.length ? Math.min(...xs) : 0);
