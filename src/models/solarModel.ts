import { solarKwhToPARDLI } from "./dliModel";
import { flowerWindowDailyFraction } from "./photoperiodModel";

export interface MonthlyClimate {
  month: number;
  shortwaveKwhPerM2PerDay: number;
  meanTempF: number;
  minTempF: number;
  maxTempF: number;
  meanRH: number;
  meanDewPointF: number;
  designWetBulbF: number;
  designDewPointF: number;
}

export interface SolarMonthOutputs {
  month: number;
  outdoorDLI: number;
  greenhouseDLI: number;
  shadedGreenhouseDLI: number;
  flowerWindowDLI: number;
  flowerWindowFraction: number;
}

export interface GreenhouseEnvelope {
  baseTransmissionPct: number;
  roofTransmissionPct: number;
  structureShadeLossPct: number;
  dirtAgingLossPct: number;
  internalObstructionLossPct: number;
}

export const netCanopyTransmissionPct = (e: GreenhouseEnvelope): number => {
  return (
    (e.baseTransmissionPct / 100) *
    (e.roofTransmissionPct / 100) *
    (1 - e.structureShadeLossPct / 100) *
    (1 - e.dirtAgingLossPct / 100) *
    (1 - e.internalObstructionLossPct / 100)
  );
};

export interface SolarInputs {
  envelope: GreenhouseEnvelope;
  shadeEnabled: boolean;
  shadeTransmissionPct: number;
  shadeStartMonth: number;
  shadeEndMonth: number;
  latitudeDeg: number;
  flowerWindowStartHr: number;
  flowerWindowEndHr: number;
  solarToPARFactor: number;
}

export function computeMonthlySolar(
  climate: MonthlyClimate[],
  inputs: SolarInputs,
): SolarMonthOutputs[] {
  const transmission = netCanopyTransmissionPct(inputs.envelope);
  return climate.map((c) => {
    const outdoorDLI = solarKwhToPARDLI(c.shortwaveKwhPerM2PerDay, inputs.solarToPARFactor);
    const greenhouseDLI = outdoorDLI * transmission;

    const shadeActive =
      inputs.shadeEnabled && monthInRange(c.month, inputs.shadeStartMonth, inputs.shadeEndMonth);
    const shadeFactor = shadeActive ? inputs.shadeTransmissionPct / 100 : 1;
    const shadedGreenhouseDLI = greenhouseDLI * shadeFactor;

    const windowFraction = flowerWindowDailyFraction(
      c.month,
      inputs.latitudeDeg,
      inputs.flowerWindowStartHr,
      inputs.flowerWindowEndHr,
    );
    const flowerWindowDLI = shadedGreenhouseDLI * windowFraction;

    return {
      month: c.month,
      outdoorDLI,
      greenhouseDLI,
      shadedGreenhouseDLI,
      flowerWindowDLI,
      flowerWindowFraction: windowFraction,
    };
  });
}

export const monthInRange = (m: number, start: number, end: number): boolean => {
  if (start <= end) return m >= start && m <= end;
  return m >= start || m <= end;
};
