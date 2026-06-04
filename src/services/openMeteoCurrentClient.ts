/**
 * Open-Meteo Forecast API — current conditions only.
 * Free, no key. Already in the CSP connect-src allowlist.
 * Docs: https://open-meteo.com/en/docs
 *
 * Used exclusively by useLiveWeather to drive the 3D scene's
 * precipitation / wind / cloud-cover / lightning effects. NOT used
 * for the long-run climate model (that's the archive endpoint).
 */

const BASE = "https://api.open-meteo.com/v1/forecast";

/** WMO weather interpretation codes (subset used for visual mapping). */
export type WMOCode = number;

export interface CurrentWeather {
  /** WMO weather code — see WMO_VISUAL below for the breakdown. */
  weatherCode: WMOCode;
  /** Hourly precipitation in mm (rain + drizzle + freezing rain). */
  precipMm: number;
  /** Snowfall in cm. */
  snowfallCm: number;
  /** 10-m wind speed in km/h. */
  windSpeedKmh: number;
  /** 10-m wind direction in degrees (0 = N, 90 = E …). */
  windDirectionDeg: number;
  /** Cloud cover 0–100 %. */
  cloudCoverPct: number;
  /** Outdoor temperature °C (sanity-check against our sim). */
  tempC: number;
  /** Outdoor RH % */
  rhPct: number;
  /** Visibility in metres. */
  visibilityM: number;
  /** Whether the model should show lightning effects. */
  isThunderstorm: boolean;
  /** Whether conditions are freezing (affects rain→snow threshold). */
  isFreezing: boolean;
}

interface ForecastResponse {
  current: {
    weather_code: number;
    precipitation: number;
    snowfall: number;
    wind_speed_10m: number;
    wind_direction_10m: number;
    cloud_cover: number;
    temperature_2m: number;
    relative_humidity_2m: number;
    visibility: number;
  };
}

export async function fetchCurrentWeather(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<CurrentWeather> {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: [
      "weather_code",
      "precipitation",
      "snowfall",
      "wind_speed_10m",
      "wind_direction_10m",
      "cloud_cover",
      "temperature_2m",
      "relative_humidity_2m",
      "visibility",
    ].join(","),
    timezone: "auto",
    forecast_days: "1",
  });

  const res = await fetch(`${BASE}?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Open-Meteo current: ${res.status}`);
  const json: ForecastResponse = await res.json();
  const c = json.current;
  const code = c.weather_code ?? 0;
  return {
    weatherCode: code,
    precipMm: c.precipitation ?? 0,
    snowfallCm: c.snowfall ?? 0,
    windSpeedKmh: c.wind_speed_10m ?? 0,
    windDirectionDeg: c.wind_direction_10m ?? 180,
    cloudCoverPct: c.cloud_cover ?? 0,
    tempC: c.temperature_2m ?? 15,
    rhPct: c.relative_humidity_2m ?? 60,
    visibilityM: c.visibility ?? 10000,
    isThunderstorm: code >= 95,
    isFreezing: (c.temperature_2m ?? 15) <= 0,
  };
}

/**
 * Map a WMO code to a human description + coarse visual category.
 * Source: WMO No. 306 Vol I.1 Table 4680.
 */
export type WeatherCategory =
  | "clear"
  | "cloudy"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "thunderstorm";

export function wmoCategory(code: WMOCode): WeatherCategory {
  if (code === 0) return "clear";
  if (code <= 3) return "cloudy";
  if (code <= 48) return "fog";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "rain";
  if (code <= 86) return "snow";
  return "thunderstorm";
}

export function wmoLabel(code: WMOCode): string {
  if (code === 0) return "Clear sky";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 65) return "Rain";
  if (code === 66 || code === 67) return "Freezing rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Rain showers";
  if (code <= 86) return "Snow showers";
  if (code === 95) return "Thunderstorm";
  return "Thunderstorm w/ hail";
}
