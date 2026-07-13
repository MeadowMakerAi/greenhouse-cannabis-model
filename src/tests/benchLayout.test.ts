import { describe, it, expect } from "vitest";
import { solveBenchLayout, type BenchSpec } from "../models/benchLayout";

const ROLLING: BenchSpec = {
  type: "rolling",
  benchWidthFt: 5,
  benchLengthFt: 40,
  aisleWidthFt: 3,
  perimeterFt: 2,
};

describe("solveBenchLayout", () => {
  it("packs rolling benches tight (one shared aisle) → high utilization", () => {
    // Huifa 120×90 anchor case.
    const r = solveBenchLayout(120, 90, ROLLING);
    // usableWidth 86, one aisle reserved: floor((86−3)/5) = 16 rows
    expect(r.rows).toBe(16);
    // rowLength = 120 − 4 = 116; canopy = 16 × 116 × 5 = 9,280
    expect(r.canopyAreaSqFt).toBe(9280);
    // 9,280 / 10,800 ≈ 86% — the >80% rolling benches are supposed to hit.
    expect(r.utilizationPct).toBeCloseTo(85.9, 1);
    expect(r.utilizationPct).toBeGreaterThan(80);
    expect(r.benchesPerRow).toBe(Math.ceil(116 / 40)); // 3
    expect(r.benchCount).toBe(16 * 3);
  });

  it("fixed benches (aisle per row) fit fewer rows → lower utilization", () => {
    const fixed = solveBenchLayout(120, 90, { ...ROLLING, type: "fixed" });
    // floor((86+3)/(5+3)) = 11 rows
    expect(fixed.rows).toBe(11);
    expect(fixed.canopyAreaSqFt).toBe(11 * 116 * 5); // 6,380
    expect(fixed.utilizationPct).toBeCloseTo(59.1, 1);
    // Same house + bench, rolling reclaims the inter-row aisles → more canopy.
    const rolling = solveBenchLayout(120, 90, ROLLING);
    expect(rolling.canopyAreaSqFt).toBeGreaterThan(fixed.canopyAreaSqFt);
  });

  it("emits one continuous rect per row with the right pitch", () => {
    const r = solveBenchLayout(120, 90, ROLLING);
    expect(r.rowRects).toHaveLength(r.rows);
    for (const rect of r.rowRects) {
      expect(rect.hFt).toBe(5); // bench width
      expect(rect.wFt).toBe(116); // usable length
      expect(rect.xFt).toBe(2); // perimeter
    }
    // rolling pitch = benchWidth (tight); rows abut.
    expect(r.rowRects[1].yFt - r.rowRects[0].yFt).toBe(5);
    // fixed pitch = benchWidth + aisle.
    const fixed = solveBenchLayout(120, 90, { ...ROLLING, type: "fixed" });
    expect(fixed.rowRects[1].yFt - fixed.rowRects[0].yFt).toBe(8);
  });

  it("returns an empty layout when benches can't fit (no fabricated canopy)", () => {
    const tiny = solveBenchLayout(3, 3, ROLLING); // smaller than one bench + perimeter
    expect(tiny.rows).toBe(0);
    expect(tiny.benchCount).toBe(0);
    expect(tiny.canopyAreaSqFt).toBe(0);
    expect(tiny.utilizationPct).toBe(0);
    expect(tiny.rowRects).toHaveLength(0);
  });
});
