import { dliToPPFD, ppfdToDLI } from "../models/dliModel";
import { fixtureKWFromPPFD, type FixtureSpec } from "../models/fixtureModel";
import { DAYS_IN_MONTH } from "../utils/formatting";
import type { VentilationMode } from "../context/ScenarioContext";

/**
 * Sage's advisory brain — pure functions the chatbot tools call to (a) tell the
 * user what a spec ingest actually established vs left at defaults, and (b)
 * turn a lighting target into a concrete, geography-aware fixture proposal.
 *
 * ZERO-FABRICATION: every number here comes from grow-core math
 * (fixtureKWFromPPFD, dliToPPFD/ppfdToDLI) or the scenario itself. This module
 * proposes; it never mutates — applying is a separate explicit step.
 */

/** The narrow slice of ScenarioInputs the advisor reasons over (testable). */
export interface AdvisorScenario {
  latitude: number;
  longitude: number;
  greenhouseLengthFt: number;
  greenhouseWidthFt: number;
  eaveHeightFt: number;
  peakHeightFt: number;
  canopyAreaSqFt: number;
  envelopeBaseTransmissionPct: number;
  fixtureId: string;
  fixtureType?: "LED" | "HPS";
  flowerPhotoperiodHours: number;
  co2Enabled: boolean;
  ventilationMode: VentilationMode;
  radiantHeatingEnabled: boolean;
  thermalScreenEnabled: boolean;
  mechanicalCoolingEnabled: boolean;
  serviceVoltagePrimary: number;
  branchCircuitAmps: number;
  electricityRatePerKwh: number;
}

/** Default values a spec ingest typically does NOT establish; equality with
 *  these reads as "still unset". A user CAN deliberately choose a default
 *  value — hence the hedged "appears" language in the report. */
export interface AdvisorDefaults {
  latitude: number;
  longitude: number;
  greenhouseLengthFt: number;
  greenhouseWidthFt: number;
  eaveHeightFt: number;
  peakHeightFt: number;
  envelopeBaseTransmissionPct: number;
  fixtureId: string;
  serviceVoltagePrimary: number;
  branchCircuitAmps: number;
  electricityRatePerKwh: number;
}

export interface CompletenessReport {
  /** Established: differs from the default, so someone set it. */
  have: string[];
  /** Appears unset: still equal to the shipped default. */
  missing: string[];
  /** Internally inconsistent combinations worth surfacing before advising. */
  conflicts: string[];
  /** Realizable improvements — headroom the current scenario leaves on the
   *  table. This is an optimization tool, so surfacing these is the point. */
  optimizations: string[];
}

const SEALEDISH: VentilationMode[] = ["sealed", "semi_sealed"];

/** Floor-space utilization = canopy footprint as a % of greenhouse floor.
 *  Movable/rolling benching reaches up to ~90%, peninsular fixed >75%
 *  (see CITATIONS.md — UW-Madison / U-Arkansas Extension). */
export function canopyUtilizationPct(
  canopyAreaSqFt: number,
  floorAreaSqFt: number,
): number {
  if (floorAreaSqFt <= 0) return 0;
  return (canopyAreaSqFt / floorAreaSqFt) * 100;
}

/** Below this, canopy floor-use is worth flagging as unrealized optimization. */
export const CANOPY_UTIL_FLAG_PCT = 80;
/** Practical ceiling rolling/movable benching achieves; headroom is measured
 *  against it so the flag quantifies a real, cited target — not 100%. */
export const ROLLING_BENCH_UTIL_CEILING = 0.9;

