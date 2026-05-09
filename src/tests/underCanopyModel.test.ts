import { describe, expect, it } from "vitest";
import { computeUnderCanopy } from "../models/underCanopyModel";

const baseInput = {
  enabled: true,
  underCanopyPPFD: 150,
  underCanopyPhotoperiodHours: 12,
  underCanopyPPE: 2.6,
  underCanopyOpticalUtilization: 0.92,
  underCanopyCoveragePct: 80,
  underCanopyHeatFractionToCanopyZone: 0.85,
  canopyAreaSqFt: 1000,
  electricityRatePerKwh: 0.16,
  daysInMonth: 30,
  topCanopyDLI: 40,
};

describe("underCanopyModel", () => {
  it("disabled returns zeros", () => {
    const r = computeUnderCanopy({ ...baseInput, enabled: false });
    expect(r.underCanopyDLI).toBe(0);
    expect(r.wholePlantDLIUplift).toBe(0);
    expect(r.underCanopyKW).toBe(0);
  });

  it("lower-canopy DLI is real photon flux: 150 µmol/m²/s × 12h ≈ 6.48 mol/m²/d", () => {
    const r = computeUnderCanopy(baseInput);
    expect(r.underCanopyDLI).toBeCloseTo(6.48, 2);
  });

  it("whole-plant DLI uplift is coverage-weighted lower-canopy DLI", () => {
    const r = computeUnderCanopy(baseInput);
    expect(r.wholePlantDLIUplift).toBeCloseTo(6.48 * 0.8, 2);
  });

  it("whole-plant DLI uplift fraction is uplift / topCanopyDLI", () => {
    const r = computeUnderCanopy(baseInput);
    expect(r.wholePlantDLIUpliftFraction).toBeCloseTo((6.48 * 0.8) / 40, 2);
  });

  it("uplift fraction is zero when top-canopy DLI is zero", () => {
    const r = computeUnderCanopy({ ...baseInput, topCanopyDLI: 0 });
    expect(r.wholePlantDLIUpliftFraction).toBe(0);
  });

  it("photon flux scales linearly with canopy area at fixed coverage", () => {
    const small = computeUnderCanopy({ ...baseInput, canopyAreaSqFt: 500 });
    const big = computeUnderCanopy({ ...baseInput, canopyAreaSqFt: 1000 });
    expect(big.underCanopyPhotonFlux_umol_s / small.underCanopyPhotonFlux_umol_s).toBeCloseTo(2, 2);
  });

  it("kW scales with photon flux divided by PPE × utilization", () => {
    const r = computeUnderCanopy(baseInput);
    const expectedKW =
      r.underCanopyPhotonFlux_umol_s / (baseInput.underCanopyPPE * baseInput.underCanopyOpticalUtilization) / 1000;
    expect(r.underCanopyKW).toBeCloseTo(expectedKW, 4);
  });

  it("PPFD doubles → DLI doubles → uplift doubles", () => {
    const a = computeUnderCanopy(baseInput);
    const b = computeUnderCanopy({ ...baseInput, underCanopyPPFD: 300 });
    expect(b.underCanopyDLI / a.underCanopyDLI).toBeCloseTo(2, 4);
    expect(b.wholePlantDLIUplift / a.wholePlantDLIUplift).toBeCloseTo(2, 4);
  });

  it("zero coverage zeroes whole-plant uplift but keeps zonal DLI nonzero", () => {
    const r = computeUnderCanopy({ ...baseInput, underCanopyCoveragePct: 0 });
    expect(r.wholePlantDLIUplift).toBe(0);
    expect(r.underCanopyDLI).toBeCloseTo(6.48, 2);
    expect(r.underCanopyKW).toBe(0);
  });
});
