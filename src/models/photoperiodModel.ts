/**
 * Estimate the fraction of daily PAR that arrives within a specified clock
 * window using a sinusoidal day-length approximation. This is a screening-
 * level approximation suitable for monthly DLI partitioning.
 *
 * Inputs:
 *   monthIndex      0..11
 *   latitudeDeg     site latitude
 *   windowStartHr   e.g. 7 = 07:00
 *   windowEndHr     e.g. 19 = 19:00
 *
 * Returns: fraction in [0, 1]
 */
export function flowerWindowDailyFraction(
  monthIndex: number,
  latitudeDeg: number,
  windowStartHr: number,
  windowEndHr: number,
): number {
  const day = monthMidDayOfYear(monthIndex);
  const decl = solarDeclinationDeg(day);
  const sunriseHr = solarSunriseHour(latitudeDeg, decl);
  const sunsetHr = 24 - sunriseHr;
  if (sunsetHr <= sunriseHr) return 0;

  const winStart = Math.max(windowStartHr, sunriseHr);
  const winEnd = Math.min(windowEndHr, sunsetHr);
  if (winEnd <= winStart) return 0;

  const dayLength = sunsetHr - sunriseHr;

  // Sinusoidal intensity model: I(t) = sin(pi * (t - sunrise) / dayLength)
  const integral = (a: number, b: number) => {
    const k = Math.PI / dayLength;
    const fa = Math.cos(k * (a - sunriseHr));
    const fb = Math.cos(k * (b - sunriseHr));
    return (1 / k) * (fa - fb);
  };
  const totalIntegral = integral(sunriseHr, sunsetHr);
  if (totalIntegral <= 0) return 0;
  return integral(winStart, winEnd) / totalIntegral;
}

export function solarSunriseHour(latitudeDeg: number, declinationDeg: number): number {
  const lat = (latitudeDeg * Math.PI) / 180;
  const decl = (declinationDeg * Math.PI) / 180;
  const cosH = -Math.tan(lat) * Math.tan(decl);
  if (cosH >= 1) return 12; // polar night
  if (cosH <= -1) return 0; // polar day
  const hourAngle = Math.acos(cosH);
  const halfDayHrs = (hourAngle * 180) / Math.PI / 15;
  return 12 - halfDayHrs;
}

export function solarDeclinationDeg(dayOfYear: number): number {
  // Cooper 1969 approximation
  return 23.45 * Math.sin(((360 / 365) * (284 + dayOfYear) * Math.PI) / 180);
}

const MONTH_MID_DAYS = [15, 46, 75, 105, 135, 166, 196, 227, 258, 288, 319, 349];
export const monthMidDayOfYear = (m: number) => MONTH_MID_DAYS[m] ?? 180;