export function assessCompleteness(
  s: AdvisorScenario,
  d: AdvisorDefaults,
): CompletenessReport {
  const have: string[] = [];
  const missing: string[] = [];
  const conflicts: string[] = [];
  const optimizations: string[] = [];

  const check = (established: boolean, label: string) =>
    (established ? have : missing).push(label);

  check(
    s.latitude !== d.latitude || s.longitude !== d.longitude,
    "site location (appears at the default Montgomery, NY coordinates)",
  );
  check(
    s.greenhouseLengthFt !== d.greenhouseLengthFt ||
      s.greenhouseWidthFt !== d.greenhouseWidthFt ||
      s.eaveHeightFt !== d.eaveHeightFt ||
      s.peakHeightFt !== d.peakHeightFt,
    "greenhouse dimensions (length/width/eave/peak appear at defaults)",
  );
  check(
    s.envelopeBaseTransmissionPct !== d.envelopeBaseTransmissionPct,
    "glazing spec (transmission appears at the default 80%)",
  );
  check(
    s.fixtureId !== d.fixtureId,
    "light fixtures (generic preset still active — no specific fixture chosen)",
  );
  check(
    s.serviceVoltagePrimary !== d.serviceVoltagePrimary ||
      s.branchCircuitAmps !== d.branchCircuitAmps,
    "electrical branch circuits (voltage/circuit rating appear at defaults — note: main service amps/phase are not modeled)",
  );
  check(
    s.electricityRatePerKwh !== d.electricityRatePerKwh,
    "electricity rate (appears at the default $" + d.electricityRatePerKwh + "/kWh)",
  );
  // Equipment toggles: off is a meaningful state, so report as info-gaps
  // rather than defaults-comparison.
  if (!s.radiantHeatingEnabled) missing.push("heating system (none enabled)");
  if (!s.mechanicalCoolingEnabled)
    missing.push("mechanical cooling (vent/evap only)");

  // Consistency conflicts — the failure modes the sim already warns about,
  // surfaced at ingest time instead of after the user asks.
  if (s.co2Enabled && !SEALEDISH.includes(s.ventilationMode)) {
    conflicts.push(
      `CO₂ enrichment enabled with "${s.ventilationMode}" ventilation — enrichment vents away; needs sealed/semi-sealed`,
    );
  }
  if (s.fixtureType === "HPS" && s.serviceVoltagePrimary < 208) {
    conflicts.push(
      `HPS fixtures on ${s.serviceVoltagePrimary}V service — most DE HPS needs 208V+`,
    );
  }
  if (s.radiantHeatingEnabled && !s.thermalScreenEnabled && s.latitude > 35) {
    conflicts.push(
      "heated greenhouse above 35°N with no thermal screen — roughly half the night heat loss is on the table",
    );
  }

  // Floor-space utilization: how much of the greenhouse floor is actually
  // growing canopy vs aisle/unused. Below ~80% is headroom rolling benches
  // reclaim — the core optimization this tool exists to surface.
  const floorAreaSqFt = s.greenhouseLengthFt * s.greenhouseWidthFt;
  const util = canopyUtilizationPct(s.canopyAreaSqFt, floorAreaSqFt);
  if (floorAreaSqFt > 0 && util < CANOPY_UTIL_FLAG_PCT) {
    const headroomSqFt = Math.round(
      floorAreaSqFt * ROLLING_BENCH_UTIL_CEILING - s.canopyAreaSqFt,
    );
    optimizations.push(
      `canopy is ${util.toFixed(0)}% of floor (${Math.round(s.canopyAreaSqFt)} of ${Math.round(floorAreaSqFt)} ft²) — ` +
        `rolling/movable benching reaches up to ~90% (peninsular fixed >75%), so about ${headroomSqFt} ft² of potential canopy is currently aisle/unused`,
    );
  }

  return { have, missing, conflicts, optimizations };
}

export interface LightingRecommendationArgs {
  /** Design PPFD at canopy (µmol/m²/s). Give this or targetDLI. */
  targetPPFD?: number;
  /** Target DLI (mol/m²/day). Give this or targetPPFD. */
  targetDLI?: number;
  photoperiodHours: number;
  canopyAreaSqFt: number;
  electricityRatePerKwh: number;
  /**
   * Monthly greenhouse solar DLI inside the flower window (mol/m²/day), from
   * the sim's solar model — this is what makes the sizing geography-aware:
   * fixtures are sized to close the WORST month's gap, so the target holds
   * in December, with summer sun as surplus.
   */
  monthlyFlowerWindowDLI: number[];
  /** Candidate fixtures to size (from the library / user preference). */
  fixtures: FixtureSpec[];
}

export interface LightingOption {
  fixtureId: string;
  label: string;
  type: "LED" | "HPS";
  ppe: number;
  fixtureCount: number;
  /** Electrical kW required to hit the target (dimmable fixtures run here). */
  operatingKW: number;
  /** Hardware nameplate kW: fixtureCount × wattsPerFixture. ≥ operatingKW
   *  because the count is rounded up to whole fixtures. */
  installedHardwareKW: number;
  wattsPerSqFt: number;
  gridSpacingFt: number;
  /** Waste heat at the operating point (grow-core lightingHeatBTUhr). */
  addedHeatBTUhr: number;
  addedCoolingTons: number;
  /** Sizing-month electricity for the supplemental lighting alone. */
  worstMonthEnergyCostUSD: number;
}

