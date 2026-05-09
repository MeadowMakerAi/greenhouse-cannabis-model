import { btuhrToTons, kWToBTUhr } from "../utils/unitConversions";

export interface HeatLoadInput {
  outdoorDryBulbF: number;
  indoorTargetTempF: number;
  envelopeUValueBTUhrFtF: number; // BTU/hr/ft²/°F
  greenhouseEnvelopeAreaSqFt: number;
  greenhouseFloorAreaSqFt: number;
  solarShortwaveWm2: number;
  greenhouseTransmissionFraction: number;
  shadeFactor: number; // 0..1
  lightingKW: number;
  underCanopyKW: number;
  equipmentKW: number;
  ventilationCFM: number;
  ventilationDeltaTempF: number;
  plantTranspirationGalDay: number;
}

export interface HeatLoadOutput {
  solarHeatGainBTUhr: number;
  transmissionHeatGainBTUhr: number;
  lightingHeatBTUhr: number;
  underCanopyHeatBTUhr: number;
  equipmentHeatBTUhr: number;
  ventilationSensibleLoadBTUhr: number;
  plantLatentLoadBTUhr: number;
  totalCoolingBTUhr: number;
  coolingTons: number;
}

const W_PER_M2_TO_BTU_PER_FT2_HR = 0.317;
const M2_PER_FT2 = 0.092903;
const VENT_SENSIBLE_COEFF = 1.08; // BTU/hr per CFM per °F

export function heatLoadEstimate(input: HeatLoadInput): HeatLoadOutput {
  const solarBtuPerFt2 = input.solarShortwaveWm2 * W_PER_M2_TO_BTU_PER_FT2_HR;
  const solarHeatGainBTUhr =
    solarBtuPerFt2 *
    input.greenhouseFloorAreaSqFt *
    input.greenhouseTransmissionFraction *
    input.shadeFactor;

  const tempDelta = Math.max(0, input.indoorTargetTempF - input.outdoorDryBulbF);
  const transmissionHeatGainBTUhr =
    -input.envelopeUValueBTUhrFtF * input.greenhouseEnvelopeAreaSqFt * tempDelta;
  // Negative value indicates heat loss (heating), positive would be gain.
  // For cooling-load estimation, a positive outdoor>indoor temp delta produces gain:
  const coolingDelta = Math.max(0, input.outdoorDryBulbF - input.indoorTargetTempF);
  const transmissionCoolGainBTUhr =
    input.envelopeUValueBTUhrFtF * input.greenhouseEnvelopeAreaSqFt * coolingDelta;

  const lightingHeatBTUhr = kWToBTUhr(input.lightingKW);
  const underCanopyHeatBTUhr = kWToBTUhr(input.underCanopyKW);
  const equipmentHeatBTUhr = kWToBTUhr(input.equipmentKW);
  const ventilationSensibleLoadBTUhr =
    VENT_SENSIBLE_COEFF * input.ventilationCFM * input.ventilationDeltaTempF;

  // Latent load from plant transpiration: 1 lb water evap ≈ 1054 BTU latent.
  const lbsWaterPerHr = (input.plantTranspirationGalDay * 8.34) / 24;
  const plantLatentLoadBTUhr = lbsWaterPerHr * 1054;

  const totalCoolingBTUhr =
    solarHeatGainBTUhr +
    transmissionCoolGainBTUhr +
    lightingHeatBTUhr +
    underCanopyHeatBTUhr +
    equipmentHeatBTUhr +
    Math.max(0, ventilationSensibleLoadBTUhr) +
    plantLatentLoadBTUhr;

  return {
    solarHeatGainBTUhr,
    transmissionHeatGainBTUhr,
    lightingHeatBTUhr,
    underCanopyHeatBTUhr,
    equipmentHeatBTUhr,
    ventilationSensibleLoadBTUhr,
    plantLatentLoadBTUhr,
    totalCoolingBTUhr,
    coolingTons: btuhrToTons(totalCoolingBTUhr),
  };
}

void M2_PER_FT2;
