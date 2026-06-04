/**
 * Proactive insights for the current scenario.
 *
 * Pattern borrowed from Linear Insights / Microsoft Copilot UX research:
 * surface contextual recommendations that show *direction* (improving,
 * declining, opportunity) rather than passive readouts. Triggered by
 * scenario state crossing thresholds — not by user request.
 */

export type InsightSeverity = "savings" | "warn" | "info" | "celebrate";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  body: string;
  hint?: string;
}

interface InsightInput {
  cyclesPerYear: number;
  targetDLI: number;
  co2Enabled: boolean;
  co2SetpointPpm: number;
  ventilationMode: string;
  cropTargetId: string;
  cultivationPhase: string;
  thermalScreenEnabled: boolean;
  envelopeUValueBTUhrFtF: number;
  evapEfficiencyPct: number;
  shadeEnabled: boolean;
  fixtureSource: "preset" | "vendor-verified" | "custom";
  fixturePPE: number;
  fixtureSupports120V: boolean;
  fixtureSupports240V: boolean;
  serviceVoltagePrimary: number;
  // derived values
  yieldDLIFactor: number;
  yieldTempFactor: number;
  yieldCO2Factor: number;
  energyUseIntensity: number;
  peakBotrytis: number;
  peakPM: number;
  peakNetHeatingLoad: number;
  installedRadiantCapacity: number;
  cropSteeringAlignment: number;
  evapFailMonths: number;
  highHumidityMonths: number;
}

