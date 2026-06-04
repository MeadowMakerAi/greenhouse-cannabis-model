import type { DailyTempHistory } from "../services/siteIntelligenceClient";

/**
 * Derive a property's agronomic profile from multi-year daily temperature
 * history + elevation: frost dates, frost-free season length, growing degree
 * days, USDA hardiness zone, and a plain-English brief. This is the "knows the
 * site better than the grower" layer, computed from real coordinate data.
 */

export interface SiteProfile {
  elevationFt: number | null;
  /** Average last spring frost (≤32 °F), as month/day label. */
  lastSpringFrost: string;
  /** Average first fall frost. */
  firstFallFrost: string;
  /** Average frost-free days between them. */
  frostFreeDays: number;
  /** Average annual GDD base-50 °F. */
  gddBase50: number;
  /** Average annual extreme minimum temp °F (drives hardiness). */
  extremeMinF: number;
  /** USDA hardiness zone string, e.g. "6a". */
  hardinessZone: string;
  /** Years of data used. */
  years: number;
  /** Plain-English site brief — lead with this, hide the rest. */
  brief: string;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function mdLabel(date: Date): string {
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

/** USDA hardiness zone from the average annual extreme minimum (°F). */
export function hardinessZone(extremeMinF: number): string {
  // Zone 1a starts at −60 °F; each full zone spans 10 °F, split a/b at 5 °F.
  const z = Math.floor((extremeMinF + 60) / 10) + 1;
  const zoneNum = Math.max(1, Math.min(13, z));
  const half = extremeMinF - (-60 + (zoneNum - 1) * 10) >= 5 ? "b" : "a";
  return `${zoneNum}${half}`;
}

export function computeSiteProfile(
  history: DailyTempHistory,
  elevationFt: number | null,
): SiteProfile | null {
  const { time, tMinF, tMaxF } = history;
  if (time.length < 365) return null;

  // Group day indices by year.
  const byYear = new Map<number, number[]>();
  time.forEach((iso, i) => {
    const y = Number(iso.slice(0, 4));
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(i);
  });

  const lastSpringDoys: number[] = [];
  const firstFallDoys: number[] = [];
  const gddYearly: number[] = [];
  const extremeMins: number[] = [];

  for (const [, idxs] of byYear) {
    if (idxs.length < 300) continue; // skip partial years
    let lastSpring = -1; // last day-of-year (Jan–Jun) at/below freezing
    let firstFall = -1; // first day-of-year (Jul–Dec) at/below freezing
    let gdd = 0;
    let extremeMin = Infinity;
    idxs.forEach((i, dayOfYear) => {
      const lo = tMinF[i];
      const hi = tMaxF[i];
      extremeMin = Math.min(extremeMin, lo);
      // GDD base 50, capped at 86 °F upper (standard agronomic cap)
      const meanCapped = (Math.min(86, hi) + Math.max(50, lo)) / 2;
      gdd += Math.max(0, meanCapped - 50);
      if (lo <= 32) {
        if (dayOfYear < 182) lastSpring = dayOfYear;
        else if (firstFall === -1) firstFall = dayOfYear;
      }
    });
    if (lastSpring >= 0) lastSpringDoys.push(lastSpring);
    if (firstFall >= 0) firstFallDoys.push(firstFall);
    gddYearly.push(gdd);
    if (Number.isFinite(extremeMin)) extremeMins.push(extremeMin);
  }

  const avg = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const avgLastSpring = Math.round(avg(lastSpringDoys));
  const avgFirstFall = Math.round(avg(firstFallDoys));
  const refYear = 2023; // non-leap reference for labelling
  const springDate = new Date(refYear, 0, 1);
  springDate.setDate(avgLastSpring + 1);
  const fallDate = new Date(refYear, 0, 1);
  fallDate.setDate(avgFirstFall + 1);
  const frostFreeDays = Math.max(0, avgFirstFall - avgLastSpring);
  const gddBase50 = Math.round(avg(gddYearly));
  const extremeMinF = Math.round(avg(extremeMins));
  const zone = hardinessZone(extremeMinF);
  const years = gddYearly.length;

  const elevPart =
    elevationFt != null ? `${Math.round(elevationFt)} ft elevation. ` : "";
  const brief =
    `${elevPart}USDA zone ${zone} (avg annual low ${extremeMinF} °F). ` +
    `Outdoor growing window runs ~${frostFreeDays} frost-free days, ${mdLabel(springDate)} to ${mdLabel(fallDate)}, accumulating ~${gddBase50.toLocaleString()} GDD₅₀ — ` +
    `${gddBase50 > 3500 ? "a long, warm season" : gddBase50 > 2500 ? "a solid mid-latitude season" : "a short, cool season"}. ` +
    `For a heated greenhouse this sets your shoulder-season heating demand and the natural-light months you can coast on supplemental light.`;

  return {
    elevationFt,
    lastSpringFrost: mdLabel(springDate),
    firstFallFrost: mdLabel(fallDate),
    frostFreeDays,
    gddBase50,
    extremeMinF,
    hardinessZone: zone,
    years,
    brief,
  };
}
