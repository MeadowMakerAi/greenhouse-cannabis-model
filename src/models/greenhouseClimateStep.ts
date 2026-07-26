/**
 * One inner sub-step of the live greenhouse climate: a coupled sensible-heat +
 * moisture update. Extracted from useLiveDynamics so the physics is unit-
 * testable and the stability-critical loop stays readable.
 *
 * Sensible side reuses grow-core's `indoorTempStep` energy balance
 * (lighting + heating − cooling − envelopeConduction − ventilation); this step
 * ADDS the terms that balance was missing in the live loop:
 *   • solar gain (the "greenhouse effect") — folded into the heat input,
 *   • wet-wall / pad evaporative cooling on the ventilation intake,
 *   • fog / misting in-situ evaporative cooling,
 * and couples all three to a per-substep moisture balance so relative humidity
 * (and thus evaporative effectiveness) moves with temperature — "full latent
 * coupling."
 *
 * Evaporative cooling is adiabatic: sensible heat removed equals latent heat
 * added (BTU / 1054 BTU·lb⁻¹ = lb water evaporated), so every degree of evap
 * cooling raises humidity. Neither pad nor fog can cool below its wet-bulb
 * supply temperature (`evapSupplyTemp`), which is exactly what makes fog fade
 * to zero as the air approaches saturation.
 *
 * Coefficients: `evapSupplyTemp` / `wetBulbF` (grow-core, CITATIONS.md → evap +
 * psychrometrics), latent heat 1054 BTU/lb (same value grow-core heatLoadModel
 * uses), and standard-air constants below. No market data, no fabricated
 * magnitudes.
 */
import { indoorTempStep } from "./simulationModel";
import { evapSupplyTemp } from "./evapCoolingModel";
import {
  wetBulbF,
  rhFromAbsoluteHumidity,
  absoluteHumidityKgPerKg,
} from "./psychrometricModel";
import { fahrenheitToCelsius } from "../utils/unitConversions";

/** ASHRAE standard dry-air density (sea level, 70 °F). Physical constant. */
export const DRY_AIR_DENSITY_LB_PER_FT3 = 0.075;
/** Latent heat of vaporization of water — matches grow-core heatLoadModel. */
export const LATENT_HEAT_WATER_BTU_PER_LB = 1054;
/** Sensible-heat coefficient for standard air, BTU/hr per CFM per °F. */
export const VENT_SENSIBLE_BTU_PER_CFM_F = 1.08;
/** Air thermal capacity per ft³ per °F — matches grow-core indoorTempStep. */
export const AIR_THERMAL_CAPACITY_BTU_PER_FT3_F = 0.018;

export interface ClimateSubstepInput {
  // --- state ---
  indoorTempF: number;
  /** Indoor absolute humidity, kg water / kg dry air (numerically = lb/lb). */
  indoorAH: number;
  // --- drivers ---
  outdoorTempF: number;
  outdoorRHPct: number;
  outdoorAH: number;
  /** Live natural-ventilation airflow this substep (CFM). */
  ventCFM: number;
  /** Interior solar heat gain (BTU/hr) — constant across a step's substeps. */
  solarGainBTUhr: number;
  lightingBTUhr: number;
  heatingBTUhr: number;
  mechCoolingBTUhr: number;
  // --- envelope / geometry ---
  envelopeAreaSqFt: number;
  envelopeUValue: number;
  volumeCuFt: number;
  // --- moisture sources ---
  transpirationLbPerHr: number;
  // --- evaporative cooling ---
  padEnabled: boolean;
  padEfficiencyPct: number;
  fogEnabled: boolean;
  fogEfficiencyPct: number;
  /** Reference airflow fog conditions the interior at (CFM). */
  fogAirflowCFM: number;
  // --- dehumidification (holds RH at target, matching prior snapshot model) ---
  dehumEnabled: boolean;
  targetRHPct: number;
  // --- step ---
  dtHours: number;
}

export interface ClimateSubstepResult {
  indoorTempF: number;
  indoorAH: number;
  indoorRHPct: number;
  padCoolingBTUhr: number;
  fogCoolingBTUhr: number;
}

/** AH (kg/kg) at a given °F / RH — thin °F wrapper over grow-core's helper so
 *  it stays the exact inverse of `rhFromAbsoluteHumidity` used elsewhere. */
function ahAtRH(tempF: number, rhPct: number): number {
  return absoluteHumidityKgPerKg(fahrenheitToCelsius(tempF), rhPct);
}

