import { useEffect, useRef, useState } from "react";
import {
  fetchElevationFt,
  fetchDailyTempHistory,
} from "../services/siteIntelligenceClient";
import {
  computeSiteProfile,
  type SiteProfile,
} from "../models/siteIntelligence";
import { useScenario } from "./ScenarioContext";

export interface SiteIntelligenceState {
  profile: SiteProfile | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches + derives the property's agronomic profile from its coordinates
 * (elevation + 10 years of daily temperature extremes). Re-runs when the site
 * moves. Heavy-ish (one ~10-year archive call) so it caches per lat/lon and
 * only fires once per location, not on a poll.
 */
export function useSiteIntelligence(): SiteIntelligenceState {
  const { inputs } = useScenario();
  const [state, setState] = useState<SiteIntelligenceState>({
    profile: null,
    loading: true,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setState((s) => ({ ...s, loading: true, error: null }));

    const run = async () => {
      try {
        // 10 most-recent complete years for stable frost/GDD normals.
        const end = 2024;
        const start = end - 9;
        const [elevationFt, history] = await Promise.all([
          fetchElevationFt(inputs.latitude, inputs.longitude, ctrl.signal),
          fetchDailyTempHistory(
            inputs.latitude,
            inputs.longitude,
            start,
            end,
            ctrl.signal,
          ),
        ]);
        const profile = computeSiteProfile(history, elevationFt);
        if (alive) setState({ profile, loading: false, error: null });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        if (alive)
          setState({ profile: null, loading: false, error: (e as Error).message });
      }
    };
    run();
    return () => {
      alive = false;
      ctrl.abort();
    };
  }, [inputs.latitude, inputs.longitude]);

  return state;
}
