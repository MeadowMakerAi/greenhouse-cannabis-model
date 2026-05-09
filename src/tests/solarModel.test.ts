import { describe, expect, it } from "vitest";
import { computeMonthlySolar, monthInRange, netCanopyTransmissionPct } from "../models/solarModel";
import { fallbackMontgomeryClimate } from "../data/fallbackMontgomeryClimate";
import { defaultEnvelope } from "../data/greenhouseDefaults";

describe("solarModel", () => {
  it("netCanopyTransmissionPct yields a fraction <1 with default envelope", () => {
    const t = netCanopyTransmissionPct(defaultEnvelope);
    expect(t).toBeGreaterThan(0.4);
    expect(t).toBeLessThan(0.85);
  });

  it("monthInRange handles wrapping", () => {
    expect(monthInRange(0, 11, 1)).toBe(true);
    expect(monthInRange(5, 11, 1)).toBe(false);
  });

  it("computeMonthlySolar returns 12 months", () => {
    const out = computeMonthlySolar(fallbackMontgomeryClimate, {
      envelope: defaultEnvelope,
      shadeEnabled: false,
      shadeTransmissionPct: 70,
      shadeStartMonth: 5,
      shadeEndMonth: 8,
      latitudeDeg: 41.5,
      flowerWindowStartHr: 7,
      flowerWindowEndHr: 19,
      solarToPARFactor: 7.35,
    });
    expect(out).toHaveLength(12);
    out.forEach((m) => {
      expect(m.greenhouseDLI).toBeLessThan(m.outdoorDLI);
    });
  });

  it("shade reduces shaded GH DLI in summer months", () => {
    const out = computeMonthlySolar(fallbackMontgomeryClimate, {
      envelope: defaultEnvelope,
      shadeEnabled: true,
      shadeTransmissionPct: 70,
      shadeStartMonth: 5,
      shadeEndMonth: 8,
      latitudeDeg: 41.5,
      flowerWindowStartHr: 7,
      flowerWindowEndHr: 19,
      solarToPARFactor: 7.35,
    });
    expect(out[6].shadedGreenhouseDLI).toBeLessThan(out[6].greenhouseDLI);
    expect(out[0].shadedGreenhouseDLI).toBeCloseTo(out[0].greenhouseDLI, 4);
  });
});
