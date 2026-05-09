import { sqftToSqm, kWToBTUhr } from "../utils/unitConversions";
import { ppfdToDLI } from "./dliModel";

export interface UnderCanopyInput {
  enabled: boolean;
  underCanopyPPFD: number;
  underCanopyPhotoperiodHours: number;
  underCanopyPPE: number;
  underCanopyCoveragePct: number;
  underCanopyOpticalUtilization: number;
  underCanopyHeatFractionToCanopyZone: number;
  canopyAreaSqFt: number;
  electricityRatePerKwh: number;
  daysInMonth: number;
  topCanopyDLI: number;
}

export interface UnderCanopyOutput {
  /** DLI delivered to the lower-canopy zone, mol/m²/day. Real photon flux. */
  underCanopyDLI: number;
  /** Average µmol/m²/s added to whole-plant photon delivery, area-weighted by UC coverage. */
  wholePlantPPFDUplift: number;
  /** mol/m²/d added to whole-plant photon delivery, area-weighted. */
  wholePlantDLIUplift: number;
  /** Whole-plant DLI uplift expressed as fraction of top-canopy DLI. */
  wholePlantDLIUpliftFraction: number;
  /** Daily photon delivery added per ft² of canopy footprint, mmol/ft²/day. */
  dailyPhotonAddedMMolPerFt2: number;
  /** Total photon flux added across the canopy, µmol/s. */
  underCanopyPhotonFlux_umol_s: number;
  underCanopyKW: number;
  underCanopyKwhMonth: number;
  underCanopyMonthlyCost: number;
  underCanopyHeatBTUhr: number;
  underCanopyHeatToCanopyZoneBTUhr: number;
}

export function computeUnderCanopy(input: UnderCanopyInput): UnderCanopyOutput {
  if (!input.enabled) {
    return {
      underCanopyDLI: 0,
      wholePlantPPFDUplift: 0,
      wholePlantDLIUplift: 0,
      wholePlantDLIUpliftFraction: 0,
      dailyPhotonAddedMMolPerFt2: 0,
      underCanopyPhotonFlux_umol_s: 0,
      underCanopyKW: 0,
      underCanopyKwhMonth: 0,
      underCanopyMonthlyCost: 0,
      underCanopyHeatBTUhr: 0,
      underCanopyHeatToCanopyZoneBTUhr: 0,
    };
  }
  const coverage = Math.max(0, Math.min(1, input.underCanopyCoveragePct / 100));
  const fullCanopyM2 = sqftToSqm(input.canopyAreaSqFt);
  const litCanopyM2 = fullCanopyM2 * coverage;

  // Real photon flux from the under-canopy fixtures.
  const underCanopyPhotonFlux_umol_s = input.underCanopyPPFD * litCanopyM2;

  // Real DLI delivered to the lower-canopy zone (where the UC fixtures shine).
  const underCanopyDLI = ppfdToDLI(
    input.underCanopyPPFD,
    input.underCanopyPhotoperiodHours,
  );

  // Whole-plant uplift: average added PPFD across the entire canopy footprint
  // (a coverage-weighted average — the unlit fraction contributes nothing).
  const wholePlantPPFDUplift = input.underCanopyPPFD * coverage;
  const wholePlantDLIUplift = ppfdToDLI(
    wholePlantPPFDUplift,
    input.underCanopyPhotoperiodHours,
  );
  const wholePlantDLIUpliftFraction =
    input.topCanopyDLI > 0 ? wholePlantDLIUplift / input.topCanopyDLI : 0;

  // Total mol of photons added per ft² of canopy footprint per day.
  // PPFD (µmol/m²/s) · photoperiod_s · coverage / FT2_PER_M2 → µmol/ft²/d → mmol/ft²/d.
  const photoperiodSeconds = input.underCanopyPhotoperiodHours * 3600;
  const umolPerFt2PerDay =
    input.underCanopyPPFD * coverage * photoperiodSeconds / 10.7639;
  const dailyPhotonAddedMMolPerFt2 = umolPerFt2PerDay / 1000;

  const ucWatts =
    input.underCanopyPPE > 0 && input.underCanopyOpticalUtilization > 0
      ? underCanopyPhotonFlux_umol_s /
        (input.underCanopyPPE * input.underCanopyOpticalUtilization)
      : 0;
  const ucKW = ucWatts / 1000;
  const ucKwhMonth = ucKW * input.underCanopyPhotoperiodHours * input.daysInMonth;
  const monthlyCost = ucKwhMonth * input.electricityRatePerKwh;
  const heatBtuHr = kWToBTUhr(ucKW);
  const heatToCanopy = heatBtuHr * input.underCanopyHeatFractionToCanopyZone;

  return {
    underCanopyDLI,
    wholePlantPPFDUplift,
    wholePlantDLIUplift,
    wholePlantDLIUpliftFraction,
    dailyPhotonAddedMMolPerFt2,
    underCanopyPhotonFlux_umol_s,
    underCanopyKW: ucKW,
    underCanopyKwhMonth: ucKwhMonth,
    underCanopyMonthlyCost: monthlyCost,
    underCanopyHeatBTUhr: heatBtuHr,
    underCanopyHeatToCanopyZoneBTUhr: heatToCanopy,
  };
}
