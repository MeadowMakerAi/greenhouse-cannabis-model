/**
 * Fixture grid solver — shared by Greenhouse3D (the 3D scene) and
 * GreenhousePlanView (the top-down schematic). CLAUDE.md flags these two as a
 * historical drift pair; this is the single source of truth they both call.
 *
 * NOTE — this is an app-local OVERRIDE of grow-core's `models/fixtureGrid`.
 * grow-core#v0.2.1 minimized |rows*cols - count|, weighting an exact count
 * match 5x over canopy aspect. That collapsed a cleanly-factorable count into a
 * degenerate thin rectangle — e.g. 424 fixtures on a 130x65 ft canopy rendered
 * as 8 cols x 53 rows (rows ~1.2 ft apart), i.e. "long lines of densely packed
 * lights" instead of the correct ~15x29 near-square grid. This override fixes
 * that by laying out an aspect-matched, near-square-CELL grid and treating the
 * fixture count as APPROXIMATE (real commercial layouts round the count to fit
 * a clean uniform grid). The same fix should land in grow-core upstream.
 *
 * Why square-ish cells: uniformity. Ciolkosz, Both & Albright (2001), Applied
 * Engineering in Agriculture 17(6):875-882 — long dense rows lose PPFD
 * uniformity vs. square/near-square layouts at a given mounting height.
 */

export interface FixtureGridParams {
  /** Requested number of fixtures (the BoM count). */
  fixtureCount: number;
  /** Active canopy length in feet (the long axis → columns). */
  canopyLengthFt: number;
  /** Active canopy width in feet (the short axis → rows). */
  canopyWidthFt: number;
  /** Target square grid spacing in feet. Advisory only now — the layout is
   *  derived from count + canopy aspect, which yields ≈√(area/count) spacing
   *  intrinsically. Kept for call-site compatibility. */
  gridSpacingFt?: number;
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
}: FixtureGridParams): FixtureGrid {
  // Fail loud/clean on non-finite inputs rather than propagating NaN into
  // rows/cols, which would make callers silently render zero fixtures.
  if (!Number.isFinite(fixtureCount)) return { rows: 0, cols: 0 };
  const n = Math.max(0, Math.round(fixtureCount));
  if (n <= 0) return { rows: 0, cols: 0 };
  if (n === 1) return { rows: 1, cols: 1 };

  const L = Math.max(canopyLengthFt, 0.1);
  const W = Math.max(canopyWidthFt, 0.1);
  const targetAspect = L / W; // cols (along length) : rows (along width)
  const canopyAspect = Math.max(L, W) / Math.min(L, W);

  // Derive rows from the count and the canopy aspect so each CELL stays
  // near-square (colSpacing ≈ rowSpacing) — the uniformity requirement — then
  // cover the count with columns. Count treated as approximate. This replaces
  // grow-core's |rows*cols - count| minimizer, which collapsed clean counts
  // (424 = 8×53) into degenerate strips.
  let rows = Math.max(1, Math.round(Math.sqrt(n / targetAspect)));
  let cols = Math.max(1, Math.ceil(n / rows));
  rows = Math.max(1, Math.ceil(n / cols)); // tighten so the last row isn't sparse

  // Degenerate single-file guard: a multi-fixture canopy that isn't a genuine
  // long strip must never render as one row or one column.
  if (n >= 4 && canopyAspect < STRIP_ASPECT) {
    if (rows < 2) {
      rows = 2;
      cols = Math.max(2, Math.ceil(n / rows));
    }
    if (cols < 2) {
      cols = 2;
      rows = Math.max(2, Math.ceil(n / cols));
    }
  }

  return { rows, cols };
}
