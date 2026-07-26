// Re-export from grow-core — single source of truth (MeadowMakerAi/grow-core).
// The science lives in grow-core; this shim keeps the app' ../models/solarModel imports stable.
export * from "grow-core/models/solarModel";

import { outdoorPPFDFromElevation, sunPositionAt } from "./simulationModel";

/**
 * Distribute a MEASURED daily shortwave total (kWh/m²/day) across the day using
 * the clear-sky sun-elevation shape, returning a function that gives the
 * instantaneous horizontal irradiance (W/m²) at any hour-of-day.
 *
 * The daily integral of the result equals the measured total, so the MAGNITUDE
 * stays real (NASA POWER / Open-Meteo, cloudiness included) — only the diurnal
 * SHAPE is modeled: it peaks at solar noon and is zero at night. This is what
 * lets the live temperature loop see solar heat rise into midday instead of a
 * flat daily-average number.
 *
 * Shape = `outdoorPPFDFromElevation(sun elevation)` — the same Kasten-Young
 * air-mass clear-sky curve the PPFD path already uses (CITATIONS.md → solar
 * geometry & atmospheric scattering). Normalizing by the shape integral cancels
 * the clear-sky units and preserves the measured daily energy, so no solar
 * magnitude is fabricated here.
 */
export function distributeDailyIrradiance(
  latitudeDeg: number,
  dayOfYear: number,
  dailyShortwaveKwhPerM2: number,
  stepHours = 0.25,
): (hourOfDay: number) => number {
  const shape = (h: number) =>
    outdoorPPFDFromElevation(sunPositionAt(latitudeDeg, dayOfYear, h).elevationDeg);
  // Trapezoidal integral of the shape over the day (units: shape·hours).
  let shapeIntegral = 0;
  for (let h = 0; h < 24; h += stepHours) {
    shapeIntegral += ((shape(h) + shape(h + stepHours)) / 2) * stepHours;
  }
  const dailyWhPerM2 = Math.max(0, dailyShortwaveKwhPerM2) * 1000;
  return (hourOfDay: number) => {
    if (shapeIntegral <= 0) return 0;
    // Wh/m²/day × shape / (shape·h) = W/m²; ∫ over the day = dailyWhPerM2.
    return (dailyWhPerM2 * shape(hourOfDay)) / shapeIntegral;
  };
}
