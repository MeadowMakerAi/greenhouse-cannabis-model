import { useMemo } from "react";
import { useScenario } from "./ScenarioContext";
import { fixtureLibrary } from "../data/fixtureLibrary";
import type { FixtureSpec } from "../models/fixtureModel";

export function useAllFixtures(): Record<string, FixtureSpec> {
  const { customFixtures } = useScenario();
  return useMemo(() => {
    const merged: Record<string, FixtureSpec> = { ...fixtureLibrary };
    customFixtures.forEach((f) => {
      merged[f.id] = f;
    });
    return merged;
  }, [customFixtures]);
}
