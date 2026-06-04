/**
 * Site-intelligence data fetch — everything derivable about a property from
 * its coordinates, using CORS-friendly Open-Meteo endpoints (already in CSP).
 *
 * Elevation from the Open-Meteo elevation API; multi-year daily temperature
 * extremes from the historical archive (for frost dates, growing season, GDD,
 * and USDA hardiness zone). Government soil (SSURGO) and crop-neighbor (CDL)
 * layers need a server proxy (no browser CORS) — flagged as the next layer.
 */

const ELEV = "https://api.open-meteo.com/v1/elevation";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

const cToF = (c: number) => (c * 9) / 5 + 32;

export async function fetchElevationFt(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<number | null> {
  try {
    const res = await fetch(
      `${ELEV}?latitude=${latitude.toFixed(4)}&longitude=${longitude.toFixed(4)}`,
      { signal, headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const json = (await res.json()) as { elevation?: number[] };
    const m = json.elevation?.[0];
    return typeof m === "number" ? m * 3.28084 : null;
  } catch {
    return null;
  }
}

export interface DailyTempHistory {
  /** ISO dates. */
  time: string[];
  /** Daily min temp °F. */
  tMinF: number[];
  /** Daily max temp °F. */
  tMaxF: number[];
}

export async function fetchDailyTempHistory(
  latitude: number,
  longitude: number,
  startYear: number,
  endYear: number,
  signal?: AbortSignal,
): Promise<DailyTempHistory> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    start_date: `${startYear}-01-01`,
    end_date: `${endYear}-12-31`,
    daily: ["temperature_2m_min", "temperature_2m_max"].join(","),
    timezone: "auto",
  });
  const res = await fetch(`${ARCHIVE}?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Open-Meteo archive: ${res.status}`);
  const json = (await res.json()) as {
    daily: {
      time: string[];
      temperature_2m_min: number[];
      temperature_2m_max: number[];
    };
  };
  const d = json.daily;
  return {
    time: d.time,
    tMinF: d.temperature_2m_min.map(cToF),
    tMaxF: d.temperature_2m_max.map(cToF),
  };
}
