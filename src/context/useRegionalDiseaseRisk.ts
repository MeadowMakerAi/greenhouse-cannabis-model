import { useEffect, useRef, useState } from "react";
import { fetchDiseaseWeather } from "../services/openMeteoDiseaseClient";
import {
  regionalDiseaseRisk,
  type RegionalDiseaseRisk,
} from "../models/regionalDisease";
import { useScenario } from "./ScenarioContext";

const POLL_MS = 60 * 60 * 1000; // hourly — disease pressure shifts slowly

/**
 * Polls ambient weather for the site (last 3 + next 3 days) and computes
 * regional cannabis pathogen pressure. Returns null until the first fetch
 * succeeds; degrades silently on error (the agent simply won't raise a
 * disease observation).
 */
export function useRegionalDiseaseRisk(): RegionalDiseaseRisk | null {
  const { inputs } = useScenario();
  const [risk, setRisk] = useState<RegionalDiseaseRisk | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const hours = await fetchDiseaseWeather(
          inputs.latitude,
          inputs.longitude,
          ctrl.signal,
        );
        if (alive) setRisk(regionalDiseaseRisk(hours));
      } catch {
        /* keep last value */
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
      abortRef.current?.abort();
    };
  }, [inputs.latitude, inputs.longitude]);

  return risk;
}
