import {
  saturationVaporPressureKPa,
  actualVaporPressureKPa,
} from "./psychrometricModel";
import { fahrenheitToCelsius } from "../utils/unitConversions";

export interface VPDTargets {
  earlyFlowerVPDMin: number;
  earlyFlowerVPDMax: number;
  midFlowerVPDMin: number;
  midFlowerVPDMax: number;
  lateFlowerVPDMin: number;
  lateFlowerVPDMax: number;
  leafTempOffsetC: number;
}

export const defaultVPDTargets: VPDTargets = {
  earlyFlowerVPDMin: 1.0,
  earlyFlowerVPDMax: 1.3,
  midFlowerVPDMin: 1.2,
  midFlowerVPDMax: 1.5,
  lateFlowerVPDMin: 1.4,
  lateFlowerVPDMax: 1.6,
  leafTempOffsetC: -2,
};

export function vpdFromTempRH(
  airTempF: number,
  rhPct: number,
  leafOffsetC = -2,
): number {
  const airC = fahrenheitToCelsius(airTempF);
  const leafC = airC + leafOffsetC;
  const svpLeaf = saturationVaporPressureKPa(leafC);
  const avpAir = actualVaporPressureKPa(airC, rhPct);
  return Math.max(0, svpLeaf - avpAir);
}