export function climateSubstep(input: ClimateSubstepInput): ClimateSubstepResult {
  const {
    indoorTempF: T,
    indoorAH: AH,
    outdoorTempF,
    outdoorRHPct,
    outdoorAH,
    ventCFM,
    solarGainBTUhr,
    lightingBTUhr,
    heatingBTUhr,
    mechCoolingBTUhr,
    envelopeAreaSqFt,
    envelopeUValue,
    volumeCuFt,
    transpirationLbPerHr,
    padEnabled,
    padEfficiencyPct,
    fogEnabled,
    fogEfficiencyPct,
    fogAirflowCFM,
    dehumEnabled,
    targetRHPct,
    dtHours,
  } = input;

  const thermalCapacity = Math.max(1, volumeCuFt * AIR_THERMAL_CAPACITY_BTU_PER_FT3_F);
  const rhNow = Math.max(0, Math.min(100, rhFromAbsoluteHumidity(fahrenheitToCelsius(T), AH)));

  // --- Wet-wall / pad: pre-cool the ventilation INTAKE toward its wet-bulb.
  // Extra cooling vs. importing raw outdoor air = 1.08·CFM·(Tout − Tintake).
  // Capped so the pad can't cool below the intake supply temp. Adiabatic → the
  // sensible heat removed becomes water added to the incoming air.
  let padCoolingBTUhr = 0;
  let padWaterLbPerHr = 0;
  if (padEnabled && ventCFM > 0) {
    const outdoorWetF = wetBulbF(outdoorTempF, outdoorRHPct);
    const intakeTempF = evapSupplyTemp(outdoorTempF, outdoorWetF, padEfficiencyPct);
    padCoolingBTUhr = Math.max(
      0,
      VENT_SENSIBLE_BTU_PER_CFM_F * ventCFM * (outdoorTempF - intakeTempF),
    );
    padWaterLbPerHr = padCoolingBTUhr / LATENT_HEAT_WATER_BTU_PER_LB;
  }

  // --- Fog / misting: in-situ evaporative cooling toward the INTERIOR wet-bulb.
  // Fades to zero automatically as RH → 100 % (wet-bulb → dry-bulb). Capped so
  // it can't overshoot below the fog supply temp in one substep.
  let fogCoolingBTUhr = 0;
  let fogWaterLbPerHr = 0;
  if (fogEnabled && fogAirflowCFM > 0) {
    const interiorWetF = wetBulbF(T, rhNow);
    const fogSupplyF = evapSupplyTemp(T, interiorWetF, fogEfficiencyPct);
    const rawFog = VENT_SENSIBLE_BTU_PER_CFM_F * fogAirflowCFM * Math.max(0, T - fogSupplyF);
    // Physical bound: can't remove more sensible heat than reaches fogSupplyF.
    const maxFog = (Math.max(0, T - fogSupplyF) * thermalCapacity) / Math.max(1e-6, dtHours);
    fogCoolingBTUhr = Math.min(rawFog, maxFog);
    fogWaterLbPerHr = fogCoolingBTUhr / LATENT_HEAT_WATER_BTU_PER_LB;
  }

  // --- Sensible temperature update via grow-core's balance. Solar folds into
  // the additive heat slot; pad + fog + mechanical are additive cooling —
  // indoorTempStep sums them identically, so this is exact with no core edit.
  const newT = indoorTempStep({
    outdoorTempF, // real outdoor: conduction + base vent use true ambient
    prevIndoorTempF: T,
    lightingBTUhr: lightingBTUhr + solarGainBTUhr,
    heatingBTUhr,
    coolingBTUhr: mechCoolingBTUhr + padCoolingBTUhr + fogCoolingBTUhr,
    envelopeAreaSqFt,
    envelopeUValue,
    ventilationCFM: ventCFM,
    volumeCuFt,
    dtHours,
  });

  // --- Moisture balance (lb water / hr → ΔAH). Vent exchanges interior AH for
  // outdoor AH; pad water rides in with the intake air; fog + transpiration add
  // in-situ; the dehumidifier removes down toward the target-RH AH.
  const dryAirMassLb = Math.max(1e-6, volumeCuFt * DRY_AIR_DENSITY_LB_PER_FT3);
  const ventMassFlowLbPerHr = ventCFM * 60 * DRY_AIR_DENSITY_LB_PER_FT3;
  const ventNetLbPerHr = ventMassFlowLbPerHr * (outdoorAH - AH);

  let dehumRemovalLbPerHr = 0;
  if (dehumEnabled && rhNow > targetRHPct) {
    const ahTarget = ahAtRH(newT, targetRHPct);
    // Hold at target within the substep (adequate-capacity assumption — matches
    // the prior snapshot RH cap). Never removes below the target AH.
    dehumRemovalLbPerHr =
      (Math.max(0, AH - ahTarget) * dryAirMassLb) / Math.max(1e-6, dtHours);
  }

  const netWaterLbPerHr =
    transpirationLbPerHr +
    padWaterLbPerHr +
    fogWaterLbPerHr +
    ventNetLbPerHr -
    dehumRemovalLbPerHr;

  const newWaterMassLb = AH * dryAirMassLb + netWaterLbPerHr * dtHours;
  const grossAH = Math.max(0, newWaterMassLb / dryAirMassLb);
  // Condensation sink: air cannot hold more water than saturation. Excess vapor
  // condenses out (onto cooler surfaces / as fog) and leaves the bulk air, so
  // cap AH at the saturation value for the new temperature. Without this, a
  // closed, humidifying house (vents shut + dehumidifier off) accumulates
  // unphysical supersaturated AH that later "re-evaporates" as temperature
  // rises, faking high RH/VPD (Codex finding). The latent heat released is
  // treated as exported through the envelope surface where condensation forms,
  // not returned to the bulk air — conservative for a screening model.
  const saturationAH = ahAtRH(newT, 100);
  const newAH = Math.min(grossAH, saturationAH);
  const newRH = Math.max(0, Math.min(100, rhFromAbsoluteHumidity(fahrenheitToCelsius(newT), newAH)));

  return {
    indoorTempF: newT,
    indoorAH: newAH,
    indoorRHPct: newRH,
    padCoolingBTUhr,
    fogCoolingBTUhr,
  };
}

export { ahAtRH };
