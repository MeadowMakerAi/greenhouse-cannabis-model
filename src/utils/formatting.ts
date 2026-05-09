export const fmtInt = (n: number) =>
  Number.isFinite(n) ? Math.round(n).toLocaleString() : "—";

export const fmt1 = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : "—";

export const fmt2 = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "—";

export const fmtPct = (frac: number) =>
  Number.isFinite(frac) ? `${(frac * 100).toFixed(0)}%` : "—";

export const fmtCurrency = (n: number) =>
  Number.isFinite(n)
    ? n.toLocaleString(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      })
    : "—";

export const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
