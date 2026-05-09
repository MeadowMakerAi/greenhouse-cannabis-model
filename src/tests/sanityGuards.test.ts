import { describe, expect, it } from "vitest";
import {
  checkLightingDensity,
  checkNetTransmission,
  checkOutdoorDLI,
} from "../models/sanityGuards";

describe("sanityGuards", () => {
  it("flags outdoor DLI > 60 as units bug", () => {
    const flags = checkOutdoorDLI([12, 20, 35, 80]);
    expect(flags).toHaveLength(1);
    expect(flags[0].category).toBe("units");
    expect(flags[0].level).toBe("error");
    expect(flags[0].message).toContain("units bug");
  });

  it("does not flag realistic outdoor DLI", () => {
    const flags = checkOutdoorDLI([12, 20, 35, 50]);
    expect(flags).toHaveLength(0);
  });

  it("flags transmission above 85%", () => {
    const flags = checkNetTransmission(0.92);
    expect(flags).toHaveLength(1);
    expect(flags[0].category).toBe("input");
  });

  it("flags transmission below 25%", () => {
    const flags = checkNetTransmission(0.15);
    expect(flags).toHaveLength(1);
    expect(flags[0].message).toContain("unusually low");
  });

  it("does not flag realistic transmission", () => {
    expect(checkNetTransmission(0.6)).toHaveLength(0);
    expect(checkNetTransmission(0.7)).toHaveLength(0);
  });

  it("flags lighting density above 50 W/ft²", () => {
    const flags = checkLightingDensity(60_000, 1000); // 60 W/ft²
    expect(flags).toHaveLength(1);
    expect(flags[0].category).toBe("derived");
  });

  it("does not flag typical lighting density", () => {
    expect(checkLightingDensity(30_000, 1000)).toHaveLength(0);
  });

  it("returns empty for zero canopy area", () => {
    expect(checkLightingDensity(50_000, 0)).toHaveLength(0);
  });
});
