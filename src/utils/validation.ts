export const isFiniteNum = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);

export const requirePositive = (n: number, label: string) => {
  if (!isFiniteNum(n) || n <= 0) {
    throw new Error(`${label} must be a positive number, got ${n}`);
  }
  return n;
};
