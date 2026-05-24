/**
 * Cannabis plant growth model — phase-aware geometry that scales with crop
 * day, modulated by environmental factors (DLI, temperature, CO₂).
 *
 * Phases (typical hybrid cultivar):
 *   - Clone / seedling (day 0–7):  ~0.3 ft tall, basic leaves, no branches
 *   - Veg (day 0 → vegDays):       logistic growth to ~2.0 ft, bushy foliage
 *   - Flower stretch (first 14d):  +50–75% height (cultivar-dependent)
 *   - Flower mid (day 14 → 70%):   cola formation, main bud thickens
 *   - Flower late (last 30%):      cola swell, slight chlorosis
 *
 * Visual parameters returned at each timestep are NOT a yield prediction —
 * they are spatial proxies for what an operator would see in the canopy.
 *
 * Environmental modulation:
 *   - DLI factor:  cumulative DLI / expected DLI for elapsed days. Linear up
 *                  to 1.0, plateaus at 1.05.
 *   - Temp factor: bell on Topt 79 °F (Chandra 2008).
 *   - CO₂ factor:  delegated to `co2YieldMultiplier` in co2Model.ts so the
 *                  step function lives in exactly one place. Uses the
 *                  high-DLI branch by default since growth simulation is
 *                  most useful at light intensities the cultivator actually
 *                  cares about. See CITATIONS.md → Chandra et al. (2008).
 *   - Combined factor scales growth rate, clamped 0.45–1.15.
 */

import { co2YieldMultiplier, type VentilationMode } from "./co2Model";

export type CropPhase = "clone" | "veg" | "flower-stretch" | "flower-mid" | "flower-late";

export interface PlantGrowthInput {
  /** Day-of-year the current crop cycle started (clone planted) */
  cropStartDayOfYear: number;
  /** Days in vegetative phase */
  vegDays: number;
  /** Days in flower phase */
  flowerDays: number;
  /** Current sim day-of-year */
  currentDayOfYear: number;
  /** Average DLI received per day so far (mol/m²/d) — used to compute env factor */
  meanDLI: number;
  /** Target DLI for cultivar (40 commercial, 50 CO₂-enhanced) */
  targetDLI: number;
  /** Mean indoor day temperature (°F) */
  meanTempF: number;
  /** CO₂ ppm during flower */
  co2Ppm: number;
  co2Enabled: boolean;
  /**
   * Ventilation mode — gates physical feasibility of CO₂ enrichment in
   * the visual growth model, same gate as `yieldModel` and
   * `co2StomatalFactor`. Defaults to "low" for backward compatibility.
   */
  ventilationMode?: VentilationMode;
  /** Stretch factor for the cultivar — sativa 1.5, indica 1.2, hybrid 1.35 */
  stretchFactor?: number;
}

export interface PlantGrowthState {
  daysElapsed: number;
  phase: CropPhase;
  daysIntoPhase: number;
  fractionInPhase: number; // 0..1
  fractionInCycle: number; // 0..1
  // Visual geometry
  heightFt: number;
  foliageRadiusFt: number;
  colaCount: number;
  colaSizeFt: number;
  colaDevelopment: number; // 0..1 ripeness
  // Color (HSL)
  foliageHueDeg: number;
  foliageSat: number;
  foliageLight: number;
  // Modulators
  dliFactor: number;
  tempFactor: number;
  co2Factor: number;
  combinedFactor: number;
}

const TOPT_F = 79;

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Symmetric logistic curve, centered at 0.5, slope ~8 */
function logistic(t: number, midpoint = 0.5, k = 8): number {
  return 1 / (1 + Math.exp(-k * (t - midpoint)));
}

