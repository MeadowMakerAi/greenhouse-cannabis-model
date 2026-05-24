/**
 * Cannabis yield projection model.
 *
 * Combines a DLI→yield response, a temperature optimum penalty, and a CO₂
 * multiplier into an annual flower-yield estimate (g/m²/yr).
 *
 * Foundations (verified 2026-05-09):
 *
 * 1. **Rodriguez-Morrison et al. 2021** (Guelph) — yield linear from PPFD 120
 *    to 1800 µmol/m²/s (DLI 5 → 78), 4.5× yield gain. So we model yield as
 *    proportional to DLI, with a soft saturation above DLI 70.
 *
 * 2. **Chandra et al. 2008** — leaf-level Pn Topt = 30 °C, drops sharply above.
 *    The yield-vs-T curve is bell-shaped, asymmetric. Topt for *yield* (vs
 *    leaf-level Pn) is somewhat lower (~25–28 °C / 77–82 °F) because of
 *    night respiration losses.
 *
 * 3. CO₂ enrichment effect on yield: Chandra 2008 shows ~50% Pn boost at 750 vs
 *    350 ppm. Real-world yield gains from enrichment 1000–1200 ppm: 20–35%
 *    when paired with adequate DLI. Below DLI ~30, enrichment has minimal
 *    benefit.
 *
 * **Output is a screening estimate.** Cultivar response varies by 2× or more.
 * Use to compare scenarios, not to predict absolute yield.
 */

import { co2YieldMultiplier, type VentilationMode } from "./co2Model";

export interface YieldInput {
  /** Annual DLI received at canopy, mol/m²/yr (sum of monthly DLI × days) */
  annualDLIMolM2: number;
  /** Mean indoor day temp during flower, °F */
  meanFlowerDayTempF: number;
  /** CO₂ ppm during flower */
  co2Ppm: number;
  /** Whether CO₂ enrichment is operational */
  co2Enabled: boolean;
  /**
   * Ventilation mode — gates physical feasibility of CO₂ enrichment.
   * Open-vented + enriched yields no benefit (CO₂ can't be held at
   * canopy). Defaults to "low" for backward compatibility.
   */
  ventilationMode?: VentilationMode;
  /** Number of flower cycles per year (typical 3–5 indoor, 2–3 greenhouse) */
  cyclesPerYear: number;
  /** Canopy area sqft for absolute yield */
  canopyAreaSqFt: number;
  /**
   * Yield-realism multiplier on the dialed-in projection (default 1.0).
   * The model's baseline assumes a dialed-in operation; real operations
   * run 20-50% below it. See data/yieldRealism.ts.
   */
  realismFactor?: number;
}

export interface YieldOutput {
  /** Yield per unit area, g/m²/cycle */
  gramsPerM2PerCycle: number;
  /** Annual yield, g/m²/yr */
  gramsPerM2PerYear: number;
  /** Total annual harvest, kg/yr */
  totalAnnualKg: number;
  /** Total annual harvest, lbs/yr */
  totalAnnualLbs: number;
  /** Multipliers applied (for transparency) */
  dliFactor: number;
  tempFactor: number;
  co2Factor: number;
  /** Reference baseline yield used (g/m²/cycle at DLI=40, Topt, ambient CO₂) */
  baselineGramsPerM2PerCycle: number;
}

/**
 * Reference baseline at DLI=40 mol/m²/d (cycle avg), Topt 79°F, ambient CO₂:
 * approximately 350 g/m² per 8-week flower cycle (Rodriguez-Morrison fitted).
 * Note: this number assumes:
 *  - dialed-in cultivar
 *  - VPD/irrigation discipline
 *  - no major pathogen losses
 * Real operations under-perform this benchmark by 20–50%.
 */
const BASELINE_G_PER_M2_PER_CYCLE = 350;
const BASELINE_DLI_MOL_M2_DAY = 40;
const TOPT_F = 79; // ~26 °C — yield optimum (slightly below Pn Topt)
const M2_PER_FT2 = 1 / 10.7639;

export function projectYield(input: YieldInput): YieldOutput {
  const cycleDays = 365 / Math.max(1, input.cyclesPerYear);
  // DLI averaged over the cycle (assumes uniform delivery — flowering crops
  // typically only get high DLI 12h, but DLI math already accounts for that)
  const cycleAvgDLI = input.annualDLIMolM2 / 365;

  // ---- DLI factor ----
  // Linear up to DLI 70 (Rodriguez-Morrison saturation onset), then asymptotic.
  let dliFactor: number;
  if (cycleAvgDLI <= 70) {
    dliFactor = cycleAvgDLI / BASELINE_DLI_MOL_M2_DAY;
  } else {
    // Above 70, diminishing returns — half slope, asymptote at ~2.0 × baseline
    dliFactor = 70 / BASELINE_DLI_MOL_M2_DAY + (cycleAvgDLI - 70) / (BASELINE_DLI_MOL_M2_DAY * 2);
  }
  dliFactor = Math.max(0, dliFactor);

  // ---- Temperature factor ----
  // Bell curve centered on Topt; drops to 0.5 at ±8 °F, 0 at ±16 °F
  const dT = input.meanFlowerDayTempF - TOPT_F;
  const tempFactor = Math.max(0, Math.exp(-(dT * dT) / (2 * 8 * 8)));

  // ---- CO₂ factor ----
  // Bounded multiplier sourced from `co2YieldMultiplier` in co2Model.ts —
  // single source of truth, see CITATIONS.md → Chandra et al. (2008).
  // Ventilation mode gates physical feasibility: open-vented + enriched
  // returns 1.0 (no benefit, same physics as the stomatal factor).
  const co2Factor = co2YieldMultiplier(
    input.co2Ppm,
    input.co2Enabled,
    cycleAvgDLI,
    input.ventilationMode ?? "low",
  );

  // Realism haircut — the projection above is the dialed-in ceiling;
  // this scales it to the operator's chosen planning scenario.
  const realismFactor = input.realismFactor ?? 1;
  const gramsPerM2PerCycle =
    BASELINE_G_PER_M2_PER_CYCLE *
    dliFactor *
    tempFactor *
    co2Factor *
    realismFactor;
  const gramsPerM2PerYear = gramsPerM2PerCycle * input.cyclesPerYear;
  const canopyM2 = input.canopyAreaSqFt * M2_PER_FT2;
  const totalAnnualKg = (gramsPerM2PerYear * canopyM2) / 1000;
  const totalAnnualLbs = totalAnnualKg * 2.20462;

  void cycleDays;

  return {
    gramsPerM2PerCycle,
    gramsPerM2PerYear,
    totalAnnualKg,
    totalAnnualLbs,
    dliFactor,
    tempFactor,
    co2Factor,
    baselineGramsPerM2PerCycle: BASELINE_G_PER_M2_PER_CYCLE,
  };
}
