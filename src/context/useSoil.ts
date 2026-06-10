import { useEffect, useRef, useState } from "react";
import { fetchSoilProfile, fetchLiveSoil } from "../services/soilClient";
import type { SoilProfile, LiveSoil } from "../models/soilModel";
import { useScenario } from "./ScenarioContext";

export interface SoilState {
  profile: SoilProfile | null;
  live: LiveSoil | null;
  loading: boolean;
  /** True only when BOTH sources failed — partial data still renders. */
  unavailable: boolean;
}

/**
 * Fetches the property's soil from its coordinates: a static SoilGrids profile
 * (texture, pH, organic carbon, CEC, bulk density) plus live surface moisture +
 * temperature from Open-Meteo. Both browser-direct, no key. Re-runs when the
 * site moves; the two sources resolve independently so one failing still shows
 * the other.
 */
export function useSoil(): SoilState {
  const { inputs } = useScenario();
  const [state, setState] = useState<SoilState>({
    profile: null,
    live: null,
    loading: true,
    unavailable: false,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true, unavailable: false }));

    // Fire both sources independently and commit each as it settles, so the
    // profile renders even while live soil is still in flight (and vice versa).
    // Each fetch self-times-out, so `loading` always clears even if a host hangs.
    let settled = 0;
    const finish = () => {
      settled += 1;
      if (settled < 2 || ctrl.signal.aborted || !alive) return;
      setState((s) => ({
        ...s,
        loading: false,
        unavailable: s.profile == null && s.live == null,
      }));
    };
    fetchSoilProfile(inputs.latitude, inputs.longitude, ctrl.signal)
      .then((profile) => {
        if (profile && !ctrl.signal.aborted && alive)
          setState((s) => ({ ...s, profile }));
      })
      .finally(finish);
    fetchLiveSoil(inputs.latitude, inputs.longitude, ctrl.signal)
      .then((live) => {
        if (live && !ctrl.signal.aborted && alive)
          setState((s) => ({ ...s, live }));
      })
      .finally(finish);
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [inputs.latitude, inputs.longitude]);

  return state;
}
