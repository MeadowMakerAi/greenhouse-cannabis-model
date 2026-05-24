import { describe, expect, it } from "vitest";
import {
  dliFactor,
  inverseDLIFactor,
  projectYield,
} from "../models/yieldModel";

/**
 * Regression tests for the `dliFactor` / `inverseDLIFactor` helpers
 * extracted from projectYield. The DLI band tile uses inverseDLIFactor
 * to compute the ambient-CO₂ DLI that produces the same yield as a
 * given elevated-CO₂ target. Without proper handling of the DLI 70
 * piecewise kink, the naive `target × co2Mult` math drifts above 70.
 */
describe("dliFactor (piecewise yield-multiplier curve)", () => {
  it("is linear at slope 1/40 below the DLI 70 kink", () => {
    expect(dliFactor(0)).toBe(0);
    expect(dliFactor(40)).toBeCloseTo(1.0, 6);
    expect(dliFactor(50)).toBeCloseTo(1.25, 6);
    expect(dliFactor(70)).toBeCloseTo(1.75, 6);
  });

  it("uses half-slope (1/80) above DLI 70", () => {
    // At DLI 70: factor = 1.75; at DLI 90: +20 DLI × (1/80) = +0.25 → 2.0
    expect(dliFactor(90)).toBeCloseTo(2.0, 6);
    // At DLI 110: +40 above kink × (1/80) = +0.5 → 2.25
    expect(dliFactor(110)).toBeCloseTo(2.25, 6);
  });

  it("clamps negative input to 0 (no negative yield)", () => {
    expect(dliFactor(-10)).toBe(0);
  });
});

describe("inverseDLIFactor (yield-factor → ambient-DLI)", () => {
  it("inverts dliFactor exactly on the linear branch", () => {
    for (const dli of [0, 10, 25, 40, 60, 70]) {
      expect(inverseDLIFactor(dliFactor(dli))).toBeCloseTo(dli, 6);
    }
  });

  it("inverts dliFactor exactly on the diminishing-returns branch", () => {
    for (const dli of [75, 80, 90, 110, 150]) {
      expect(inverseDLIFactor(dliFactor(dli))).toBeCloseTo(dli, 6);
    }
  });

  it("returns 0 for zero or negative yield factor", () => {
    expect(inverseDLIFactor(0)).toBe(0);
    expect(inverseDLIFactor(-1)).toBe(0);
  });

  it("at the DLI 70 kink, inverse is continuous", () => {
    // Both branches must agree at the kink (yield factor = 1.75)
    expect(inverseDLIFactor(1.75)).toBeCloseTo(70, 6);
  });

  it("CO₂ yield-equivalent example — 50 DLI × 1.4 = yield equivalent at ambient", () => {
    // At target=50 DLI ambient: factor = 1.25.
    // With co2Mult=1.4: equiv yield factor = 1.75 → ambient DLI = 70.
    // This is the "50 @ 1200ppm → 70 @ ambient" example from the tile.
    const equivYieldFactor = dliFactor(50) * 1.4;
    expect(inverseDLIFactor(equivYieldFactor)).toBeCloseTo(70, 6);
  });

  it("CO₂ yield-equivalent — high-end case correctly traverses the kink", () => {
    // Target=50 DLI, co2Mult=1.45 → equiv yield factor = 1.8125.
    // 1.8125 > 1.75 (kink) → ambient DLI = 70 + (1.8125 - 1.75) × 80 = 75.
    // Naive `target × co2Mult` would give 72.5 — wrong by ~2.5 DLI.
    const equivYieldFactor = dliFactor(50) * 1.45;
    expect(inverseDLIFactor(equivYieldFactor)).toBeCloseTo(75, 6);
  });
});

describe("projectYield delegation to dliFactor (no drift)", () => {
  it("projectYield's reported dliFactor matches the standalone function", () => {
    const baseInputs = {
      annualDLIMolM2: 40 * 365, // cycleAvgDLI = 40
      meanFlowerDayTempF: 79,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 4,
      canopyAreaSqFt: 1000,
    };
    const out = projectYield(baseInputs);
    expect(out.dliFactor).toBeCloseTo(dliFactor(40), 6);
  });

  it("projectYield agrees with dliFactor on the diminishing-returns branch", () => {
    const out = projectYield({
      annualDLIMolM2: 90 * 365, // cycleAvgDLI = 90, above kink
      meanFlowerDayTempF: 79,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 4,
      canopyAreaSqFt: 1000,
    });
    expect(out.dliFactor).toBeCloseTo(dliFactor(90), 6);
  });
});