export function plantGrowthAt(input: PlantGrowthInput): PlantGrowthState {
  const stretchFactor = input.stretchFactor ?? 1.35;
  let daysElapsed = input.currentDayOfYear - input.cropStartDayOfYear;
  // Allow wrap (e.g., crop started day 350, current is day 20 of next year → 35 days)
  if (daysElapsed < 0) daysElapsed += 365;
  daysElapsed = Math.max(0, daysElapsed);
  const totalCycleDays = input.vegDays + input.flowerDays;
  const fractionInCycle = clamp(daysElapsed / Math.max(1, totalCycleDays), 0, 1);

  // ---- Environmental factors ----
  const dliFactor = clamp(
    input.meanDLI > 0 ? input.meanDLI / Math.max(1, input.targetDLI) : 0.6,
    0.3,
    1.05,
  );
  const dT = input.meanTempF - TOPT_F;
  const tempFactor = clamp(Math.exp(-(dT * dT) / (2 * 8 * 8)), 0.4, 1.05);
  // Pass actual meanDLI so the low-DLI 1.05× damping branch fires when
  // light is the limiting factor — consistent with the yield model's
  // damping below DLI 30. The visual will show under-developed plants
  // both because dliFactor is low AND because CO₂ gives no extra lift,
  // which is the correct physics. Ventilation mode gates feasibility
  // (open-vented returns 1.0 — CO₂ can't be held).
  const co2Factor = co2YieldMultiplier(
    input.co2Ppm,
    input.co2Enabled,
    input.meanDLI,
    input.ventilationMode ?? "low",
  );
  const combinedFactor = clamp(dliFactor * tempFactor * co2Factor, 0.45, 1.15);

  // ---- Phase determination ----
  let phase: CropPhase;
  let daysIntoPhase: number;
  let fractionInPhase: number;
  if (daysElapsed < 7) {
    phase = "clone";
    daysIntoPhase = daysElapsed;
    fractionInPhase = clamp(daysElapsed / 7, 0, 1);
  } else if (daysElapsed < input.vegDays) {
    phase = "veg";
    daysIntoPhase = daysElapsed - 7;
    fractionInPhase = clamp((daysElapsed - 7) / Math.max(1, input.vegDays - 7), 0, 1);
  } else {
    const dayOfFlower = daysElapsed - input.vegDays;
    const stretchEnd = 14;
    const midEnd = input.flowerDays * 0.7;
    if (dayOfFlower < stretchEnd) {
      phase = "flower-stretch";
      daysIntoPhase = dayOfFlower;
      fractionInPhase = clamp(dayOfFlower / stretchEnd, 0, 1);
    } else if (dayOfFlower < midEnd) {
      phase = "flower-mid";
      daysIntoPhase = dayOfFlower - stretchEnd;
      fractionInPhase = clamp((dayOfFlower - stretchEnd) / (midEnd - stretchEnd), 0, 1);
    } else {
      phase = "flower-late";
      daysIntoPhase = dayOfFlower - midEnd;
      fractionInPhase = clamp(
        (dayOfFlower - midEnd) / Math.max(1, input.flowerDays - midEnd),
        0,
        1,
      );
    }
  }

  // ---- Geometry by phase ----
  // Base sizes for an "ideal" environment; combinedFactor scales total height
  // and foliage but not topology (always 5 colas in flower).
  let heightBase: number; // ft
  let foliageRadiusBase: number; // ft
  let colaCount = 0;
  let colaSizeBase = 0;
  let colaDevelopment = 0;
  let foliageHueDeg = 130; // green
  let foliageSat = 45;
  let foliageLight = 32;

  switch (phase) {
    case "clone":
      heightBase = 0.3 + 0.2 * fractionInPhase; // 0.3 → 0.5 ft
      foliageRadiusBase = 0.25 + 0.2 * fractionInPhase;
      foliageHueDeg = 120;
      foliageSat = 55;
      foliageLight = 40; // bright young green
      break;
    case "veg":
      // Logistic ramp to 2.0 ft over vegDays
      heightBase = 0.5 + 1.5 * logistic(fractionInPhase, 0.45, 6);
      foliageRadiusBase = 0.5 + 1.0 * logistic(fractionInPhase, 0.4, 5);
      foliageHueDeg = 125;
      foliageSat = 50;
      foliageLight = 35;
      break;
    case "flower-stretch":
      // Stretch ratio: ~50% additional height in 14 days
      heightBase = 2.0 + (stretchFactor - 1) * 2.0 * fractionInPhase;
      foliageRadiusBase = 1.5 + 0.2 * fractionInPhase;
      colaCount = Math.round(2 + 3 * fractionInPhase); // 2 → 5
      colaSizeBase = 0.05 + 0.10 * fractionInPhase; // tiny pre-flowers
      colaDevelopment = 0.05;
      foliageHueDeg = 125;
      foliageSat = 50;
      foliageLight = 33;
      break;
    case "flower-mid":
      heightBase = 2.0 * stretchFactor;
      foliageRadiusBase = 1.7;
      colaCount = 5;
      colaSizeBase = 0.15 + 0.15 * fractionInPhase; // 0.15 → 0.30
      colaDevelopment = 0.3 + 0.4 * fractionInPhase;
      foliageHueDeg = 122;
      foliageSat = 48;
      foliageLight = 32;
      break;
    case "flower-late":
      heightBase = 2.0 * stretchFactor;
      foliageRadiusBase = 1.7 - 0.15 * fractionInPhase; // slight defoliation
      colaCount = 5;
      colaSizeBase = 0.30 + 0.10 * fractionInPhase; // 0.30 → 0.40 final
      colaDevelopment = 0.7 + 0.3 * fractionInPhase;
      // Slight chlorosis (yellowing) in late flower
      foliageHueDeg = 110 - 15 * fractionInPhase; // shifts toward yellow
      foliageSat = 45 - 5 * fractionInPhase;
      foliageLight = 32 + 6 * fractionInPhase;
      break;
  }

  // Apply environmental scaling: combined factor moves height/foliage/cola
  // size up or down. Stunted plants (factor 0.45) are ~half size; thriving
  // plants (factor 1.15) are 15% larger.
  const heightFt = heightBase * combinedFactor;
  const foliageRadiusFt = foliageRadiusBase * Math.sqrt(combinedFactor);
  const colaSizeFt = colaSizeBase * combinedFactor;
  // Hue desaturation when stressed
  if (combinedFactor < 0.7) {
    foliageSat *= 0.7;
    foliageLight *= 0.85;
  }

  return {
    daysElapsed,
    phase,
    daysIntoPhase,
    fractionInPhase,
    fractionInCycle,
    heightFt,
    foliageRadiusFt,
    colaCount,
    colaSizeFt,
    colaDevelopment,
    foliageHueDeg,
    foliageSat,
    foliageLight,
    dliFactor,
    tempFactor,
    co2Factor,
    combinedFactor,
  };
}
