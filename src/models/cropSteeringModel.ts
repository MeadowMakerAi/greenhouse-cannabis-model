/**
 * Crop steering target bands for cannabis.
 *
 * Industry-standard climate cues used to direct plant energy toward
 * vegetative (leaf/stem) or generative (flower/cannabinoid) growth.
 *
 * Sources (verified 2026-05-09):
 *   - Growlink, TSRGrow, PhenoDB crop steering guides
 *   - Athena Ag veg/flower environment guides
 *
 * Used to compare current scenario settings to industry-validated targets
 * and flag misalignment.
 */

export type CropSteeringPhase = "vegetative" | "earlyFlower" | "midFlower" | "lateFlower";

export interface PhaseTargets {
  phase: CropSteeringPhase;
  label: string;
  dayTempF: [number, number];
  nightTempF: [number, number];
  dayNightDiffF: [number, number]; // recommended differential
  rhPct: [number, number];
  vpdKPa: [number, number];
  notes: string;
}

export const CROP_STEERING_TARGETS: Record<CropSteeringPhase, PhaseTargets> = {
  vegetative: {
    phase: "vegetative",
    label: "Vegetative (leaf/stem development)",
    dayTempF: [72, 82],
    nightTempF: [68, 76],
    dayNightDiffF: [2, 6],
    rhPct: [58, 75],
    vpdKPa: [0.8, 1.0],
    notes:
      "Lower VPD reduces transpiration stress; keep day/night T differential gentle. Goal is biomass accumulation.",
  },
  earlyFlower: {
    phase: "earlyFlower",
    label: "Early flower (transition / stretch)",
    dayTempF: [75, 80],
    nightTempF: [68, 72],
    dayNightDiffF: [4, 8],
    rhPct: [55, 65],
    vpdKPa: [1.0, 1.3],
    notes:
      "Wider day/night differential triggers generative response. Drop RH to start drying canopy slightly.",
  },
  midFlower: {
    phase: "midFlower",
    label: "Mid flower (bud development)",
    dayTempF: [75, 80],
    nightTempF: [65, 70],
    dayNightDiffF: [5, 10],
    rhPct: [50, 60],
    vpdKPa: [1.2, 1.5],
    notes:
      "Larger day/night swing maximizes stress-driven resin and structure. Manage humidity to avoid pathogen risk.",
  },
  lateFlower: {
    phase: "lateFlower",
    label: "Late flower (ripening / finish)",
    dayTempF: [72, 78],
    nightTempF: [62, 68],
    dayNightDiffF: [8, 12],
    rhPct: [45, 55],
    vpdKPa: [1.4, 1.6],
    notes:
      "Cool nights + low RH trigger anthocyanin / coloration and reduce botrytis risk in dense buds. Critical to keep RH below 60%.",
  },
};

export interface SteeringEvalInput {
  phase: CropSteeringPhase;
  dayTempF: number;
  nightTempF: number;
  rhPct: number;
  vpdKPa: number;
}

export interface SteeringEvaluation {
  targets: PhaseTargets;
  /** 0..100, how well the inputs match the phase target band (higher = better) */
  alignmentScore: number;
  /** Human-readable per-axis assessment */
  axes: {
    dayTemp: { value: number; band: [number, number]; status: "in" | "low" | "high" };
    nightTemp: { value: number; band: [number, number]; status: "in" | "low" | "high" };
    dayNightDiff: { value: number; band: [number, number]; status: "in" | "low" | "high" };
    rh: { value: number; band: [number, number]; status: "in" | "low" | "high" };
    vpd: { value: number; band: [number, number]; status: "in" | "low" | "high" };
  };
}

function status(value: number, band: [number, number]): "in" | "low" | "high" {
  if (value < band[0]) return "low";
  if (value > band[1]) return "high";
  return "in";
}

export function evaluateSteering(input: SteeringEvalInput): SteeringEvaluation {
  const targets = CROP_STEERING_TARGETS[input.phase];
  const dayNightDiff = input.dayTempF - input.nightTempF;
  const axes = {
    dayTemp: { value: input.dayTempF, band: targets.dayTempF, status: status(input.dayTempF, targets.dayTempF) },
    nightTemp: { value: input.nightTempF, band: targets.nightTempF, status: status(input.nightTempF, targets.nightTempF) },
    dayNightDiff: { value: dayNightDiff, band: targets.dayNightDiffF, status: status(dayNightDiff, targets.dayNightDiffF) },
    rh: { value: input.rhPct, band: targets.rhPct, status: status(input.rhPct, targets.rhPct) },
    vpd: { value: input.vpdKPa, band: targets.vpdKPa, status: status(input.vpdKPa, targets.vpdKPa) },
  } as SteeringEvaluation["axes"];
  const inCount = Object.values(axes).filter((a) => a.status === "in").length;
  const alignmentScore = (inCount / 5) * 100;
  return { targets, alignmentScore, axes };
}
