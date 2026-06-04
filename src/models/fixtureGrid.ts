/**
 * Fixture grid solver — shared by Greenhouse3D (the 3D scene) and
 * GreenhousePlanView (the top-down schematic). CLAUDE.md flags these two as a
 * historical drift pair; this is the single source of truth they both call.
 *
 * Goal: turn a fixture *count* + canopy footprint + target square spacing into
 * a clean `rows × cols` rectangle that (a) tiles the canopy at roughly the
 * requested spacing, (b) honors the canopy's length:width aspect, and (c)
 * never collapses to a degenerate single file unless the canopy genuinely is
 * a long strip.
 *
 * The single-file collapse was the bug: with gridSpacing = √(area / count),
 * the spacing-derived row count reduces to round(√(count / aspect)), which
 * rounds to 1 whenever count < ~2.25 · aspect. A 48×16 house (aspect 3) with
 * 6 fixtures would render one row of 4 — never correct for a real layout.
 */

export interface FixtureGridParams {
  /** Requested number of fixtures (the BoM count). */
  fixtureCount: number;
  /** Active canopy length in feet (the long axis → columns). */
  canopyLengthFt: number;
  /** Active canopy width in feet (the short axis → rows). */
  canopyWidthFt: number;
  /** Target square grid spacing in feet (√(canopyArea / count)). */
  gridSpacingFt: number;
}

export interface FixtureGrid {
  rows: number;
  cols: number;
}

/**
 * Above this canopy length:width ratio the canopy is treated as a genuine
 * single-file strip, so a 1-row (or 1-col) layout is allowed. Below it, a
 * multi-fixture canopy must form a real grid.
 */
export const STRIP_ASPECT = 4;

export function solveFixtureGrid({
  fixtureCount,
  canopyLengthFt,
  canopyWidthFt,
  gridSpacingFt,
}: FixtureGridParams): FixtureGrid {
  const n = Math.max(0, Math.round(fixtureCount));
  if (n <= 0) return { rows: 0, cols: 0 };
  if (n === 1) return { rows: 1, cols: 1 };

  const L = Math.max(canopyLengthFt, 0.1);
  const W = Math.max(canopyWidthFt, 0.1);
  const s = Math.max(gridSpacingFt, 0.1);
  const targetAspect = L / W; // cols (along length) : rows (along width)
  const canopyAspect = Math.max(L, W) / Math.min(L, W);

  // 1) Physical grid implied by the square spacing.
  let cols = Math.max(1, Math.round(L / s));
  let rows = Math.max(1, Math.round(W / s));

  // 2) If that grid isn't close to the requested count, re-fit a rectangle
  //    to the count that best matches the canopy aspect.
  if (Math.abs(rows * cols - n) > 2) {
    let best = { rows, cols, score: Infinity };
    for (let testCols = 1; testCols <= n; testCols++) {
      const testRows = Math.max(1, Math.round(n / testCols));
      const product = testRows * testCols;
      const aspect = testCols / testRows;
      const score = Math.abs(product - n) * 5 + Math.abs(aspect - targetAspect);
      if (score < best.score) best = { rows: testRows, cols: testCols, score };
    }
    rows = best.rows;
    cols = best.cols;
  }

  // 3) Degenerate-single-file guard. A multi-fixture canopy that isn't a long
  //    strip should never render one row or one column. Rebuild a balanced
  //    grid that honors the canopy aspect (cols along the length).
  if (n >= 4 && canopyAspect < STRIP_ASPECT && (rows === 1 || cols === 1)) {
    let r = Math.max(1, Math.round(Math.sqrt(n / targetAspect)));
    let c = Math.max(1, Math.round(n / r));
    if (r === 1) {
      r = 2;
      c = Math.max(2, Math.round(n / 2));
    }
    if (c === 1) {
      c = 2;
      r = Math.max(2, Math.round(n / 2));
    }
    rows = r;
    cols = c;
  }

  return { rows, cols };
}
