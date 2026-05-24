import { describe, expect, it } from "vitest";
import {
  DLI_BANDS,
  INDOOR_QUALITY_FLOOR,
  LEAF_SATURATION,
  YIELD_CEILING,
  classifyDLI,
} from "../models/dliTargets";
import { ppfdToDLI } from "../models/dliModel";

describe("DLI thresholds (literature-anchored)", () => {
  it("floor matches Llewellyn 2022 — 1000 PPFD at 12h → ~43.2 mol/m²/d", () => {
    expect(INDOOR_QUALITY_FLOOR.ppfdAt12h).toBe(1000);
    expect(INDOOR_QUALITY_FLOOR.dli).toBeCloseTo(ppfdToDLI(1000, 12), 1);
  });

  it("leaf-saturation matches Chandra 2008 — 1500 PPFD at 12h → ~64.8 mol/m²/d", () => {
    expect(LEAF_SATURATION.ppfdAt12h).toBe(1500);
    expect(LEAF_SATURATION.dli).toBeCloseTo(ppfdToDLI(1500, 12), 1);
  });

  it("ceiling matches Rodriguez-Morrison 2021 — 1800 PPFD at 12h → ~77.8 mol/m²/d", () => {
    expect(YIELD_CEILING.ppfdAt12h).toBe(1800);
    expect(YIELD_CEILING.dli).toBeCloseTo(ppfdToDLI(1800, 12), 1);
  });

  it("bands are strictly monotonically increasing", () => {
    for (let i = 1; i < DLI_BANDS.length; i++) {
      expect(DLI_BANDS[i].dli).toBeGreaterThan(DLI_BANDS[i - 1].dli);
      expect(DLI_BANDS[i].ppfdAt12h).toBeGreaterThan(
        DLI_BANDS[i - 1].ppfdAt12h,
      );
    }
  });

  it("every band carries a non-empty source string (zero-fabrication contract)", () => {
    for (const band of DLI_BANDS) {
      expect(band.source.length).toBeGreaterThan(0);
      expect(band.source).toMatch(/\d{4}/); // contains a year
    }
  });
});

describe("classifyDLI", () => {
  it("classifies below-floor for values under the indoor-quality floor", () => {
    expect(classifyDLI(20)).toBe("below-floor");
    expect(classifyDLI(40)).toBe("below-floor"); // < 43.2
  });

  it("classifies in-floor-band for floor → leaf-saturation", () => {
    expect(classifyDLI(50)).toBe("in-floor-band");
    expect(classifyDLI(60)).toBe("in-floor-band"); // < 64.8
  });

  it("classifies in-optimal-band for leaf-saturation → ceiling", () => {
    expect(classifyDLI(65)).toBe("in-optimal-band"); // > 64.8
    expect(classifyDLI(75)).toBe("in-optimal-band"); // < 77.8
  });

  it("classifies in-ceiling-band within ±5% of ceiling", () => {
    expect(classifyDLI(78)).toBe("in-ceiling-band");
    expect(classifyDLI(80)).toBe("in-ceiling-band");
  });

  it("classifies above-ceiling beyond the ±5% ceiling tolerance", () => {
    // 77.8 × 1.05 = 81.69 — anything > 81.69 is above-ceiling.
    expect(classifyDLI(81.7)).toBe("above-ceiling");
    expect(classifyDLI(82)).toBe("above-ceiling");
    expect(classifyDLI(100)).toBe("above-ceiling");
  });

  it("handles exact threshold values with `<` semantics", () => {
    // Boundary regression: floor = 43.2 is NOT below-floor (it's
    // exactly the floor, which counts as in-floor-band). Same logic at
    // the other boundaries — `<` excludes the upper bound from the
    // lower band.
    expect(classifyDLI(43.2)).toBe("in-floor-band");
    expect(classifyDLI(64.8)).toBe("in-optimal-band");
    expect(classifyDLI(77.8)).toBe("in-ceiling-band");
    // Exact ceiling tolerance edge: 77.8 × 1.05 = 81.69 is still
    // in-ceiling-band (≤ check); 81.69 + ε would push above-ceiling.
    expect(classifyDLI(81.69)).toBe("in-ceiling-band");
  });
});
