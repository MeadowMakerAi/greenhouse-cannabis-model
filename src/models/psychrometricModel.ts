import { fahrenheitToCelsius, celsiusToFahrenheit } from "../utils/unitConversions";

export const saturationVaporPressureKPa = (tempC: number): number =>
  0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));

export const actualVaporPressureKPa = (tempC: number, rhPct: number): number =>
  saturationVaporPressureKPa(tempC) * (rhPct / 100);

export const dewPointC = (tempC: number, rhPct: number): number => {
  const a = 17.27;
  const b = 237.3;
  const alpha = (a * tempC) / (b + tempC) + Math.log(rhPct / 100);
  return (b * alpha) / (a - alpha);
};

/**
 * Stull 2011 wet-bulb temperature approximation. Inputs in °C and %.
 * Accurate to within ~0.3 °C across typical ambient ranges.
 */
export const wetBulbCStull = (tempC: number, rhPct: number): number => {
  const rh = Math.max(1, Math.min(100, rhPct));
  return (
    tempC * Math.atan(0.151977 * Math.sqrt(rh + 8.313659)) +
    Math.atan(tempC + rh) -
    Math.atan(rh - 1.676331) +
    0.00391838 * Math.pow(rh, 1.5) * Math.atan(0.023101 * rh) -
    4.686035
  );
};

export const wetBulbF = (tempF: number, rhPct: number): number =>
  celsiusToFahrenheit(wetBulbCStull(fahrenheitToCelsius(tempF), rhPct));

export const dewPointF = (tempF: number, rhPct: number): number =>
  celsiusToFahrenheit(dewPointC(fahrenheitToCelsius(tempF), rhPct));

/**
 * Absolute humidity (kg water vapor per kg dry air) at given air temperature
 * and relative humidity. Uses the standard psychrometric ratio
 *   W = 0.622 × VP / (P − VP)
 * with atmospheric pressure P_atm = 101.325 kPa.
 */
export const absoluteHumidityKgPerKg = (tempC: number, rhPct: number): number => {
  const vp = actualVaporPressureKPa(tempC, rhPct);
  const P_ATM = 101.325;
  return (0.622 * vp) / Math.max(0.01, P_ATM - vp);
};

/**
 * Convert absolute humidity (kg/kg) back to relative humidity (%) at a given
 * temperature. Useful for predicting indoor RH given indoor T and the AH
 * inherited from outdoor air through ventilation.
 */
export const rhFromAbsoluteHumidity = (
  tempC: number,
  ahKgPerKg: number,
): number => {
  const P_ATM = 101.325;
  // W = 0.622 VP/(P − VP) → VP = W·P / (0.622 + W)
  const vp = (ahKgPerKg * P_ATM) / (0.622 + ahKgPerKg);
  const svp = saturationVaporPressureKPa(tempC);
  return Math.max(0, Math.min(100, (vp / svp) * 100));
};

export interface PsychState {
  dryBulbF: number;
  rhPct: number;
  dewPointF: number;
  wetBulbF: number;
  vpdKPa: number;
}

export function psychState(dryBulbF: number, rhPct: number, leafOffsetC = 0): PsychState {
  const tempC = fahrenheitToCelsius(dryBulbF);
  const leafC = tempC + leafOffsetC;
  const svp = saturationVaporPressureKPa(leafC);
  const avp = saturationVaporPressureKPa(tempC) * (rhPct / 100);
  const vpd = svp - avp;
  return {
    dryBulbF,
    rhPct,
    dewPointF: dewPointF(dryBulbF, rhPct),
    wetBulbF: wetBulbF(dryBulbF, rhPct),
    vpdKPa: Math.max(0, vpd),
  };
}
