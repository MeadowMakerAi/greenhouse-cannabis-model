import { describe, expect, it } from "vitest";
import {
  saturationVaporPressureKPa,
  dewPointF,
  wetBulbF,
  psychState,
} from "../models/psychrometricModel";
import { vpdFromTempRH } from "../models/vpdModel";

describe("psychrometricModel", () => {
  it("SVP at 20°C ≈ 2.34 kPa", () => {
    expect(saturationVaporPressureKPa(20)).toBeCloseTo(2.339, 2);
  });

  it("SVP at 25°C ≈ 3.17 kPa", () => {
    expect(saturationVaporPressureKPa(25)).toBeCloseTo(3.169, 2);
  });

  it("dew point ≤ dry bulb at <100% RH", () => {
    const dp = dewPointF(75, 60);
    expect(dp).toBeLessThan(75);
  });

  it("wet-bulb < dry-bulb at <100% RH", () => {
    const wb = wetBulbF(85, 50);
    expect(wb).toBeLessThan(85);
    expect(wb).toBeGreaterThan(60);
  });

  it("VPD increases as RH falls", () => {
    const high = vpdFromTempRH(78, 50, -2);
    const low = vpdFromTempRH(78, 80, -2);
    expect(high).toBeGreaterThan(low);
  });

  it("psychState returns sane values for typical mid-flower", () => {
    const s = psychState(78, 55, -2);
    expect(s.vpdKPa).toBeGreaterThan(0.8);
    expect(s.vpdKPa).toBeLessThan(2.0);
    expect(s.dewPointF).toBeLessThan(78);
  });
});
