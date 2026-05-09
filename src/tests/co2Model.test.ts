import { describe, expect, it } from "vitest";
import { evaluateCO2 } from "../models/co2Model";

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
