/**
 * Open-Meteo hourly temp / RH / dew-point for the last 3 + next 3 days at the
 * site, used to compute REGIONAL (ambient) pathogen pressure — what's blowing
 * in from outside. Free, no key, already in CSP.
 *
 * NEWA note: Cornell NEWA's disease models run on the same physics (leaf
 * wetness, RH-hours, temperature windows) but expose no clean public API and
 * are crop-specific (apple/grape). For cannabis botrytis + PM, ambient
 * temp/RH/dew-point from Open-Meteo + the project pathogen model is the
 * honest, real-data substitute.
 */

const BASE = "https://api.open-meteo.com/v1/forecast";

export interface DiseaseWeatherHour {
  /** ISO timestamp. */
  time: string;
  tempF: number;
  rhPct: number;
  dewPointF: number;
  /** True for hours in the future (forecast vs observed). */
  forecast: boolean;
}

const cToF = (c: number) => (c * 9) / 5 + 32;

export async function fetchDiseaseWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<DiseaseWeatherHour[]> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: ["temperature_2m", "relative_humidity_2m", "dew_point_2m"].join(","),
    past_days: "3",
    forecast_days: "3",
    timezone: "auto",
  });
  const res = await fetch(`${BASE}?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Open-Meteo disease: ${res.status}`);
  const json = (await res.json()) as {
    hourly: {
      time: string[];
      temperature_2m: number[];
      relative_humidity_2m: number[];
      dew_point_2m: number[];
    };
  };
  const h = json.hourly;
  const nowMs = Date.parse(h.time[Math.floor(h.time.length / 2)] ?? "") || 0;
  return h.time.map((t, i) => ({
    time: t,
    tempF: cToF(h.temperature_2m[i] ?? 15),
    rhPct: h.relative_humidity_2m[i] ?? 60,
    dewPointF: cToF(h.dew_point_2m[i] ?? 8),
    forecast: Date.parse(t) > (nowMs || Date.parse(t)),
  }));
}