export function generateProactiveInsights(input: InsightInput): Insight[] {
  const insights: Insight[] = [];

  // ---- Lighting opportunities ----
  if (input.fixtureSource === "preset") {
    insights.push({
      id: "fixture-preset",
      severity: "info",
      title: "Replace generic preset with a verified fixture",
      body: "You're sizing against a generic LED placeholder. Pick a vendor-verified fixture (or add a custom one with datasheet specs) for procurement-grade numbers.",
      hint: "LED vs HPS tab → 'Use this fixture' on any vendor card.",
    });
  }
  if (input.fixturePPE < 2.7 && input.fixtureSource !== "custom") {
    insights.push({
      id: "fixture-low-ppe",
      severity: "savings",
      title: "Higher-PPE fixtures cut electricity 15–30%",
      body: `Active fixture is ${input.fixturePPE.toFixed(2)} µmol/J. Modern top-tier LED hits 3.0–3.2 µmol/J — same canopy photons for 15–30% less kWh year-round.`,
      hint: "Swap on Optimized System tab.",
    });
  }
  if (!input.fixtureSupports120V && input.serviceVoltagePrimary === 240) {
    insights.push({
      id: "fixture-volt",
      severity: "info",
      title: "Selected fixture needs 240V branches",
      body: "Driver requires ≥208V. Plan dedicated 240V circuits — won't run on 120V general-purpose branches at the farm.",
    });
  }

  // ---- CO₂ & DLI ----
  if (input.targetDLI >= 40 && !input.co2Enabled) {
    insights.push({
      id: "co2-needed",
      severity: "savings",
      title: "Enable CO₂ enrichment to actually use that DLI",
      body: `${input.targetDLI} DLI without CO₂ enrichment runs into Rubisco saturation around 35 DLI. Photons above that threshold mostly waste electricity. CO₂ at 1000 ppm shifts the curve up; yield gain ~30%.`,
      hint: "set_scenario co2Enabled true, co2SetpointPpm 1000, ventilationMode low",
    });
  }
  if (
    input.co2Enabled &&
    (input.ventilationMode === "open_vented" || input.ventilationMode === "moderate")
  ) {
    insights.push({
      id: "co2-vent-conflict",
      severity: "warn",
      title: "CO₂ is being blown out the vents",
      body: `Ventilation mode is "${input.ventilationMode.replace("_", " ")}" while CO₂ is on. Most enrichment exits the building before plants use it. Drop to low or semi-sealed during enrichment windows.`,
    });
  }

  // ---- Thermal screen ----
  if (
    !input.thermalScreenEnabled &&
    input.envelopeUValueBTUhrFtF >= 1.0 &&
    input.peakNetHeatingLoad > 100000
  ) {
    insights.push({
      id: "thermal-screen",
      severity: "savings",
      title: "Thermal screen could cut heating fuel ~40%",
      body: "Single-layer envelope + heavy nighttime heating load. A deployable thermal screen drops effective night U-value from ~1.10 to ~0.65, cutting envelope loss roughly in half. ROI 1–3 yr in NY climate.",
      hint: "Toggle Thermal screen on in the sidebar.",
    });
  }

  // ---- Cooling / pathogen ----
  if (input.evapFailMonths >= 2 && !input.shadeEnabled) {
    insights.push({
      id: "shade-needed",
      severity: "warn",
      title: `Evap cooling fails ${input.evapFailMonths} months — add shade`,
      body: "Wet-bulb pushes evap supply above target indoor temp. 30% shade cloth cuts solar heat gain proportionally — usually the cheapest available cooling reduction. Trades DLI for cooling reach.",
    });
  }
  if (input.peakBotrytis >= 60) {
    insights.push({
      id: "botrytis-pressure",
      severity: "warn",
      title: `Peak botrytis pressure ${Math.round(input.peakBotrytis)}/100`,
      body: "Cool RH-saturated months in current canopy climate plan. Late flower most vulnerable. Tighten dehumidification + raise night setpoint to widen dew-point margin.",
    });
  }
  if (input.peakPM >= 60) {
    insights.push({
      id: "pm-pressure",
      severity: "warn",
      title: `Peak powdery mildew pressure ${Math.round(input.peakPM)}/100`,
      body: "Warm humid conditions favor PM sporulation. PM prefers RH oscillation (high night, low day). Dampen the swing — mechanical dehumidification with a tight setpoint.",
    });
  }

  // ---- Crop steering alignment ----
  if (input.cropSteeringAlignment < 60) {
    insights.push({
      id: "steering-misaligned",
      severity: "info",
      title: `Climate ${Math.round(input.cropSteeringAlignment)}% aligned to phase target`,
      body: `Current day/night temps + RH + VPD don't match the ${input.cultivationPhase} target band. Open the Cultivation Science tab to see which axes are off.`,
    });
  }

  // ---- Heating sizing ----
  if (input.peakNetHeatingLoad > input.installedRadiantCapacity * 1.05) {
    insights.push({
      id: "heating-undersized",
      severity: "warn",
      title: "Radiant heating undersized for design night",
      body: `Peak net load ${(input.peakNetHeatingLoad / 1000).toFixed(0)}k BTU/hr exceeds installed ${(input.installedRadiantCapacity / 1000).toFixed(0)}k. Bump capacity to ${Math.round((input.peakNetHeatingLoad * 1.15) / 1000)}k for 15% margin.`,
    });
  }

  // ---- Yield potential ----
  if (input.yieldDLIFactor < 0.85 && input.targetDLI < 40) {
    insights.push({
      id: "yield-dli-headroom",
      severity: "savings",
      title: "DLI target leaves yield on the table",
      body: `Yield is linear in DLI up to ~70 mol/m²/d (Rodriguez-Morrison 2021). Bump target from ${input.targetDLI} to ${Math.min(50, input.targetDLI + 10)} to capture proportional gain — pair with CO₂.`,
    });
  }

  // ---- EUI benchmark ----
  if (input.energyUseIntensity > 0 && input.energyUseIntensity > 2.5) {
    insights.push({
      id: "eui-high",
      severity: "warn",
      title: `Energy use intensity ${input.energyUseIntensity.toFixed(2)} kWh/g`,
      body: "Greenhouse cannabis benchmark is 0.5–1.5 kWh/g. Above 2 kWh/g typically means over-lit relative to natural DLI. Consider seasonal shade-and-coast strategy or higher-PPE fixture.",
    });
  } else if (input.energyUseIntensity > 0 && input.energyUseIntensity < 0.8) {
    insights.push({
      id: "eui-celebrate",
      severity: "celebrate",
      title: `EUI ${input.energyUseIntensity.toFixed(2)} kWh/g — top quartile`,
      body: "Greenhouse benchmark territory. Natural DLI capture + efficient fixtures + appropriate target DLI working together.",
    });
  }

  // ---- The headline tension: light intensity vs. ability to keep it cool ----
  // The single hardest balance in greenhouse cultivation — every extra mole of
  // light is heat you then have to reject. Surface it as a synthesizing call
  // when the scenario is pushing DLI past the cooling system's reach.
  if (input.targetDLI >= 38 && input.evapFailMonths >= 1) {
    insights.push({
      id: "light-cooling-tension",
      severity: "warn",
      title: "Light vs. cooling — you're outrunning your cooling",
      body: `Target ${input.targetDLI} DLI is aggressive, but evaporative cooling can't hold the indoor band in ${input.evapFailMonths} month${input.evapFailMonths > 1 ? "s" : ""}. This is THE greenhouse tradeoff: every mole of light is heat to reject. Shade-and-coast the hot months, add mechanical cooling (heat pump / chiller), or accept a lower summer DLI — the right answer depends on your $/gram target.`,
      hint: "Put the Shade tradeoff and HVAC screening tabs side by side.",
    });
  }

  return insights;
}
