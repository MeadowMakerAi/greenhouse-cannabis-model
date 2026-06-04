import { useMemo } from "react";
import { useScenario } from "./ScenarioContext";
import { useDerived } from "./useDerived";
import {
  generateProactiveInsights,
  type Insight,
} from "../models/proactiveInsights";

/**
 * Single source of proactive insights for the current scenario. Shared by the
 * static InsightsPanel and the proactive agent (AgentObservations) so both
 * read identical, rule-grounded observations — no duplicated 30-field mapping,
 * no risk of the two drifting.
 */
export function useProactiveInsights(): Insight[] {
  const { inputs } = useScenario();
  const d = useDerived();

  return useMemo(
    () =>
      generateProactiveInsights({
        cyclesPerYear: inputs.cyclesPerYear,
        targetDLI: d.target.targetDLI,
        co2Enabled: inputs.co2Enabled,
        co2SetpointPpm: inputs.co2SetpointPpm,
        ventilationMode: inputs.ventilationMode,
        cropTargetId: inputs.cropTargetId as string,
        cultivationPhase: inputs.cultivationPhase,
        thermalScreenEnabled: inputs.thermalScreenEnabled,
        envelopeUValueBTUhrFtF: inputs.envelopeUValueBTUhrFtF,
        evapEfficiencyPct: inputs.evapEfficiencyPct,
        shadeEnabled: inputs.shadeEnabled,
        fixtureSource: d.fixture.source,
        fixturePPE: d.fixture.ppe,
        fixtureSupports120V: d.activeFixtureSupports120V,
        fixtureSupports240V: d.activeFixtureSupports240V,
        serviceVoltagePrimary: inputs.serviceVoltagePrimary,
        yieldDLIFactor: d.yieldProjection.dliFactor,
        yieldTempFactor: d.yieldProjection.tempFactor,
        yieldCO2Factor: d.yieldProjection.co2Factor,
        energyUseIntensity: d.energyUseIntensity_kWhPerGram,
        peakBotrytis: d.peakBotrytis,
        peakPM: d.peakPM,
        peakNetHeatingLoad: d.peakNetHeatingLoad,
        installedRadiantCapacity: inputs.radiantHeatingCapacityBTUhr,
        cropSteeringAlignment: d.cropSteering.alignmentScore,
        evapFailMonths: d.months.filter((m) => !m.evapReachesTarget).length,
        highHumidityMonths: d.months.filter((m) => m.highHumidityRisk).length,
      }),
    [inputs, d],
  );
}
