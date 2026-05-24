import { describe, expect, it } from "vitest";
import {
  co2StomatalFactor,
  co2YieldMultiplier,
  evaluateCO2,
} from "../models/co2Model";

describe("co2Model", () => {
  it("ambient (disabled) recommends 25-40 DLI", () => {
    const r = evaluateCO2({
      enabled: false,
      setpointPpm: 420,
      controlMode: "ambient",
      ventilationMode: "moderate",
      targetDLI: 35,
      highHumidityRisk: false,
    });
    expect(r.recommendedDLIRangeMin).toBe(25);
    expect(r.recommendedDLIRangeMax).toBe(40);
  });

  it("1200 ppm enrichment recommends 40-55 DLI", () => {
    const r = evaluateCO2({
      enabled: true,
      setpointPpm: 1200,
      controlMode: "enriched",
      ventilationMode: "low",
      targetDLI: 50,
      highHumidityRisk: false,
    });
    expect(r.recommendedDLIRangeMin).toBe(40);
    expect(r.recommendedDLIRangeMax).toBe(55);
  });

  it("CO₂ enrichment with open ventilation flagged infeasible", () => {
    const r = evaluateCO2({
      enabled: true,
      setpointPpm: 1000,
      controlMode: "enriched",
      ventilationMode: "open_vented",
      targetDLI: 40,
      highHumidityRisk: false,
    });
    expect(r.feasible).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("DLI > 40 without CO₂ produces a warning", () => {
    const r = evaluateCO2({
      enabled: false,
      setpointPpm: 420,
      controlMode: "ambient",
      ventilationMode: "moderate",
      targetDLI: 50,
      highHumidityRisk: false,
    });
    expect(r.warnings.some((w) => w.includes("DLI targets above"))).toBe(true);
  });
});

describe("co2YieldMultiplier", () => {
  it("returns 1.0 when CO₂ disabled regardless of ppm", () => {
    expect(co2YieldMultiplier(1200, false, 40)).toBe(1.0);
    expect(co2YieldMultiplier(2000, false, 40)).toBe(1.0);
  });

  it("returns 1.05 placeholder when enabled but DLI < 30", () => {
    expect(co2YieldMultiplier(1200, true, 25)).toBe(1.05);
  });

  it("matches the documented step function at adequate DLI", () => {
    expect(co2YieldMultiplier(420, true, 40)).toBe(1.0);
    expect(co2YieldMultiplier(600, true, 40)).toBe(1.1);
    expect(co2YieldMultiplier(1000, true, 40)).toBe(1.3);
    expect(co2YieldMultiplier(1200, true, 40)).toBe(1.4);
    expect(co2YieldMultiplier(1500, true, 40)).toBe(1.45);
  });

  it("returns 1.0 under open ventilation regardless of setpoint (CO₂ cannot be held)", () => {
    // Critical: yield model must NOT show enrichment benefit when the
    // greenhouse can't physically hold the CO₂ at canopy. Same physics
    // gate as co2StomatalFactor — keeps yield + transpiration paths in
    // sync with evaluateCO2.feasible.
    expect(co2YieldMultiplier(1500, true, 40, "open_vented")).toBe(1.0);
    expect(co2YieldMultiplier(1200, true, 40, "open_vented")).toBe(1.0);
    expect(co2YieldMultiplier(800, true, 40, "open_vented")).toBe(1.0);
  });

  it("dampens yield benefit by half under moderate ventilation (CO₂ diluted)", () => {
    // At 1200 ppm, nominal yield = 1.40 (40% lift); under moderate
    // ventilation, realize half → 20% lift → 1.20.
    expect(co2YieldMultiplier(1200, true, 40, "moderate")).toBeCloseTo(1.2, 3);
    // At 1500 ppm, nominal = 1.45 (45% lift); half = 22.5% → 1.225.
    expect(co2YieldMultiplier(1500, true, 40, "moderate")).toBeCloseTo(1.225, 3);
  });

  it("sealed and semi_sealed get the full nominal yield bump", () => {
    expect(co2YieldMultiplier(1200, true, 40, "sealed")).toBe(1.4);
    expect(co2YieldMultiplier(1200, true, 40, "semi_sealed")).toBe(1.4);
  });
});

describe("co2StomatalFactor", () => {
  it("returns 1.0 when CO₂ disabled (no stomatal closure)", () => {
    expect(co2StomatalFactor(1200, false)).toBe(1.0);
    expect(co2StomatalFactor(2000, false)).toBe(1.0);
  });

  it("returns ≤ 1.0 across the enrichment range — stomata partially close", () => {
    expect(co2StomatalFactor(400, true, "low")).toBe(1.0);
    expect(co2StomatalFactor(600, true, "low")).toBe(0.95);
    expect(co2StomatalFactor(1000, true, "low")).toBe(0.88);
    expect(co2StomatalFactor(1200, true, "low")).toBe(0.85);
    expect(co2StomatalFactor(1500, true, "low")).toBe(0.82);
  });

  it("is monotonically non-increasing with ppm", () => {
    const ppms = [400, 600, 800, 1000, 1200, 1500, 2000];
    const factors = ppms.map((p) => co2StomatalFactor(p, true, "low"));
    for (let i = 1; i < factors.length; i++) {
      expect(factors[i]).toBeLessThanOrEqual(factors[i - 1]);
    }
  });

  it("returns 1.0 under open ventilation regardless of setpoint (CO₂ cannot be held)", () => {
    expect(co2StomatalFactor(1500, true, "open_vented")).toBe(1.0);
    expect(co2StomatalFactor(1200, true, "open_vented")).toBe(1.0);
    expect(co2StomatalFactor(800, true, "open_vented")).toBe(1.0);
  });

  it("dampens closure benefit by half under moderate ventilation (CO₂ diluted)", () => {
    // At 1200 ppm, nominal factor = 0.85 (15% reduction);
    // under moderate ventilation, realize half → 7.5% reduction → 0.925.
    expect(co2StomatalFactor(1200, true, "moderate")).toBeCloseTo(0.925, 3);
    // At 1500 ppm, nominal = 0.82 (18% reduction); half = 9% → 0.91.
    expect(co2StomatalFactor(1500, true, "moderate")).toBeCloseTo(0.91, 3);
  });

  it("sealed and semi_sealed get the full nominal closure", () => {
    expect(co2StomatalFactor(1200, true, "sealed")).toBe(0.85);
    expect(co2StomatalFactor(1200, true, "semi_sealed")).toBe(0.85);
  });
});
