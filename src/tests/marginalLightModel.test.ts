import { describe, expect, it } from "vitest";
import { marginalLightEconomics } from "../models/marginalLightModel";

const baseInput = {
  annualDLIMolM2: 40 * 365,
  canopyAreaSqFt: 1000,
  fixtureEfficacy: 2.7,
  electricityRatePerKwh: 0.16,
  yieldArgs: {
    meanFlowerDayTempF: 79,
    co2Ppm: 420,
    co2Enabled: false,
    cyclesPerYear: 3,
    canopyAreaSqFt: 1000,
  },
  deltaDLISteps: [5, 10, 15],
};

describe("marginalLightModel", () => {
  it("returns one step per requested DLI increment", () => {
    const steps = marginalLightEconomics(baseInput);
    expect(steps).toHaveLength(3);
    expect(steps.map((s) => s.deltaDLI)).toEqual([5, 10, 15]);
  });

  it("more light buys more grams, monotonically", () => {
    const [s5, s10, s15] = marginalLightEconomics(baseInput);
    expect(s5.extraGrams).toBeGreaterThan(0);
    expect(s10.extraGrams).toBeGreaterThan(s5.extraGrams);
    expect(s15.extraGrams).toBeGreaterThan(s10.extraGrams);
  });

  it("in the linear yield regime, cost per extra gram is ~constant", () => {
    // base cycle-avg DLI 40, +15 → 55, all below the DLI-70 saturation knee
    const [s5, , s15] = marginalLightEconomics(baseInput);
    expect(s5.costPerExtraGram).toBeGreaterThan(0);
    expect(s15.costPerExtraGram).toBeCloseTo(s5.costPerExtraGram, 4);
  });

  it("zero fixture efficacy yields zero added energy and cost", () => {
    const steps = marginalLightEconomics({ ...baseInput, fixtureEfficacy: 0 });
    for (const s of steps) {
      expect(s.extraKwh).toBe(0);
      expect(s.extraCost).toBe(0);
      expect(s.costPerExtraGram).toBe(0);
    }
  });

  it("realism haircut raises cost per extra gram (fewer grams, same power)", () => {
    const dialedIn = marginalLightEconomics({
      ...baseInput,
      yieldArgs: { ...baseInput.yieldArgs, realismFactor: 1 },
    })[0];
    const conservative = marginalLightEconomics({
      ...baseInput,
      yieldArgs: { ...baseInput.yieldArgs, realismFactor: 0.55 },
    })[0];
    expect(conservative.extraCost).toBeCloseTo(dialedIn.extraCost, 5);
    expect(conservative.extraGrams).toBeLessThan(dialedIn.extraGrams);
    expect(conservative.costPerExtraGram).toBeGreaterThan(
      dialedIn.costPerExtraGram,
    );
  });
});
