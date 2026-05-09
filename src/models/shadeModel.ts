import { monthInRange } from "./solarModel";

export interface ShadeInput {
  shadeEnabled: boolean;
  shadeTransmissionPct: number;
  shadeStartMonth: number;
  shadeEndMonth: number;
  shadeDeployMode: "manual" | "seasonal" | "temperature_trigger" | "radiation_trigger";
  shadeTriggerOutdoorTempF: number;
  shadeTriggerSolarWm2: number;
}

export const isShadeActive = (
  month: number,
  meanTempF: number,
  meanSolarWm2: number,
  s: ShadeInput,
): boolean => {
  if (!s.shadeEnabled) return false;
  switch (s.shadeDeployMode) {
    case "manual":
    case "seasonal":
      return monthInRange(month, s.shadeStartMonth, s.shadeEndMonth);
    case "temperature_trigger":
      return meanTempF >= s.shadeTriggerOutdoorTempF;
    case "radiation_trigger":
      return meanSolarWm2 >= s.shadeTriggerSolarWm2;
  }
};
