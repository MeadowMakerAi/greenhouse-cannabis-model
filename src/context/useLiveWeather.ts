import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchCurrentWeather,
  wmoCategory,
  wmoLabel,
  type CurrentWeather,
  type WeatherCategory,
} from "../services/openMeteoCurrentClient";
import { useScenario } from "./ScenarioContext";

export interface LiveWeatherState {
  /** Raw API data, null while first fetch is in flight or on error. */
  current: CurrentWeather | null;
  /** Coarse visual category derived from the WMO code. */
  category: WeatherCategory;
  /** Human-readable description. */
  label: string;
  /** 0..1 — how hard it's raining (drives particle density). */
  rainIntensity: number;
  /** 0..1 — how hard it's snowing. */
  snowIntensity: number;
  /** 0..1 — cloud cover fraction (dims sky IBL + sun). */
  cloudCover: number;
  /** Wind speed m/s, for blowing rain angle + plant sway. */
  windSpeedMs: number;
  /** Wind direction in degrees. */
  windDirDeg: number;
  /** True while a thunderstorm — triggers lightning. */
  thunderstorm: boolean;
  /** True during heavy snowfall — surface whitening. */
  snowAccumulating: boolean;
  /** Whether the fetch has ever succeeded. */
  loaded: boolean;
  /** Last error message if any (non-fatal — falls back to clear). */
  error: string | null;
}

const POLL_MS = 10 * 60 * 1000; // 10 min — weather doesn't change faster

const DEFAULT: LiveWeatherState = {
  current: null,
  category: "clear",
  label: "Fetching weather…",
  rainIntensity: 0,
  snowIntensity: 0,
  cloudCover: 0,
  windSpeedMs: 0,
  windDirDeg: 180,
  thunderstorm: false,
  snowAccumulating: false,
  loaded: false,
  error: null,
};

function deriveState(c: CurrentWeather): Omit<LiveWeatherState, "loaded" | "error"> {
  const category = wmoCategory(c.weatherCode);
  const rainIntensity = Math.min(1, c.precipMm / 10); // 10 mm/hr = max density
  const snowIntensity = Math.min(1, c.snowfallCm / 5); // 5 cm/hr = max density
  return {
    current: c,
    category,
    label: wmoLabel(c.weatherCode),
    rainIntensity,
    snowIntensity,
    cloudCover: c.cloudCoverPct / 100,
    windSpeedMs: c.windSpeedKmh / 3.6,
    windDirDeg: c.windDirectionDeg,
    thunderstorm: c.isThunderstorm,
    snowAccumulating: c.snowfallCm > 1,
  };
}

/**
 * Polls the Open-Meteo current-conditions endpoint every 10 minutes and
 * derives the visual state the 3D scene needs to render live weather —
 * precipitation intensity, cloud cover, wind, thunderstorm flag.
 *
 * Degrades gracefully: if the fetch fails (offline, rate-limit) the scene
 * stays in whatever state it last had. First load uses the scenario's
 * current month-based outdoor conditions as a prior.
 */
export function useLiveWeather(): LiveWeatherState {
  const { inputs } = useScenario();
  const [state, setState] = useState<LiveWeatherState>(DEFAULT);
  const abortRef = useRef<AbortController | null>(null);

  const fetch = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const current = await fetchCurrentWeather(
        inputs.latitude,
        inputs.longitude,
        ctrl.signal,
      );
      setState((s) => ({
        ...s,
        ...deriveState(current),
        loaded: true,
        error: null,
      }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      const msg = (e as Error).message;
      setState((s) => ({ ...s, error: msg, loaded: s.loaded }));
    }
  }, [inputs.latitude, inputs.longitude]);

  useEffect(() => {
    fetch();
    const id = setInterval(fetch, POLL_MS);
    return () => {
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [fetch]);

  return state;
}
