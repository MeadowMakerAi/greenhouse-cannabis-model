export interface EvapInput {
  enabled: boolean;
  efficiencyPct: number; // 0..100
  outdoorDryBulbF: number;
  outdoorWetBulbF: number;
  outdoorDewPointF: number;
  indoorTargetDryBulbF: number;
  cropStage: "veg" | "earlyFlower" | "midFlower" | "lateFlower";
}

export interface EvapOutput {
  theoreticalSupplyTempF: number;
  reachesTarget: boolean;
  warnings: string[];
}

export function evapSupplyTemp(
  dryF: number,
  wetF: number,
  efficiencyPct: number,
): number {
  const eff = Math.max(0, Math.min(1, efficiencyPct / 100));
  return dryF - eff * (dryF - wetF);
}

export function evaluateEvap(input: EvapInput): EvapOutput {
  const warnings: string[] = [];
  if (!input.enabled) {
    return {
      theoreticalSupplyTempF: input.outdoorDryBulbF,
      reachesTarget: false,
      warnings,
    };
  }
  const supply = evapSupplyTemp(
    input.outdoorDryBulbF,
    input.outdoorWetBulbF,
    input.efficiencyPct,
  );
  const reaches = supply <= input.indoorTargetDryBulbF;
  if (!reaches) {
    warnings.push(
      `Evaporative cooling cannot reach target. Theoretical supply ${supply.toFixed(1)}°F vs target ${input.indoorTargetDryBulbF.toFixed(1)}°F.`,
    );
  }
  if (input.outdoorDewPointF > 68) {
    warnings.push(
      "High dew point (>68°F): evaporative cooling will worsen humidity and VPD targets for flower.",
    );
  }
  if (input.cropStage === "lateFlower" && input.outdoorDewPointF > 60) {
    warnings.push(
      "Late flower: dew point above 60°F is high botrytis / powdery mildew risk territory.",
    );
  }
  return {
    theoreticalSupplyTempF: supply,
    reachesTarget: reaches,
    warnings,
  };
}
