/**
 * Pathogen pressure model for greenhouse cannabis.
 *
 * Two indices, computed monthly from canopy T + RH conditions:
 *
 * 1. Botrytis cinerea (gray mold / bud rot)
 *    - Risk function of: time spent at canopy RH > 70%, T 50–77 °F
 *    - Catastrophic: RH > 93% with free water 8–12 hr (we treat dew-point margin
 *      as proxy for free-water risk — small margin = high condensation risk)
 *    - Late flower most vulnerable
 *
 * 2. Powdery mildew (Golovinomyces ambrosiae)
 *    - Thrives RH 50–90%, T 60–80 °F
 *    - Triggered by RH OSCILLATION (not absolute value) — high night, low day
 *    - Inhibited above 86 °F
 *
 * Both indices output 0..100 where 0 = no pressure, 100 = catastrophic.
 *
 * Source notes (verified 2026-05-09):
 *   - Penn State / UMass extension Botrytis fact sheets
 *   - DryGair greenhouse humidity disease guide
 *   - Punja & Lung 2022 (Canadian Journal of Botany) — bud rot in cannabis
 *   - Llewellyn et al. 2021 — UV-B reduces PM severity but reduces cannabinoids too
 */

export interface PathogenInput {
  /** Canopy zone mean temp (°F) */
  meanTempF: number;
  /** Canopy zone RH (%) */
  meanRH: number;
  /** Dew point (°F) at canopy zone — small margin to leaf surface = condensation */
  dewPointF: number;
  /** Crop stage — late flower more vulnerable to botrytis */
  cropStage: "vegetative" | "earlyFlower" | "midFlower" | "lateFlower";
  /** Whether plants are in flower (longer photoperiod stage) */
  isFlowering: boolean;
}

export interface PathogenScores {
  botrytisScore: number; // 0-100
  powderyMildewScore: number; // 0-100
  /** Free-water risk from low dew-point margin (0..1) */
  freeWaterRisk: number;
  /** Plain-language summary of the dominant risk */
  summary: string;
}

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function evaluatePathogenPressure(input: PathogenInput): PathogenScores {
  // ---- Botrytis ----
  // T-window: peak 60–68 °F, declines to 0 outside 50–77 °F
  let bT = 0;
  if (input.meanTempF >= 50 && input.meanTempF <= 77) {
    const distFromOptimum = Math.abs(input.meanTempF - 64);
    bT = Math.max(0, 1 - distFromOptimum / 14);
  }
  // RH-window: 0 below 60, ramping to 1 at 95
  let bRH = 0;
  if (input.meanRH >= 60) {
    bRH = Math.min(1, (input.meanRH - 60) / 35);
  }
  // Dew-point margin: smaller margin = condensation risk = botrytis catalyst
  const margin = input.meanTempF - input.dewPointF;
  const freeWaterRisk = margin <= 2 ? 1 : margin <= 5 ? 0.6 : margin <= 8 ? 0.3 : 0.1;
  // Stage multiplier
  const stageMult =
    input.cropStage === "lateFlower" ? 1.4
    : input.cropStage === "midFlower" ? 1.15
    : input.cropStage === "earlyFlower" ? 1.0
    : 0.7; // vegetative

  const botrytisScore = clamp(
    bT * bRH * (0.6 + 0.4 * freeWaterRisk) * stageMult * 100,
  );

  // ---- Powdery mildew ----
  // T-window: peak 70–77 °F, declines outside 60–86 °F
  let pT = 0;
  if (input.meanTempF >= 60 && input.meanTempF <= 86) {
    const distFromOptimum = Math.abs(input.meanTempF - 73);
    pT = Math.max(0, 1 - distFromOptimum / 13);
  }
  // RH-window: PM thrives 50–90%; less stable than botrytis on absolute RH but
  // sustained RH > 50 is the key threshold. Above 90 actually inhibits PM
  // (it prefers dry leaf surfaces).
  let pRH = 0;
  if (input.meanRH >= 50 && input.meanRH <= 90) {
    pRH = 1 - Math.abs(input.meanRH - 70) / 20;
  } else if (input.meanRH > 90) {
    pRH = 0.4; // partially inhibited but spores still form
  }
  // Flowering stage carries more risk (denser canopy + flower morphology)
  const pmStageMult = input.isFlowering ? 1.15 : 0.9;

  const powderyMildewScore = clamp(pT * pRH * pmStageMult * 100);

  // ---- Summary ----
  let summary: string;
  if (botrytisScore >= 60 && powderyMildewScore >= 50) {
    summary = "High pathogen pressure: both botrytis and powdery mildew favored.";
  } else if (botrytisScore >= 60) {
    summary = "Botrytis pressure high — cool RH-heavy conditions; condensation risk.";
  } else if (powderyMildewScore >= 60) {
    summary = "Powdery mildew pressure high — warm humid conditions favor sporulation.";
  } else if (botrytisScore >= 30 || powderyMildewScore >= 30) {
    summary = "Moderate pathogen pressure; routine IPM and humidity control.";
  } else {
    summary = "Low pathogen pressure under current canopy climate.";
  }

  return { botrytisScore, powderyMildewScore, freeWaterRisk, summary };
}
