import { describe, it, expect } from "vitest";
import {
  assessCompleteness,
  recommendLighting,
  canopyUtilizationPct,
  type AdvisorScenario,
  type AdvisorDefaults,
} from "../services/scenarioAdvisor";
import { ppfdToDLI } from "../models/dliModel";
import type { FixtureSpec } from "../models/fixtureModel";

const DEFAULTS: AdvisorDefaults = {
  latitude: 41.475384,
  longitude: -74.244553,
  greenhouseLengthFt: 48,
  greenhouseWidthFt: 32,
  eaveHeightFt: 8,
  peakHeightFt: 14,
  envelopeBaseTransmissionPct: 80,
  fixtureId: "ledHighEfficiency",
  serviceVoltagePrimary: 240,
  branchCircuitAmps: 20,
  electricityRatePerKwh: 0.16,
};

const ALL_DEFAULT: AdvisorScenario = {
  latitude: DEFAULTS.latitude,
  longitude: DEFAULTS.longitude,
  greenhouseLengthFt: 48,
  greenhouseWidthFt: 32,
  eaveHeightFt: 8,
  peakHeightFt: 14,
  canopyAreaSqFt: 1200,
  envelopeBaseTransmissionPct: 80,
  fixtureId: "ledHighEfficiency",
  fixtureType: "LED",
  flowerPhotoperiodHours: 12,
  co2Enabled: false,
  ventilationMode: "low",
  radiantHeatingEnabled: false,
  thermalScreenEnabled: false,
  mechanicalCoolingEnabled: false,
  serviceVoltagePrimary: 240,
  branchCircuitAmps: 20,
  electricityRatePerKwh: 0.16,
};

const LED: FixtureSpec = {
  id: "testLed",
  label: "Test LED 700",
  type: "LED",
  ppe: 3.0,
  opticalUtilization: 0.85,
  dimmable: true,
  radiantFraction: 0.32,
  convectiveFraction: 0.68,
  wattsPerFixture: 700,
  minVoltage: 120,
  maxVoltage: 277,
  source: "preset",
};

describe("assessCompleteness", () => {
  it("reports an all-default scenario as mostly missing", () => {
    const r = assessCompleteness(ALL_DEFAULT, DEFAULTS);
    expect(r.have).toHaveLength(0);
    // location, dims, glazing, fixtures, electrical, rate + 2 equipment gaps
    expect(r.missing.length).toBeGreaterThanOrEqual(6);
    expect(r.missing.join(" ")).toMatch(/light fixtures/);
    expect(r.conflicts).toHaveLength(0);
  });

  it("moves spec-established fields to have[]", () => {
    const r = assessCompleteness(
      {
        ...ALL_DEFAULT,
        greenhouseLengthFt: 120,
        greenhouseWidthFt: 60,
        envelopeBaseTransmissionPct: 70, // double-poly from a spec
        fixtureId: "gavitaRS1900eLED",
      },
      DEFAULTS,
    );
    expect(r.have.join(" ")).toMatch(/dimensions/);
    expect(r.have.join(" ")).toMatch(/glazing/);
    expect(r.have.join(" ")).toMatch(/fixtures/);
    expect(r.missing.join(" ")).not.toMatch(/dimensions/);
  });

  it("flags CO2 with open vents, HPS on 120V, and no-screen cold-climate heating", () => {
    const r = assessCompleteness(
      {
        ...ALL_DEFAULT,
        co2Enabled: true,
        ventilationMode: "open_vented",
        fixtureType: "HPS",
        serviceVoltagePrimary: 120,
        radiantHeatingEnabled: true,
        thermalScreenEnabled: false,
      },
      DEFAULTS,
    );
    expect(r.conflicts).toHaveLength(3);
    expect(r.conflicts.join(" ")).toMatch(/CO₂/);
    expect(r.conflicts.join(" ")).toMatch(/HPS/);
    expect(r.conflicts.join(" ")).toMatch(/thermal screen/);
  });

  it("does not flag CO2 when sealed", () => {
    const r = assessCompleteness(
      { ...ALL_DEFAULT, co2Enabled: true, ventilationMode: "sealed" },
      DEFAULTS,
    );
    expect(r.conflicts).toHaveLength(0);
  });
});

describe("canopyUtilizationPct", () => {
  it("computes canopy as a percentage of floor", () => {
    expect(canopyUtilizationPct(5625, 10800)).toBeCloseTo(52.08, 1);
    expect(canopyUtilizationPct(1200, 1536)).toBeCloseTo(78.1, 1);
  });
  it("returns 0 for a nonpositive floor (no divide-by-zero)", () => {
    expect(canopyUtilizationPct(1200, 0)).toBe(0);
  });
});

