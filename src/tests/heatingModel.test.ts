import { describe, expect, it } from "vitest";
import { evaluateHeating } from "../models/heatingModel";

const baseInput = {
  enabled: true,
  outdoorNightTempF: 20,
  targetNightTempF: 65,
  envelopeAreaSqFt: 3500,
  envelopeUValueBTUhrFtF: 1.1,
  nightLightingKW: 0,
  lightingHeatRecoveryFraction: 0.6,
  equipmentNightKW: 0,
  radiantCapacityBTUhr: 250000,
  radiantEfficiency: 0.92,
  nightHoursPerDay: 12,
  daysInMonth: 31,
};

describe("heatingModel", () => {
  it("disabled returns zeros and notes the gap", () => {
    const r = evaluateHeating({ ...baseInput, enabled: false });
    expect(r.envelopeLossBTUhr).toBe(0);
    expect(r.netHeatingLoadBTUhr).toBe(0);
    expect(r.notes.some((n) => n.includes("disabled"))).toBe(true);
  });

  it("envelope loss = U × area × ΔT", () => {
    const r = evaluateHeating(baseInput);
    expect(r.envelopeLossBTUhr).toBeCloseTo(1.1 * 3500 * 45, 0); // = 173,250
  });

  it("net load is reduced by lighting offset", () => {
    const noLight = evaluateHeating(baseInput);
    const withLight = evaluateHeating({ ...baseInput, nightLightingKW: 20 });
    expect(withLight.netHeatingLoadBTUhr).toBeLessThan(noLight.netHeatingLoadBTUhr);
    // 20 kW × 0.6 = 12 kW × 3412 = 40,944 BTU/hr offset
    const expectedOffset = 20 * 0.6 * 3412.142;
    expect(noLight.netHeatingLoadBTUhr - withLight.netHeatingLoadBTUhr).toBeCloseTo(
      expectedOffset,
      0,
    );
  });

  it("flags undersized capacity", () => {
    const r = evaluateHeating({ ...baseInput, radiantCapacityBTUhr: 50000 });
    expect(r.capacityCoversLoad).toBe(false);
    expect(r.notes.some((n) => n.includes("below the design"))).toBe(true);
  });

  it("flags lighting overshoot when offset > envelope loss", () => {
    const r = evaluateHeating({
      ...baseInput,
      outdoorNightTempF: 60,
      targetNightTempF: 65,
      nightLightingKW: 30,
    });
    expect(r.notes.some((n) => n.includes("Lighting waste heat exceeds"))).toBe(true);
  });

  it("monthly fuel input scales by net load × hours / efficiency / days", () => {
    const r = evaluateHeating(baseInput);
    const expected =
      (r.netHeatingLoadBTUhr / 0.92) * 12 * 31 / 1_000_000;
    expect(r.monthlyFuelInputMMBtu).toBeCloseTo(expected, 3);
  });
});
