export const FT2_PER_M2 = 10.7639;
export const BTU_PER_KWH = 3412.142;
export const PINTS_PER_GAL = 8;
export const LBS_PER_GAL_WATER = 8.34;
export const BTU_PER_TON_HR = 12000;

export const sqftToSqm = (sqft: number) => sqft / FT2_PER_M2;
export const sqmToSqft = (sqm: number) => sqm * FT2_PER_M2;
export const fahrenheitToCelsius = (f: number) => ((f - 32) * 5) / 9;
export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const kWToBTUhr = (kw: number) => kw * BTU_PER_KWH;
export const btuhrToKW = (btu: number) => btu / BTU_PER_KWH;
export const wattsToBTUhr = (w: number) => (w / 1000) * BTU_PER_KWH;
export const btuhrToTons = (btu: number) => btu / BTU_PER_TON_HR;
export const galToPints = (g: number) => g * PINTS_PER_GAL;
export const galToLbsWater = (g: number) => g * LBS_PER_GAL_WATER;
