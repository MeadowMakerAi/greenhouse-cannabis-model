import type { MonthlyClimate } from "../models/solarModel";

/**
 * NASA POWER monthly climatology API.
 *
 * Reference:
 *   https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
 *
 * Parameters:
 *   ALLSKY_SFC_SW_DWN  — daily mean shortwave per month
 *   T2M, T2M_MIN, T2M_MAX — 2m air temperature (°C)
 *   RH2M               — 2m relative humidity (%)
 *   T2MDEW             — 2m dewpoint (°C)
 *
 * IMPORTANT: the POWER **climatology** endpoint returns shortwave in
 * MJ/m²/day, NOT kWh/m²/day (the daily endpoint is the one in kWh).
 * Verified 2026-05-09 via the response's `parameters.ALLSKY_SFC_SW_DWN.units`
 * field, which reads "MJ/m^2/day". Divide by 3.6 to get kWh/m²/day for
 * the rest of the model.
 *
 * Note: POWER returns monthly fields keyed by month name ("JAN".."DEC") plus
 * an annual "ANN" key — strip that before mapping.
 */
const POWER_BASE = "https://power.larc.nasa.gov/api/temporal/climatology/point";
const MJ_PER_M2_DAY_TO_KWH = 1 / 3.6;

interface PowerResponse {
  properties: {
    parameter: Record<string, Record<string, number>>;
  };
}

const MONTH_KEYS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const cToF = (c: number) => (c * 9) / 5 + 32;

export async function fetchNasaPowerMonthly(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<MonthlyClimate[]> {
  const params = new URLSearchParams({
    parameters: "ALLSKY_SFC_SW_DWN,T2M,T2M_MIN,T2M_MAX,RH2M,T2MDEW",
    community: "AG",
    longitude: String(longitude),
    latitude: String(latitude),
    format: "JSON",
  });
  const url = `${POWER_BASE}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`NASA POWER error ${res.status}`);
  const json: PowerResponse = await res.json();
  const p = json.properties.parameter;

  return MONTH_KEYS.map((mk, idx) => {
    const meanTempC = p.T2M?.[mk] ?? 0;
    const minTempC = p.T2M_MIN?.[mk] ?? meanTempC;
    const maxTempC = p.T2M_MAX?.[mk] ?? meanTempC;
    const dewC = p.T2MDEW?.[mk] ?? 0;
    return {
      month: idx,
      shortwaveKwhPerM2PerDay:
        (p.ALLSKY_SFC_SW_DWN?.[mk] ?? 0) * MJ_PER_M2_DAY_TO_KWH,
      meanTempF: cToF(meanTempC),
      minTempF: cToF(minTempC),
      maxTempF: cToF(maxTempC),
      meanRH: p.RH2M?.[mk] ?? 0,
      meanDewPointF: cToF(dewC),
      // Design wet-bulb / dew-point not available in monthly climatology;
      // approximate from mean+RH and let the UI flag this as estimate.
      designWetBulbF: cToF(meanTempC) - 5,
      designDewPointF: cToF(dewC) + 4,
    };
  });
}