export interface LightingRecommendation {
  targetDLI: number;
  targetPPFD: number;
  worstMonthSupplementalDLI: number;
  worstMonthSupplementalPPFD: number;
  /** Which month drives the sizing (0-based index into the input array). */
  sizingMonthIndex: number;
  options: LightingOption[];
}

export function recommendLighting(
  a: LightingRecommendationArgs,
): LightingRecommendation | { error: string } {
  if (a.targetPPFD == null && a.targetDLI == null) {
    return { error: "Provide targetPPFD or targetDLI." };
  }
  if (a.photoperiodHours <= 0 || a.canopyAreaSqFt <= 0) {
    return { error: "photoperiodHours and canopyAreaSqFt must be positive." };
  }
  // Both given? They must describe the same design point — otherwise we'd size
  // to one number and report the other. Within tolerance, PPFD is canonical.
  if (a.targetPPFD != null && a.targetDLI != null) {
    const impliedDLI = ppfdToDLI(a.targetPPFD, a.photoperiodHours);
    if (Math.abs(impliedDLI - a.targetDLI) / a.targetDLI > 0.1) {
      return {
        error:
          `targetPPFD ${a.targetPPFD} implies DLI ${impliedDLI.toFixed(1)} at ` +
          `${a.photoperiodHours}h — inconsistent with targetDLI ${a.targetDLI}. Provide one.`,
      };
    }
  }
  const targetPPFD =
    a.targetPPFD ?? dliToPPFD(a.targetDLI!, a.photoperiodHours);
  const targetDLI = ppfdToDLI(targetPPFD, a.photoperiodHours);

  // Geography enters here: size to the month where the sun helps least.
  let sizingMonthIndex = 0;
  let worstSupplementalDLI = 0;
  a.monthlyFlowerWindowDLI.forEach((solar, i) => {
    const gap = Math.max(0, targetDLI - solar);
    if (gap > worstSupplementalDLI) {
      worstSupplementalDLI = gap;
      sizingMonthIndex = i;
    }
  });
  const worstSupplementalPPFD = dliToPPFD(
    worstSupplementalDLI,
    a.photoperiodHours,
  );

  const sizedOptions = a.fixtures.map((f) => ({
    f,
    sized: fixtureKWFromPPFD({
      supplementalPPFDRequired: worstSupplementalPPFD,
      canopyAreaSqFt: a.canopyAreaSqFt,
      fixture: f,
      photoperiodHours: a.photoperiodHours,
      electricityRatePerKwh: a.electricityRatePerKwh,
      daysInMonth: DAYS_IN_MONTH[sizingMonthIndex] ?? 31,
    }),
  }));
  // Most efficient first — sort on RAW kW (display rounding could tie unequal
  // options and freeze library order), tie-broken by label for determinism.
  sizedOptions.sort(
    (x, y) =>
      x.sized.installedKW - y.sized.installedKW ||
      x.f.label.localeCompare(y.f.label),
  );
  const options: LightingOption[] = sizedOptions.map(({ f, sized }) => ({
    fixtureId: f.id,
    label: f.label,
    type: f.type,
    ppe: f.ppe,
    fixtureCount: sized.fixtureCount,
    operatingKW: +sized.installedKW.toFixed(1),
    installedHardwareKW: +((sized.fixtureCount * f.wattsPerFixture) / 1000).toFixed(1),
    wattsPerSqFt: +sized.wattsPerSqFt.toFixed(1),
    gridSpacingFt: +sized.squareGridSpacingFt.toFixed(1),
    // Heat/tons from grow-core's own lightingHeatBTUhr — no re-typed constants.
    addedHeatBTUhr: Math.round(sized.lightingHeatBTUhr),
    // 1 ton of refrigeration = 12,000 BTU/hr (definitional).
    addedCoolingTons: +(sized.lightingHeatBTUhr / 12000).toFixed(1),
    worstMonthEnergyCostUSD: Math.round(sized.monthlyCostUSD),
  }));

  return {
    targetDLI: +targetDLI.toFixed(1),
    targetPPFD: Math.round(targetPPFD),
    worstMonthSupplementalDLI: +worstSupplementalDLI.toFixed(1),
    worstMonthSupplementalPPFD: Math.round(worstSupplementalPPFD),
    sizingMonthIndex,
    options,
  };
}
