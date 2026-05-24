import { LBS_PER_GAL_WATER, PINTS_PER_GAL } from "../utils/unitConversions";
import { co2StomatalFactor, type VentilationMode } from "./co2Model";

export interface DehumidInput {
  canopyAreaSqFt: number;
  plantDensity: number; // plants per ft²
  plantTranspirationGalPerDayPer1000SqFt: number;
  irrigationRateGalDay: number;
  runoffPct: number; // 0..100
  dehumidifierEfficiencyPintsPerKwh: number;
  ventilationMoistureRemovalGalDay: number;
  co2Enabled: boolean;
  /**
   * CO₂ ppm at canopy. Drives the stomatal-closure transpiration
   * reduction (≤1.0) per Ainsworth & Long 2005. Defaults to 400 (ambient)
   * so callers that haven't been updated still get correct behavior.
   */
  co2SetpointPpm?: number;
  /**
   * Drives the physical-feasibility gate on the stomatal factor.
   * Open-vented operation cannot hold elevated CO₂ at the canopy, so
   * stomatal closure does not apply even if the setpoint is high.
   * Defaults to "low" (sealed-ish) for backward compat.
   */
  ventilationMode?: VentilationMode;
}

export interface DehumidOutput {
  estimatedTranspirationGalDay: number;
  /** Effective transpiration after CO₂ stomatal-closure adjustment. */
  effectiveTranspirationGalDay: number;
  /** Multiplier applied to baseline transpiration (≤1.0). */
  stomatalFactor: number;
  netMoistureGalDay: number;
  pintsPerDay: number;
  poundsWaterPerDay: number;
  dehumidifierKwhPerDay: number;
}

export function estimateDehumidification(input: DehumidInput): DehumidOutput {
  const baselineTranspirationGalDay =
    (input.canopyAreaSqFt / 1000) * input.plantTranspirationGalPerDayPer1000SqFt;
  // Elevated CO₂ partially closes stomata → less water vapor leaves the
  // plant. Net whole-canopy reduction is more muted than leaf-level g_s
  // (LAI partly compensates) — see CITATIONS.md → Ainsworth & Long (2005).
  const stomatalFactor = co2StomatalFactor(
    input.co2SetpointPpm ?? 400,
    input.co2Enabled,
    input.ventilationMode ?? "low",
  );
  const transpirationGalDay = baselineTranspirationGalDay * stomatalFactor;
  const irrigationLoss = input.irrigationRateGalDay * (input.runoffPct / 100);
  const otherSources = irrigationLoss * 0.2; // small evaporation from media surface
  // CO₂ enrichment usually reduces ventilation by 60-80%; mechanical takes over.
  const ventRemoval = input.co2Enabled
    ? input.ventilationMoistureRemovalGalDay * 0.25
    : input.ventilationMoistureRemovalGalDay;
  const netMoisture = Math.max(
    0,
    transpirationGalDay + otherSources - ventRemoval,
  );
  const pintsPerDay = netMoisture * PINTS_PER_GAL;
  const poundsWaterPerDay = netMoisture * LBS_PER_GAL_WATER;
  const dehumidifierKwhPerDay =
    input.dehumidifierEfficiencyPintsPerKwh > 0
      ? pintsPerDay / input.dehumidifierEfficiencyPintsPerKwh
      : 0;
  return {
    estimatedTranspirationGalDay: baselineTranspirationGalDay,
    effectiveTranspirationGalDay: transpirationGalDay,
    stomatalFactor,
    netMoistureGalDay: netMoisture,
    pintsPerDay,
    poundsWaterPerDay,
    dehumidifierKwhPerDay,
  };
}
