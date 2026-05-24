export type VentilationMode = "open_vented" | "moderate" | "low" | "semi_sealed" | "sealed";
export type CO2ControlMode = "ambient" | "enriched" | "sealed_or_semi_sealed";

/**
 * Yield multiplier from CO₂ enrichment, single source of truth for the
 * whole model. Step function calibrated against Chandra et al. 2008 leaf
 * Pn data, damped to the real-world flower-yield response (20–35% lift at
 * 1000–1200 ppm when DLI is sufficient).
 *
 * Below DLI ~30 the enrichment benefit collapses (the carbon supply is
 * never the limit when light already is) — return a small placeholder
 * 1.05× so the operator sees they're paying for CO₂ without getting the
 * yield they would at adequate light.
 *
 * `ventilationMode` gates physical feasibility — same gate as
 * `co2StomatalFactor`. Open-vented operation cannot hold elevated CO₂
 * at the canopy, so the yield benefit is also zero. Moderate
 * ventilation realizes half the nominal benefit (canopy concentration
 * heavily diluted). This keeps yield and transpiration physics in
 * sync — otherwise an open-vented + 1200 ppm scenario would show
 * unchanged transpiration but a +40% yield bump, which is wrong and
 * could drive bad capex decisions.
 *
 * See CITATIONS.md → Chandra et al. (2008) for the underlying Pn data.
 */
export function co2YieldMultiplier(
  ppm: number,
  enabled: boolean,
  cycleAvgDLI = 40,
  ventilationMode: VentilationMode = "low",
): number {
  if (!enabled) return 1.0;
  // Physical feasibility gate — CO₂ cannot be held at canopy under
  // open ventilation, so no yield benefit either (same physics as the
  // stomatal factor).
  if (ventilationMode === "open_vented") return 1.0;
  if (cycleAvgDLI < 30) return 1.05;
  const nominal =
    ppm >= 1500 ? 1.45
    : ppm >= 1200 ? 1.40
    : ppm >= 1000 ? 1.30
    : ppm >= 800 ? 1.20
    : ppm >= 600 ? 1.10
    : 1.0;
  // Moderate ventilation dilutes canopy CO₂ — realize half the benefit.
  if (ventilationMode === "moderate") {
    return 1.0 + (nominal - 1.0) * 0.5;
  }
  return nominal;
}

/**
 * Whole-canopy transpiration multiplier under elevated CO₂. Elevated
 * CO₂ partially closes stomata, reducing transpiration per unit leaf
 * area; the whole-canopy effect is more muted than leaf-level g_s
 * because LAI partly compensates. Conservative bounds, calibrated to
 * FACE meta-analysis at ~550 ppm and extrapolated monotonically.
 *
 * The returned values represent a DAILY-AGGREGATE, WHOLE-CANOPY
 * reduction (already photoperiod-weighted in the empirical fit). Apply
 * directly to a daily transpiration total. Do NOT apply sub-daily
 * (per-tick) without first gating on lights-on — stomatal closure is a
 * daytime photosynthetic response, and nighttime stomata are already
 * mostly closed regardless of CO₂. Per-tick CO₂ × moisture coupling
 * needs the moisture balance moved inside the substepped Euler loop
 * (see useLiveDynamics.ts comment block).
 *
 * Returns ≤ 1.0 — a multiplier on baseline transpiration.
 *
 * `ventilationMode` gates physical feasibility: open-vented operation
 * cannot hold elevated CO₂ at the canopy (it dumps out the vents), so
 * we return 1.0 regardless of setpoint. Moderate ventilation dilutes
 * the canopy concentration substantially, so we apply only half the
 * nominal closure benefit. See `evaluateCO2.feasible` for the same
 * feasibility model surfaced as a user-visible warning.
 *
 * See CITATIONS.md → Ainsworth & Long (2005).
 */
export function co2StomatalFactor(
  ppm: number,
  enabled: boolean,
  ventilationMode: VentilationMode = "low",
): number {
  if (!enabled) return 1.0;
  // Physical feasibility gate — CO₂ cannot be held at canopy under
  // open ventilation, so no stomatal effect.
  if (ventilationMode === "open_vented") return 1.0;
  const nominal =
    ppm >= 1500 ? 0.82
    : ppm >= 1200 ? 0.85
    : ppm >= 1000 ? 0.88
    : ppm >= 800 ? 0.92
    : ppm >= 600 ? 0.95
    : 1.0;
  // Moderate ventilation dilutes canopy CO₂ — realize half the closure
  // benefit. Linear damping is the conservative choice; the real
  // relationship is a dilution-rate curve we don't have data for.
  if (ventilationMode === "moderate") {
    return 1.0 - (1.0 - nominal) * 0.5;
  }
  return nominal;
}

export interface CO2Input {
  enabled: boolean;
  setpointPpm: number;
  controlMode: CO2ControlMode;
  ventilationMode: VentilationMode;
  targetDLI: number;
  highHumidityRisk: boolean;
}

export interface CO2Output {
  recommendedDLIRangeMin: number;
  recommendedDLIRangeMax: number;
  recommendedPPFDRangeMin: number;
  recommendedPPFDRangeMax: number;
  feasible: boolean;
  warnings: string[];
}

const PHOTOPERIOD_HRS = 12;
const ppfdFromDli = (dli: number) => dli / (PHOTOPERIOD_HRS * 0.0036);

export function evaluateCO2(input: CO2Input): CO2Output {
  const warnings: string[] = [];
  let dliMin = 30;
  let dliMax = 40;

  if (!input.enabled) {
    dliMin = 25;
    dliMax = 40;
  } else if (input.setpointPpm >= 1200) {
    dliMin = 40;
    dliMax = 55;
  } else if (input.setpointPpm >= 900) {
    dliMin = 35;
    dliMax = 50;
  } else if (input.setpointPpm >= 600) {
    dliMin = 30;
    dliMax = 45;
  }

  let feasible = true;
  if (input.enabled && input.ventilationMode === "open_vented") {
    feasible = false;
    warnings.push(
      "CO₂ enrichment is inefficient under open ventilation. Restrict CO₂ to sealed or semi-sealed periods, or use a low-ventilation operating window.",
    );
  }
  if (input.enabled && input.ventilationMode === "moderate") {
    warnings.push(
      "Moderate ventilation will dilute CO₂ enrichment substantially. Expect efficacy losses unless ventilation rate is reduced.",
    );
  }
  if (input.targetDLI > 40 && !input.enabled) {
    warnings.push(
      "DLI targets above ~40 typically require CO₂ enrichment plus tight VPD, irrigation, and nutrition control to avoid stress and diminishing returns.",
    );
  }
  if (input.enabled && input.highHumidityRisk) {
    warnings.push(
      "CO₂ enrichment usually implies reduced ventilation, increasing reliance on mechanical cooling and dehumidification during humid periods.",
    );
  }
  if (input.enabled && input.setpointPpm > 1500) {
    warnings.push(
      "CO₂ setpoints above 1500 ppm yield diminishing returns and raise worker safety / regulatory considerations.",
    );
  }

  return {
    recommendedDLIRangeMin: dliMin,
    recommendedDLIRangeMax: dliMax,
    recommendedPPFDRangeMin: ppfdFromDli(dliMin),
    recommendedPPFDRangeMax: ppfdFromDli(dliMax),
    feasible,
    warnings,
  };
}
