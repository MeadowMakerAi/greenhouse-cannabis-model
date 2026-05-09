import type { FixtureSpec } from "./fixtureModel";

export type OptimizationCategory =
  | "lighting"
  | "co2"
  | "shade"
  | "heating"
  | "cooling"
  | "dehumid"
  | "envelope"
  | "ventilation";

export type OptimizationSeverity = "savings" | "sizing" | "info" | "warn";

export interface FixtureCostRow {
  id: string;
  fixture: FixtureSpec;
  annualCostUSD: number;
  annualKwh: number;
  peakKW: number;
  peakFixtures: number;
}

/**
 * A patch the UI can apply to ScenarioInputs in one click. Kept as a
 * loosely-typed Record so the model layer doesn't depend on the React layer.
 */
export type ScenarioPatch = Record<string, unknown>;

export interface Recommendation {
  id: string;
  category: OptimizationCategory;
  title: string;
  currentValue: string;
  recommendedValue: string;
  rationale: string;
  savings?: string;
  applyPatch?: ScenarioPatch;
  severity: OptimizationSeverity;
}

interface SystemOptimizationInput {
  // Lighting
  fixtureCosts: FixtureCostRow[];
  currentFixtureId: string;
  currentAnnualCostUSD: number;

  // Targets
  targetDLI: number;
  highHumidityMonths: number; // count
  ventilationMode: string;
  co2Enabled: boolean;
  co2SetpointPpm: number;

  // Shade
  shadeEnabled: boolean;
  shadeDeployMode: string;
  peakSupplementalPPFD: number;
  targetTopCanopyPPFD: number;

  // Heating
  peakNetHeatingLoadBTUhr: number;
  installedRadiantCapacityBTUhr: number;
  envelopeUValueBTUhrFtF: number;
  annualHeatingFuelMMBtu: number;

  // Cooling
  peakCoolingBTUhr: number;
  evapCoolingEnabled: boolean;
  evapEfficiencyPct: number;
  evapFailureMonths: number;

  // Dehumid
  peakDehumidPintsPerDay: number;
  dehumidEfficiencyPintsPerKwh: number;

  // Indoor target
  indoorTargetDryBulbF: number;
}

