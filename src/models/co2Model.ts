export type VentilationMode = "open_vented" | "moderate" | "low" | "semi_sealed" | "sealed";
export type CO2ControlMode = "ambient" | "enriched" | "sealed_or_semi_sealed";

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
