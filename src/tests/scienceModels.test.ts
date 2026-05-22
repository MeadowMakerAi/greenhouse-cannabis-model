import { describe, expect, it } from "vitest";
import { evaluatePathogenPressure } from "../models/pathogenModel";
import { projectYield } from "../models/yieldModel";
import { evaluateSteering } from "../models/cropSteeringModel";

describe("pathogenModel", () => {
  it("low pressure under dry warm conditions", () => {
    const r = evaluatePathogenPressure({
      meanTempF: 78,
      meanRH: 45,
      dewPointF: 55,
      cropStage: "midFlower",
      isFlowering: true,
    });
    expect(r.botrytisScore).toBeLessThan(20);
    expect(r.powderyMildewScore).toBeLessThan(40);
  });

  it("high botrytis pressure at cool, RH-saturated, dew-point-margin-zero", () => {
    const r = evaluatePathogenPressure({
      meanTempF: 64,
      meanRH: 92,
      dewPointF: 63, // 1 °F margin = condensation territory
      cropStage: "lateFlower",
      isFlowering: true,
    });
    expect(r.botrytisScore).toBeGreaterThan(70);
    expect(r.summary.toLowerCase()).toContain("botrytis");
  });

  it("PM peaks at warm humid 70°F + 70% RH, vegetative", () => {
    const r = evaluatePathogenPressure({
      meanTempF: 73,
      meanRH: 70,
      dewPointF: 60,
      cropStage: "vegetative",
      isFlowering: false,
    });
    expect(r.powderyMildewScore).toBeGreaterThan(55);
  });

  it("late-flower stage multiplier > vegetative stage", () => {
    const base = {
      meanTempF: 67,
      meanRH: 80,
      dewPointF: 60,
      isFlowering: true,
    };
    const veg = evaluatePathogenPressure({ ...base, cropStage: "vegetative", isFlowering: false });
    const late = evaluatePathogenPressure({ ...base, cropStage: "lateFlower" });
    expect(late.botrytisScore).toBeGreaterThan(veg.botrytisScore);
  });
});

describe("yieldModel", () => {
  it("baseline scenario: DLI=40, Topt, ambient CO2, 3 cycles → ~baseline yield", () => {
    const r = projectYield({
      annualDLIMolM2: 40 * 365, // cycle avg DLI 40
      meanFlowerDayTempF: 79,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 3,
      canopyAreaSqFt: 1000,
    });
    // baseline 350 g/m²/cycle × 3 cycles = 1050 g/m²/yr
    expect(r.gramsPerM2PerCycle).toBeCloseTo(350, -1);
    expect(r.dliFactor).toBeCloseTo(1.0, 1);
    expect(r.tempFactor).toBeCloseTo(1.0, 1);
    expect(r.co2Factor).toBeCloseTo(1.0, 1);
  });

  it("CO2 enrichment at 1200 ppm + DLI 40 → ~1.4× yield", () => {
    const r = projectYield({
      annualDLIMolM2: 40 * 365,
      meanFlowerDayTempF: 79,
      co2Ppm: 1200,
      co2Enabled: true,
      cyclesPerYear: 3,
      canopyAreaSqFt: 1000,
    });
    expect(r.co2Factor).toBeCloseTo(1.4, 2);
    expect(r.gramsPerM2PerCycle).toBeCloseTo(350 * 1.4, -1);
  });

  it("Temperature 95°F (way above Topt) drops yield substantially", () => {
    const r = projectYield({
      annualDLIMolM2: 40 * 365,
      meanFlowerDayTempF: 95,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 3,
      canopyAreaSqFt: 1000,
    });
    expect(r.tempFactor).toBeLessThan(0.2);
  });

  it("DLI 5 yields ~12% of baseline", () => {
    const r = projectYield({
      annualDLIMolM2: 5 * 365,
      meanFlowerDayTempF: 79,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 3,
      canopyAreaSqFt: 1000,
    });
    expect(r.dliFactor).toBeCloseTo(5 / 40, 2);
  });

  it("DLI 70 saturates baseline factor", () => {
    const r70 = projectYield({
      annualDLIMolM2: 70 * 365,
      meanFlowerDayTempF: 79,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 3,
      canopyAreaSqFt: 1000,
    });
    const r80 = projectYield({
      annualDLIMolM2: 80 * 365,
      meanFlowerDayTempF: 79,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 3,
      canopyAreaSqFt: 1000,
    });
    // Above 70, slope halves — 80 should be only modestly above 70
    expect(r80.dliFactor).toBeGreaterThan(r70.dliFactor);
    expect(r80.dliFactor / r70.dliFactor).toBeLessThan(80 / 70);
  });

  it("realismFactor scales the projection linearly and defaults to 1.0", () => {
    const base = {
      annualDLIMolM2: 40 * 365,
      meanFlowerDayTempF: 79,
      co2Ppm: 420,
      co2Enabled: false,
      cyclesPerYear: 3,
      canopyAreaSqFt: 1000,
    };
    const dialedIn = projectYield(base); // no realismFactor → defaults to 1.0
    // explicit 1.0 matches the default
    expect(
      projectYield({ ...base, realismFactor: 1 }).gramsPerM2PerCycle,
    ).toBeCloseTo(dialedIn.gramsPerM2PerCycle, 5);
    // a haircut scales the projection by exactly that factor
    expect(
      projectYield({ ...base, realismFactor: 0.7 }).gramsPerM2PerCycle,
    ).toBeCloseTo(dialedIn.gramsPerM2PerCycle * 0.7, 5);
    expect(
      projectYield({ ...base, realismFactor: 0.55 }).totalAnnualKg,
    ).toBeCloseTo(dialedIn.totalAnnualKg * 0.55, 5);
  });
});

describe("cropSteeringModel", () => {
  it("vegetative band centered on lower VPD, smaller D/N differential", () => {
    const r = evaluateSteering({
      phase: "vegetative",
      dayTempF: 78,
      nightTempF: 73,
      rhPct: 65,
      vpdKPa: 0.9,
    });
    expect(r.alignmentScore).toBe(100);
  });

  it("late-flower in vegetative settings flags night-temp + VPD as off", () => {
    const r = evaluateSteering({
      phase: "lateFlower",
      dayTempF: 78,
      nightTempF: 73, // too warm for late flower
      rhPct: 65, // too high for late flower
      vpdKPa: 0.9, // too low for late flower
    });
    expect(r.alignmentScore).toBeLessThan(60);
    expect(r.axes.nightTemp.status).toBe("high");
    expect(r.axes.rh.status).toBe("high");
    expect(r.axes.vpd.status).toBe("low");
  });

  it("late-flower with proper night drop + low RH + high VPD aligns", () => {
    const r = evaluateSteering({
      phase: "lateFlower",
      dayTempF: 75,
      nightTempF: 65,
      rhPct: 50,
      vpdKPa: 1.5,
    });
    expect(r.alignmentScore).toBeGreaterThanOrEqual(80);
  });
});
