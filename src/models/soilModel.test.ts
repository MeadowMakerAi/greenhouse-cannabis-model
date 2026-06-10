import { describe, it, expect } from "vitest";
import { decodeSoilGrids, usdaTextureClass, finiteOrNull } from "./soilModel";

describe("finiteOrNull — external-value trust guard", () => {
  it("passes a finite value through", () => {
    expect(finiteOrNull(0.103)).toBe(0.103);
  });
  it("rejects NaN / Infinity / null / undefined", () => {
    expect(finiteOrNull(NaN)).toBeNull();
    expect(finiteOrNull(Infinity)).toBeNull();
    expect(finiteOrNull(null)).toBeNull();
    expect(finiteOrNull(undefined)).toBeNull();
  });
  it("rejects out-of-range (moisture clamp [0,1])", () => {
    expect(finiteOrNull(1.4, 0, 1)).toBeNull();
    expect(finiteOrNull(-0.2, 0, 1)).toBeNull();
    expect(finiteOrNull(0.42, 0, 1)).toBe(0.42);
  });
});

describe("decodeSoilGrids — the unit-trap guard", () => {
  it("decodes pH×10 to real pH", () => {
    // SoilGrids returned mapped 51 for the Montgomery coords (verified live).
    expect(decodeSoilGrids(51, 10)).toBeCloseTo(5.1, 5);
  });

  it("decodes bulk density (cg/cm³, d_factor 100) to kg/dm³", () => {
    expect(decodeSoilGrids(142, 100)).toBeCloseTo(1.42, 5);
  });

  it("clay mapped 225 / d_factor 10 = 22.5 — already %, NOT g/kg (unit-trap regression)", () => {
    // SoilGrids target_units for sand/silt/clay is "%" (verified live). The
    // decode IS the percent; do not divide by 10 again (would give 2.25%).
    expect(decodeSoilGrids(225, 10)).toBeCloseTo(22.5, 5);
  });

  it("is NaN on a zero factor rather than dividing by zero", () => {
    expect(Number.isNaN(decodeSoilGrids(51, 0))).toBe(true);
  });

  it("is NaN on non-finite input", () => {
    expect(Number.isNaN(decodeSoilGrids(NaN, 10))).toBe(true);
  });
});

describe("usdaTextureClass — all 12 triangle corners", () => {
  const cases: Array<[string, [number, number, number], string]> = [
    // [name, [sand, silt, clay], expected]
    ["sand", [100, 0, 0], "sand"],
    ["loamy sand", [85, 10, 5], "loamy sand"],
    ["sandy loam", [65, 25, 10], "sandy loam"],
    ["loam", [40, 40, 20], "loam"],
    ["silt loam", [20, 65, 15], "silt loam"],
    ["silt", [10, 85, 5], "silt"],
    ["sandy clay loam", [60, 12, 28], "sandy clay loam"],
    ["clay loam", [33, 34, 33], "clay loam"],
    ["silty clay loam", [10, 57, 33], "silty clay loam"],
    ["sandy clay", [52, 6, 42], "sandy clay"],
    ["silty clay", [6, 48, 46], "silty clay"],
    ["clay", [20, 20, 60], "clay"],
  ];

  for (const [name, [sand, silt, clay], expected] of cases) {
    it(`${name} → ${expected}`, () => {
      expect(usdaTextureClass(sand, silt, clay)).toBe(expected);
    });
  }

  it("renormalises fractions that don't sum to 100 (SoilGrids rounding)", () => {
    // 392/410/198 g/kg → ~39/41/20 %, still a loam.
    expect(usdaTextureClass(39.2, 41.0, 19.8)).toBe("loam");
  });

  it("returns null on non-finite or empty input", () => {
    expect(usdaTextureClass(NaN, 40, 20)).toBeNull();
    expect(usdaTextureClass(0, 0, 0)).toBeNull();
  });
});
