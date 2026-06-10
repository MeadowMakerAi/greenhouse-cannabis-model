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

    const run = async () => {
      const [profile, live] = await Promise.all([
        fetchSoilProfile(inputs.latitude, inputs.longitude, ctrl.signal),
        fetchLiveSoil(inputs.latitude, inputs.longitude, ctrl.signal),
      ]);
      if (ctrl.signal.aborted || !alive) return;
      setState({
        profile,
        live,
        loading: false,
        unavailable: profile == null && live == null,
      });
    };
    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [inputs.latitude, inputs.longitude]);

  return state;
}
