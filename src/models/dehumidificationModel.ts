import { LBS_PER_GAL_WATER, PINTS_PER_GAL } from "../utils/unitConversions";

export interface DehumidInput {
  canopyAreaSqFt: number;
  plantDensity: number; // plants per ft²
  plantTranspirationGalPerDayPer1000SqFt: number;
  irrigationRateGalDay: number;
  runoffPct: number; // 0..100
  dehumidifierEfficiencyPintsPerKwh: number;
  ventilationMoistureRemovalGalDay: number;
  co2Enabled: boolean;
}

export interface DehumidOutput {
  estimatedTranspirationGalDay: number;
  netMoistureGalDay: number;
  pintsPerDay: number;
  poundsWaterPerDay: number;
  dehumidifierKwhPerDay: number;
}

export function estimateDehumidification(input: DehumidInput): DehumidOutput {
  const transpirationGalDay =
    (input.canopyAreaSqFt / 1000) * input.plantTranspirationGalPerDayPer1000SqFt;
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
    estimatedTranspirationGalDay: transpirationGalDay,
    netMoistureGalDay: netMoisture,
    pintsPerDay,
    poundsWaterPerDay,
    dehumidifierKwhPerDay,
  };
}
