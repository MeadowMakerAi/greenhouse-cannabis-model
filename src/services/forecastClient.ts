// Open-Meteo FORWARD forecast (vs the archive client's historical normals). Free, no key,
// CC-BY-4.0. Hourly -> daily aggregates so the existing daily-resolution models can run over it.
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const cToF = (c: number) => (c * 9) / 5 + 32;

export interface ForecastDay {
  date: string; // YYYY-MM-DD (local to the site)
  meanTempF: number;
  minTempF: number;
  maxTempF: number;
  meanRH: number;
  dewPointF: number;
  solarKwhPerM2: number;
}

interface HourlyResponse {
  hourly?: {
    time: string[];
    temperature_2m: number[];
    relative_humidity_2m: number[];
    dew_point_2m: number[];
    shortwave_radiation: number[];
  };
}

export async function fetchForwardForecast(
  latitude: number,
  longitude: number,
  days = 7,
  signal?: AbortSignal,
): Promise<ForecastDay[]> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    hourly: [
      "temperature_2m",
      "relative_humidity_2m",
      "dew_point_2m",
      "shortwave_radiation",
    ].join(","),
    forecast_days: String(days),
    timezone: "auto",
  });
  const res = await fetch(`${FORECAST}?${params.toString()}`, { signal });
  if (!res.ok) throw new Error(`Open-Meteo forecast error ${res.status}`);
  const json = (await res.json()) as HourlyResponse;
  const h = json.hourly;
  if (!h?.time) return [];

  interface Bucket {
    t: number[];
    rh: number[];
    dp: number[];
    swWhPerM2: number;
  }
  const byDay = new Map<string, Bucket>();
  h.time.forEach((iso, i) => {
    const date = iso.slice(0, 10);
    let b = byDay.get(date);
    if (!b) {
      b = { t: [], rh: [], dp: [], swWhPerM2: 0 };
      byDay.set(date, b);
    }
    const t = h.temperature_2m[i];
    const rh = h.relative_humidity_2m[i];
    const dp = h.dew_point_2m[i];
    const sw = h.shortwave_radiation[i];
    if (Number.isFinite(t)) b.t.push(t);
    if (Number.isFinite(rh)) b.rh.push(rh);
    if (Number.isFinite(dp)) b.dp.push(dp);
    if (Number.isFinite(sw)) b.swWhPerM2 += sw; // W/m² over 1h = Wh/m²
  });

  const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
  const out: ForecastDay[] = [];
  for (const [date, b] of byDay) {
    out.push({
      date,
      meanTempF: cToF(mean(b.t)),
      minTempF: cToF(b.t.length ? Math.min(...b.t) : 0),
      maxTempF: cToF(b.t.length ? Math.max(...b.t) : 0),
      meanRH: mean(b.rh),
      dewPointF: cToF(mean(b.dp)),
      solarKwhPerM2: b.swWhPerM2 / 1000,
    });
  }
  return out;
}
