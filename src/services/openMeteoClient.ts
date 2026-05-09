import type { MonthlyClimate } from "../models/solarModel";

/**
 * Open-Meteo Historical Weather API monthly aggregation.
 * Docs: https://open-meteo.com/en/docs/historical-weather-api
 * Free, no key. Reanalysis-based.
 */
const OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive";

interface OMResponse {
  daily: {
    time: string[];
    shortwave_radiation_sum: number[];
    temperature_2m_mean: number[];
    temperature_2m_min: number[];
    temperature_2m_max: number[];
    relative_humidity_2m_mean: number[];
    dew_point_2m_mean: number[];
  };
}

const cToF = (c: number) => (c * 9) / 5 + 32;
const MJ_PER_M2_TO_KWH = 1 / 3.6;

export async function fetchOpenMeteoMonthly(
  latitude: number,
  longitude: number,
  startYear: number,
  endYear: number,
  signal?: AbortSignal,
): Promise<MonthlyClimate[]> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    start_date: `${startYear}-01-01`,
    end_date: `${endYear}-12-31`,
    daily: [
      "shortwave_radiation_sum",
      "temperature_2m_mean",
      "temperature_2m_min",
      "temperature_2m_max",
      "relative_humidity_2m_mean",
      "dew_point_2m_mean",
    ].join(","),
    timezone: "America/New_York",
  });
  const url = `${OPEN_METEO}?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Open-Meteo error ${res.status}`);
  const json: OMResponse = await res.json();
  const d = json.daily;

  const buckets: Record<number, MonthlyClimate & { count: number }> = {};
  for (let i = 0; i < 12; i++) {
    buckets[i] = {
      month: i,
      shortwaveKwhPerM2PerDay: 0,
      meanTempF: 0,
      minTempF: 0,
      maxTempF: 0,
      meanRH: 0,
      meanDewPointF: 0,
      designWetBulbF: 0,
      designDewPointF: 0,
      count: 0,
    } as MonthlyClimate & { count: number };
  }

  d.time.forEach((iso, idx) => {
    const m = new Date(iso).getMonth();
    const b = buckets[m];
    b.shortwaveKwhPerM2PerDay += (d.shortwave_radiation_sum[idx] ?? 0) * MJ_PER_M2_TO_KWH;
    b.meanTempF += cToF(d.temperature_2m_mean[idx] ?? 0);
    b.minTempF += cToF(d.temperature_2m_min[idx] ?? 0);
    b.maxTempF += cToF(d.temperature_2m_max[idx] ?? 0);
    b.meanRH += d.relative_humidity_2m_mean[idx] ?? 0;
    b.meanDewPointF += cToF(d.dew_point_2m_mean[idx] ?? 0);
    b.count += 1;
  });

  return Object.values(buckets).map((b) => {
    const n = Math.max(1, b.count);
    return {
      month: b.month,
      shortwaveKwhPerM2PerDay: b.shortwaveKwhPerM2PerDay / n,
      meanTempF: b.meanTempF / n,
      minTempF: b.minTempF / n,
      maxTempF: b.maxTempF / n,
      meanRH: b.meanRH / n,
      meanDewPointF: b.meanDewPointF / n,
      designWetBulbF: b.minTempF / n + 6,
      designDewPointF: b.meanDewPointF / n + 6,
    };
  });
}
