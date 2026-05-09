import { describe, expect, it } from "vitest";
import { evapSupplyTemp, evaluateEvap } from "../models/evapCoolingModel";

describe("evapCoolingModel", () => {
  it("75% efficient evap takes 95°F dry / 75°F wet to 80°F", () => {
    expect(evapSupplyTemp(95, 75, 75)).toBeCloseTo(80, 1);
  });

  it("100% efficient evap reaches wet-bulb", () => {
    expect(evapSupplyTemp(95, 75, 100)).toBe(75);
  });

  it("0% efficient evap returns dry-bulb", () => {
    expect(evapSupplyTemp(95, 75, 0)).toBe(95);
  });

  it("flags inability to reach target indoor temp", () => {
    const r = evaluateEvap({
      enabled: true,
      efficiencyPct: 75,
      outdoorDryBulbF: 95,
      outdoorWetBulbF: 78,
      outdoorDewPointF: 70,
      indoorTargetDryBulbF: 78,
      cropStage: "midFlower",
    });
    expect(r.reachesTarget).toBe(false);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("high dew point triggers humidity warning", () => {
    const r = evaluateEvap({
      enabled: true,
      efficiencyPct: 75,
      outdoorDryBulbF: 90,
      outdoorWetBulbF: 75,
      outdoorDewPointF: 72,
      indoorTargetDryBulbF: 78,
      cropStage: "lateFlower",
    });
    expect(r.warnings.some((w) => w.includes("dew point"))).toBe(true);
  });
});