describe("assessCompleteness — floor-utilization optimization", () => {
  // 120 × 90 = 10,800 ft² floor. 5,625 canopy = 52% → below the 80% flag.
  // This is the exact case that prompted the feature: a rolling-bench spec
  // whose canopy was lowballed to ~half the floor.
  const BENCHED: AdvisorScenario = {
    ...ALL_DEFAULT,
    greenhouseLengthFt: 120,
    greenhouseWidthFt: 90,
    canopyAreaSqFt: 5625,
  };

  it("flags sub-80% floor utilization as optimization + quantifies headroom", () => {
    const r = assessCompleteness(BENCHED, DEFAULTS);
    expect(r.optimizations).toHaveLength(1);
    const msg = r.optimizations[0];
    expect(msg).toMatch(/52% of floor/);
    // headroom to the ~90% rolling ceiling: 10,800 × 0.9 − 5,625 = 4,095 ft²
    expect(msg).toMatch(/4095 ft²/);
    expect(msg).toMatch(/rolling/i);
  });

  it("does not flag when utilization already meets the 80% band", () => {
    const r = assessCompleteness({ ...BENCHED, canopyAreaSqFt: 9720 }, DEFAULTS); // 90%
    expect(r.optimizations).toHaveLength(0);
  });

  it("fires just below 80% and clears exactly at it", () => {
    const floor = 120 * 90; // 10,800
    const below = assessCompleteness(
      { ...BENCHED, canopyAreaSqFt: Math.round(floor * 0.79) },
      DEFAULTS,
    );
    const at = assessCompleteness(
      { ...BENCHED, canopyAreaSqFt: Math.round(floor * 0.8) },
      DEFAULTS,
    );
    expect(below.optimizations).toHaveLength(1);
    expect(at.optimizations).toHaveLength(0);
  });
});

describe("recommendLighting", () => {
  const args = {
    photoperiodHours: 12,
    canopyAreaSqFt: 1200,
    electricityRatePerKwh: 0.16,
    // Montgomery-shaped seasonal curve: winter ~5, summer ~25 mol/m²/d inside.
    monthlyFlowerWindowDLI: [5, 8, 12, 17, 21, 24, 25, 22, 17, 11, 6, 4],
    fixtures: [LED],
  };

  it("errors without a target", () => {
    expect(recommendLighting({ ...args })).toHaveProperty("error");
  });

  it("sizes to the worst solar month (geography-aware), PPFD 1000 → DLI 43.2 @ 12h", () => {
    const r = recommendLighting({ ...args, targetPPFD: 1000 });
    if ("error" in r) throw new Error(r.error);
    // ppfdToDLI(1000,12) = 43.2 (grow-core-verified conversion)
    expect(r.targetDLI).toBeCloseTo(ppfdToDLI(1000, 12), 1);
    // December (index 11, DLI 4) has the biggest gap.
    expect(r.sizingMonthIndex).toBe(11);
    expect(r.worstMonthSupplementalDLI).toBeCloseTo(43.2 - 4, 1);
    const opt = r.options[0];
    // Cross-check the count against the grow-core formula by hand:
    // flux = supplementalPPFD × canopy_m²; watts = flux/(ppe×util); count = ceil(watts/700)
    const canopyM2 = 1200 * 0.09290304;
    const supPPFD = r.worstMonthSupplementalPPFD;
    const expectWatts = (supPPFD * canopyM2) / (3.0 * 0.85);
    expect(opt.fixtureCount).toBe(Math.ceil(expectWatts / 700));
    expect(opt.operatingKW).toBeGreaterThan(0);
    // Hardware kW = whole fixtures × nameplate; ≥ operating (dimmed) kW.
    expect(opt.installedHardwareKW).toBeCloseTo((opt.fixtureCount * 700) / 1000, 1);
    expect(opt.installedHardwareKW).toBeGreaterThanOrEqual(opt.operatingKW - 0.05);
    // Heat comes from grow-core's lightingHeatBTUhr (kW→BTU/hr conversion of
    // the operating point). Display rounding → allow slack.
    expect(Math.abs(opt.addedHeatBTUhr - opt.operatingKW * 3412.142)).toBeLessThan(400);
    expect(opt.addedCoolingTons).toBeCloseTo(opt.addedHeatBTUhr / 12000, 0);
  });

  it("rejects inconsistent PPFD+DLI pairs, accepts consistent ones", () => {
    // 1000 PPFD @ 12h implies DLI 43.2 — DLI 30 contradicts it.
    expect(
      recommendLighting({ ...args, targetPPFD: 1000, targetDLI: 30 }),
    ).toHaveProperty("error");
    // Consistent pair (within 10%) works, PPFD canonical.
    const ok = recommendLighting({ ...args, targetPPFD: 1000, targetDLI: 43 });
    if ("error" in ok) throw new Error(ok.error);
    expect(ok.targetPPFD).toBe(1000);
  });

  it("accepts targetDLI directly and returns a smaller system for a lower target", () => {
    const hi = recommendLighting({ ...args, targetDLI: 45 });
    const lo = recommendLighting({ ...args, targetDLI: 25 });
    if ("error" in hi || "error" in lo) throw new Error("unexpected error");
    expect(lo.options[0].fixtureCount).toBeLessThan(hi.options[0].fixtureCount);
  });

  it("rejects nonpositive geometry", () => {
    expect(
      recommendLighting({ ...args, targetPPFD: 1000, canopyAreaSqFt: 0 }),
    ).toHaveProperty("error");
  });
});

