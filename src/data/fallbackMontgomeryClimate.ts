import type { MonthlyClimate } from "../models/solarModel";

/**
 * Fallback monthly climate normals approximating Orange County / Montgomery NY.
 * Sources blended from publicly available NOAA climate normals (Montgomery /
 * Stewart Field), NREL TMY3 typical-year data for nearby station, and the
 * NASA POWER long-term monthly climatology endpoint structure. These are
 * **planning estimates only** and must be replaced with measured or API-fed
 * data before any engineering decision.
 *
 * Units:
 *   shortwaveKwhPerM2PerDay — daily mean global horizontal irradiance
 *   meanTempF, minTempF, maxTempF — monthly averages
 *   designWetBulbF, designDewPointF — ASHRAE 1% design proxies
 */
export const fallbackMontgomeryClimate: MonthlyClimate[] = [
  { month: 0, shortwaveKwhPerM2PerDay: 1.70, meanTempF: 26, minTempF: 17, maxTempF: 35, meanRH: 70, meanDewPointF: 17, designWetBulbF: 32, designDewPointF: 30 },
  { month: 1, shortwaveKwhPerM2PerDay: 2.40, meanTempF: 29, minTempF: 19, maxTempF: 39, meanRH: 68, meanDewPointF: 19, designWetBulbF: 34, designDewPointF: 32 },
  { month: 2, shortwaveKwhPerM2PerDay: 3.30, meanTempF: 37, minTempF: 26, maxTempF: 48, meanRH: 65, meanDewPointF: 26, designWetBulbF: 42, designDewPointF: 39 },
  { month: 3, shortwaveKwhPerM2PerDay: 4.20, meanTempF: 48, minTempF: 36, maxTempF: 60, meanRH: 62, meanDewPointF: 35, designWetBulbF: 53, designDewPointF: 50 },
  { month: 4, shortwaveKwhPerM2PerDay: 5.10, meanTempF: 59, minTempF: 47, maxTempF: 71, meanRH: 65, meanDewPointF: 47, designWetBulbF: 64, designDewPointF: 60 },
  { month: 5, shortwaveKwhPerM2PerDay: 5.80, meanTempF: 68, minTempF: 56, maxTempF: 79, meanRH: 70, meanDewPointF: 58, designWetBulbF: 72, designDewPointF: 67 },
  { month: 6, shortwaveKwhPerM2PerDay: 5.90, meanTempF: 73, minTempF: 62, maxTempF: 84, meanRH: 72, meanDewPointF: 64, designWetBulbF: 75, designDewPointF: 71 },
  { month: 7, shortwaveKwhPerM2PerDay: 5.30, meanTempF: 71, minTempF: 60, maxTempF: 82, meanRH: 75, meanDewPointF: 63, designWetBulbF: 74, designDewPointF: 71 },
  { month: 8, shortwaveKwhPerM2PerDay: 4.40, meanTempF: 64, minTempF: 52, maxTempF: 75, meanRH: 75, meanDewPointF: 56, designWetBulbF: 70, designDewPointF: 65 },
  { month: 9, shortwaveKwhPerM2PerDay: 3.30, meanTempF: 53, minTempF: 41, maxTempF: 64, meanRH: 71, meanDewPointF: 44, designWetBulbF: 60, designDewPointF: 56 },
  { month: 10, shortwaveKwhPerM2PerDay: 2.10, meanTempF: 43, minTempF: 33, maxTempF: 53, meanRH: 71, meanDewPointF: 34, designWetBulbF: 48, designDewPointF: 45 },
  { month: 11, shortwaveKwhPerM2PerDay: 1.50, meanTempF: 33, minTempF: 24, maxTempF: 41, meanRH: 71, meanDewPointF: 24, designWetBulbF: 38, designDewPointF: 35 },
];

export const climateProvenance = {
  source: "Blended NOAA normals + NREL TMY3 proxy for KMGJ",
  status: "Fallback/planning — replace with NASA POWER or Open-Meteo at runtime",
  yearRange: "1991-2020 reference period (approximate)",
  retrieved: "Built-in default",
};
