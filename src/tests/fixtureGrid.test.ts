import { describe, it, expect } from "vitest";
import { solveFixtureGrid, STRIP_ASPECT } from "../models/fixtureGrid";

/** Square spacing the app actually feeds the solver: √(canopyArea / count). */
const spacing = (L: number, W: number, n: number) => Math.sqrt((L * W) / n);

describe("solveFixtureGrid", () => {
  it("returns nothing for zero fixtures and a single cell for one", () => {
    expect(solveFixtureGrid({ fixtureCount: 0, canopyLengthFt: 48, canopyWidthFt: 32, gridSpacingFt: 5 })).toEqual({ rows: 0, cols: 0 });
    expect(solveFixtureGrid({ fixtureCount: 1, canopyLengthFt: 48, canopyWidthFt: 32, gridSpacingFt: 11 })).toEqual({ rows: 1, cols: 1 });
  });

  it("tiles a square-ish canopy as a balanced grid (48×32, 12 fixtures → 3×4)", () => {
    const g = solveFixtureGrid({ fixtureCount: 12, canopyLengthFt: 48, canopyWidthFt: 32, gridSpacingFt: spacing(48, 32, 12) });
    expect(g.rows).toBe(3);
    expect(g.cols).toBe(4);
  });

  it("REGRESSION: never collapses a non-strip canopy to a single row (48×16, 6 fixtures)", () => {
    // Pre-fix this rendered 1×4 — a single file of lights, which is never right.
    const g = solveFixtureGrid({ fixtureCount: 6, canopyLengthFt: 48, canopyWidthFt: 16, gridSpacingFt: spacing(48, 16, 6) });
    expect(g.rows).toBeGreaterThanOrEqual(2);
    expect(g.cols).toBeGreaterThanOrEqual(2);
  });

  it("still allows a single file when the canopy genuinely is a long strip (96×16)", () => {
    const aspect = 96 / 16; // 6:1 ≥ STRIP_ASPECT
    expect(aspect).toBeGreaterThanOrEqual(STRIP_ASPECT);
    const g = solveFixtureGrid({ fixtureCount: 8, canopyLengthFt: 96, canopyWidthFt: 16, gridSpacingFt: spacing(96, 16, 8) });
    expect(g.rows).toBe(1);
  });

  it("orients the long axis as columns (100×40, 40 fixtures → 4×10)", () => {
    const g = solveFixtureGrid({ fixtureCount: 40, canopyLengthFt: 100, canopyWidthFt: 40, gridSpacingFt: spacing(100, 40, 40) });
    expect(g.cols).toBeGreaterThanOrEqual(g.rows);
    expect(g.rows * g.cols).toBeGreaterThanOrEqual(36);
  });

  it("INVARIANT: no single file for any realistic non-strip dimensions × counts", () => {
    for (let L = 24; L <= 120; L += 6) {
      for (let W = 12; W <= 48; W += 4) {
        if (W > L) continue;
        const canopyAspect = Math.max(L, W) / Math.min(L, W);
        for (let n = 4; n <= 60; n += 1) {
          const g = solveFixtureGrid({ fixtureCount: n, canopyLengthFt: L, canopyWidthFt: W, gridSpacingFt: spacing(L, W, n) });
          if (canopyAspect < STRIP_ASPECT) {
            expect(
              Math.min(g.rows, g.cols),
              `single file at L=${L} W=${W} n=${n} → ${g.rows}×${g.cols}`,
            ).toBeGreaterThanOrEqual(2);
          }
          // never produce an absurd rectangle
          expect(g.rows * g.cols).toBeLessThanOrEqual(n + Math.max(g.rows, g.cols));
          expect(g.rows * g.cols).toBeGreaterThan(0);
        }
      }
    }
  });
});