export function generateRecommendations(
  input: SystemOptimizationInput,
): Recommendation[] {
  const recs: Recommendation[] = [];

  // ---- 1. Lighting fixture optimization ----
  // Sort by annual cost ascending; tie-break (within 1% of each other) prefers
  // vendor-verified specs over generic presets, since verified fixtures are
  // actually procurable.
  const sortedFixtures = [...input.fixtureCosts].sort((a, b) => {
    const costDiff = a.annualCostUSD - b.annualCostUSD;
    const denom = Math.max(a.annualCostUSD, b.annualCostUSD);
    if (denom > 0 && Math.abs(costDiff) / denom < 0.01) {
      if (a.fixture.source === "vendor-verified" && b.fixture.source !== "vendor-verified") return -1;
      if (b.fixture.source === "vendor-verified" && a.fixture.source !== "vendor-verified") return 1;
    }
    return costDiff;
  });
  const optimal = sortedFixtures[0];
  const current = input.fixtureCosts.find((f) => f.id === input.currentFixtureId);
  if (optimal && current && optimal.id !== current.id) {
    const savings = current.annualCostUSD - optimal.annualCostUSD;
    if (savings > 1) {
      recs.push({
        id: "lighting-fixture",
        category: "lighting",
        title: "Switch to a higher-efficacy fixture",
        currentValue: `${current.fixture.label} · ${current.fixture.ppe.toFixed(2)} µmol/J`,
        recommendedValue: `${optimal.fixture.label} · ${optimal.fixture.ppe.toFixed(2)} µmol/J`,
        rationale: `Optimal fixture delivers the same canopy photon requirement using ~${(((current.annualCostUSD - optimal.annualCostUSD) / current.annualCostUSD) * 100).toFixed(0)}% less electricity, driven by higher PPE × optical utilization.`,
        savings: `$${Math.round(savings).toLocaleString()}/yr lighting cost`,
        applyPatch: { fixtureId: optimal.id },
        severity: "savings",
      });
    }
  }

  // ---- 2. CO₂ enrichment recommendation ----
  if (input.targetDLI >= 40 && !input.co2Enabled) {
    recs.push({
      id: "co2-enable",
      category: "co2",
      title: "Enable CO₂ enrichment",
      currentValue: "Disabled · ambient ~420 ppm",
      recommendedValue: input.targetDLI >= 50 ? "1200 ppm + sealed/semi-sealed" : "1000 ppm + low ventilation",
      rationale: `${input.targetDLI} DLI target without CO₂ runs into Rubisco saturation and stress. Enrichment to ~1000-1200 ppm shifts the photosynthesis curve up so the high DLI actually translates into yield.`,
      applyPatch: {
        co2Enabled: true,
        co2SetpointPpm: input.targetDLI >= 50 ? 1200 : 1000,
        ventilationMode: input.targetDLI >= 50 ? "semi_sealed" : "low",
        co2ControlMode: "enriched",
      },
      severity: "savings",
    });
  }
  if (
    input.co2Enabled &&
    (input.ventilationMode === "open_vented" || input.ventilationMode === "moderate")
  ) {
    recs.push({
      id: "co2-vent-conflict",
      category: "ventilation",
      title: "CO₂ enrichment is being blown out",
      currentValue: `Vent: ${input.ventilationMode.replace("_", " ")} · CO₂ ON`,
      recommendedValue: "Vent: low or semi-sealed",
      rationale: "Open or moderate ventilation dilutes CO₂ enrichment fast — most of the gas exits the building before plants use it. Drop to low or semi-sealed during enrichment windows.",
      applyPatch: { ventilationMode: "low" },
      severity: "warn",
    });
  }
  if (input.co2Enabled && input.co2SetpointPpm > 1500) {
    recs.push({
      id: "co2-setpoint-too-high",
      category: "co2",
      title: "CO₂ setpoint above diminishing-returns threshold",
      currentValue: `${input.co2SetpointPpm} ppm`,
      recommendedValue: "1200-1300 ppm",
      rationale: "Above ~1500 ppm cannabis photosynthesis flattens and worker-safety thresholds become an issue. The upside-per-ppm collapses.",
      applyPatch: { co2SetpointPpm: 1200 },
      severity: "info",
    });
  }

  // ---- 3. Shade strategy ----
  if (input.shadeEnabled && input.shadeDeployMode === "seasonal" && input.peakSupplementalPPFD > input.targetTopCanopyPPFD * 0.5) {
    recs.push({
      id: "shade-deploy-mode",
      category: "shade",
      title: "Switch shade to radiation trigger",
      currentValue: "Seasonal months",
      recommendedValue: "Radiation trigger",
      rationale: "Seasonal mode keeps the curtain closed for whole months, costing DLI on cooler/cloudy days when shade isn't needed. Radiation-triggered deployment closes only when the sun overpowers the cooling system, preserving DLI on swing days.",
      applyPatch: { shadeDeployMode: "radiation_trigger" },
      severity: "info",
    });
  }
  if (!input.shadeEnabled && input.evapFailureMonths >= 2) {
    recs.push({
      id: "shade-enable",
      category: "shade",
      title: "Enable shade to reduce summer cooling load",
      currentValue: "Disabled",
      recommendedValue: "30% shade cloth, June-Sept",
      rationale: `${input.evapFailureMonths} months can't reach indoor target with evap cooling alone. Shade cuts solar heat gain proportionally — usually the cheapest available cooling-load reduction.`,
      applyPatch: {
        shadeEnabled: true,
        shadeTransmissionPct: 70,
        shadeDeployMode: "radiation_trigger",
      },
      severity: "savings",
    });
  }

  // ---- 4. Heating capacity sizing ----
  if (input.peakNetHeatingLoadBTUhr > input.installedRadiantCapacityBTUhr * 1.05) {
    const recommended = Math.ceil(input.peakNetHeatingLoadBTUhr * 1.15 / 1000) * 1000;
    recs.push({
      id: "heating-undersized",
      category: "heating",
      title: "Radiant heating is undersized for design night",
      currentValue: `${input.installedRadiantCapacityBTUhr.toLocaleString()} BTU/hr`,
      recommendedValue: `${recommended.toLocaleString()} BTU/hr (peak load + 15% margin)`,
      rationale: `Peak net heating load is ${Math.round(input.peakNetHeatingLoadBTUhr).toLocaleString()} BTU/hr after lighting offset. Sizing 15% over peak preserves morning recovery margin and accounts for design-night cold extremes the climatology mean understates.`,
      applyPatch: { radiantHeatingCapacityBTUhr: recommended },
      severity: "sizing",
    });
  } else if (input.peakNetHeatingLoadBTUhr * 1.5 < input.installedRadiantCapacityBTUhr) {
    recs.push({
      id: "heating-oversized",
      category: "heating",
      title: "Radiant capacity oversized for the envelope",
      currentValue: `${input.installedRadiantCapacityBTUhr.toLocaleString()} BTU/hr`,
      recommendedValue: `${Math.ceil((input.peakNetHeatingLoadBTUhr * 1.2) / 1000) * 1000} BTU/hr`,
      rationale: "Capacity exceeds 1.5× the design-night load. Boilers cycle inefficiently when oversized — partial-load efficiency drops and short-cycling shortens life.",
      severity: "info",
    });
  }

  // ---- 5. Envelope U-value upgrade ----
  if (input.envelopeUValueBTUhrFtF >= 1.0 && input.annualHeatingFuelMMBtu > 200) {
    recs.push({
      id: "envelope-upgrade",
      category: "envelope",
      title: "Consider double-poly or thermal-screen retrofit",
      currentValue: `U = ${input.envelopeUValueBTUhrFtF.toFixed(2)} BTU/hr·ft²·°F (single-layer)`,
      recommendedValue: "U ≈ 0.7 (double poly) or 0.6 (thermal screen at night)",
      rationale: `Annual heating fuel is ~${input.annualHeatingFuelMMBtu.toFixed(0)} MMBtu/yr. Halving the U-value cuts heating load roughly in half. Payback typically 2-5 years on fuel savings alone in NY climate.`,
      savings: `~${Math.round(input.annualHeatingFuelMMBtu * 0.4)} MMBtu/yr fuel reduction`,
      applyPatch: { envelopeUValueBTUhrFtF: 0.7 },
      severity: "savings",
    });
  }

  // ---- 6. Cooling tonnage ----
  const recommendedTons = Math.ceil((input.peakCoolingBTUhr * 1.15) / 12000);
  recs.push({
    id: "cooling-sizing",
    category: "cooling",
    title: "Size mechanical cooling to peak demand",
    currentValue: `Peak cooling load ${(input.peakCoolingBTUhr / 12000).toFixed(1)} tons (screen)`,
    recommendedValue: `${recommendedTons} tons installed (peak + 15% margin)`,
    rationale: "Peak cooling is the design point. Add 15% for outdoor design extremes the monthly mean understates, plant variability, and morning recovery from cold-night setback.",
    severity: "sizing",
  });
  if (input.evapFailureMonths > 0) {
    recs.push({
      id: "cooling-evap-supplement",
      category: "cooling",
      title: "Plan for mechanical cooling during evap-fail months",
      currentValue: `${input.evapFailureMonths} months evap can't reach target`,
      recommendedValue: "Backup mechanical cooling sized to those months",
      rationale: "Evap is wet-bulb-limited — when outdoor dew point is high it stops working. Plan mechanical cooling capacity for those months specifically; do not assume evap covers summer.",
      severity: "warn",
    });
  }
  if (input.evapCoolingEnabled && input.evapEfficiencyPct < 75) {
    recs.push({
      id: "evap-pad-condition",
      category: "cooling",
      title: "Evap pads underperforming — service or replace",
      currentValue: `${input.evapEfficiencyPct}% pad efficiency`,
      recommendedValue: "75-80% (new media)",
      rationale: "Aged or fouled cellulose pads lose 10-20% efficiency over a few seasons. New media restores most of the cooling reach with zero capital downside.",
      applyPatch: { evapEfficiencyPct: 75 },
      severity: "savings",
    });
  }

  // ---- 7. Dehumidifier sizing ----
  const recommendedPints = Math.ceil(input.peakDehumidPintsPerDay * 1.2);
  recs.push({
    id: "dehumid-sizing",
    category: "dehumid",
    title: "Size dehumidification to peak transpiration day",
    currentValue: `Peak removal need ${Math.round(input.peakDehumidPintsPerDay)} pints/day`,
    recommendedValue: `${recommendedPints} pints/day installed (peak + 20% margin)`,
    rationale: "Late-flower transpiration spikes drive the peak. 20% margin handles night-cycle lights-off humidity surges and partial unit failure during single-day extremes.",
    severity: "sizing",
  });
  if (input.dehumidEfficiencyPintsPerKwh < 6) {
    recs.push({
      id: "dehumid-efficiency",
      category: "dehumid",
      title: "Upgrade to high-efficiency dehumidification",
      currentValue: `${input.dehumidEfficiencyPintsPerKwh} pints/kWh (basic unit)`,
      recommendedValue: "7-10 pints/kWh (commercial / desiccant)",
      rationale: "Commercial condensing or desiccant units pull more water per kWh and run longer between maintenance cycles. Annual electricity savings often pay back the capex in 2-3 years for high-flower-density rooms.",
      applyPatch: { dehumidifierEfficiencyPintsPerKwh: 8 },
      severity: "savings",
    });
  }

  // ---- 8. Indoor target temp sanity ----
  if (input.indoorTargetDryBulbF < 72 || input.indoorTargetDryBulbF > 84) {
    recs.push({
      id: "indoor-target-band",
      category: "info" as never,
      title: "Indoor target temp outside cannabis flower band",
      currentValue: `${input.indoorTargetDryBulbF}°F`,
      recommendedValue: "75-82°F day setpoint",
      rationale: "Cannabis flower windows for terpene retention and growth rate sit in the 75-82°F day band; outside that you trade yield for stress.",
      severity: "warn",
    });
  }

  return recs;
}
