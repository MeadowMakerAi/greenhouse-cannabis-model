import type { CO2Input } from "../models/co2Model";

export const defaultCO2: Omit<CO2Input, "targetDLI" | "highHumidityRisk"> = {
  enabled: true,
  setpointPpm: 1000,
  controlMode: "enriched",
  ventilationMode: "low",
};

export const co2Presets = {
  ambient: 420,
  enriched: 1000,
  aggressive: 1300,
};
