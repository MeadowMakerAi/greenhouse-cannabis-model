/**
 * Bench layout solver — pure, deterministic. No I/O, no LLM.
 *
 * Real greenhouses grow on benches with walk aisles, not on an abstract
 * canopy rectangle. Given the house footprint and a bench spec, this packs
 * benches into the floor and returns the exact canopy footprint (bench tops),
 * the leftover aisle area, and per-bench rectangles for the 3D / plan view.
 *
 * This is PURE GEOMETRY — bench footprint + aisle width + house dimensions →
 * exact areas. There are NO empirical coefficients here (no fabricated
 * "utilization %"), so nothing in this file needs a CITATIONS.md entry. The
 * only judgement calls are the *default* aisle / perimeter widths in
 * `greenhouseDefaults.ts`, which are typical working-aisle widths and are
 * fully operator-editable.
 *
 * Fixed vs. rolling is the one real modelling decision, and it too is pure
 * geometry: fixed benches need an aisle between every row; rolling benches
 * sit on rollers and share ONE movable aisle for the whole block, so they
 * pack more canopy into the same floor. See the horticultural note in
 * `equipmentLibrary.ts` (rolling bench = "single movable aisle shared").
 */

export type BenchType = "fixed" | "rolling";
/** Which house axis the bench's long dimension runs along. */
export type BenchOrientation = "length-run" | "width-run";

export interface BenchLayoutInput {
  /** Interior floor length (ft) — the house's long exterior axis. */
  houseLengthFt: number;
  /** Interior floor width (ft) — the house's short exterior axis. */
  houseWidthFt: number;
  benchType: BenchType;
  /** Bench short dimension (ft), across the run. */
  benchWidthFt: number;
  /** Bench long dimension (ft), along the run. */
  benchLengthFt: number;
  /** Walk-aisle width (ft). Fixed: one between every row. Rolling: one shared. */
  aisleWidthFt: number;
  /** Clearance kept clear on all four sides of the bench block (ft). */
  perimeterAisleFt: number;
  orientation: BenchOrientation;
}

/** One bench footprint in greenhouse-local feet: x along house length, z along
 *  house width, both centred on 0 (matches the PlacedEquipment convention). */
export interface BenchRect {
  cx: number;
  cz: number;
  /** Extent along the house length axis (ft). */
  lengthFt: number;
  /** Extent along the house width axis (ft). */
  widthFt: number;
}

export interface BenchLayoutResult {
  /** False when the bench/aisle spec doesn't fit the house (over-packed or
   *  degenerate). Callers should keep the prior canopy instead of zeroing it. */
  fits: boolean;
  benchCount: number;
  /** Bench rows across the cross axis. */
  rows: number;
  /** Benches per row along the run axis. */
  cols: number;
  /** Total bench-top area (ft²) — the flowering canopy footprint. */
  canopyAreaSqFt: number;
  /** Floor not covered by benches (ft²) — aisles + perimeter + slack. */
  aisleAreaSqFt: number;
  benchRects: BenchRect[];
}

const isPos = (n: number) => Number.isFinite(n) && n > 0;

const EMPTY = (floorArea: number): BenchLayoutResult => ({
  fits: false,
  benchCount: 0,
  rows: 0,
  cols: 0,
  canopyAreaSqFt: 0,
  aisleAreaSqFt: Number.isFinite(floorArea) && floorArea > 0 ? floorArea : 0,
  benchRects: [],
});

/**
 * Pack benches into the house footprint. Returns `fits: false` (and zero
 * benches) when the spec is degenerate or nothing fits after the perimeter
 * aisle — the caller must NOT overwrite canopy with 0 in that case.
 */
export function solveBenchLayout(input: BenchLayoutInput): BenchLayoutResult {
  const {
    houseLengthFt,
    houseWidthFt,
    benchType,
    benchWidthFt,
    benchLengthFt,
    aisleWidthFt,
    perimeterAisleFt,
    orientation,
  } = input;

  const floorArea = houseLengthFt * houseWidthFt;

  // Every length must be a positive finite number; aisle/perimeter may be 0.
  if (
    !isPos(houseLengthFt) ||
    !isPos(houseWidthFt) ||
    !isPos(benchWidthFt) ||
    !isPos(benchLengthFt) ||
    !Number.isFinite(aisleWidthFt) ||
    aisleWidthFt < 0 ||
    !Number.isFinite(perimeterAisleFt) ||
    perimeterAisleFt < 0
  ) {
    return EMPTY(floorArea);
  }

  // Map orientation → (run axis = where bench length lies, cross axis = the
  // other). "length-run" runs benches along the house length (x); "width-run"
  // runs them along the house width (z).
  const runIsLength = orientation === "length-run";
  const runDim = runIsLength ? houseLengthFt : houseWidthFt;
  const crossDim = runIsLength ? houseWidthFt : houseLengthFt;

  const usableRun = runDim - 2 * perimeterAisleFt;
  const usableCross = crossDim - 2 * perimeterAisleFt;
  if (usableRun < benchLengthFt || usableCross < benchWidthFt) {
    return EMPTY(floorArea);
  }

  // Along the run axis: benches butted end-to-end, side access from the aisles.
  const cols = Math.floor(usableRun / benchLengthFt);

  // Across the cross axis: rows of benches.
  //  fixed   → an aisle between every pair of rows: rows·w + (rows−1)·a ≤ cross
  //  rolling → one shared movable aisle for the block: rows·w + a ≤ cross
  const rows =
    benchType === "rolling"
      ? Math.floor((usableCross - aisleWidthFt) / benchWidthFt)
      : Math.floor((usableCross + aisleWidthFt) / (benchWidthFt + aisleWidthFt));

  if (cols < 1 || rows < 1) return EMPTY(floorArea);

  const benchCount = cols * rows;
  const canopyAreaSqFt = benchCount * benchWidthFt * benchLengthFt;
  const aisleAreaSqFt = Math.max(0, floorArea - canopyAreaSqFt);

  // Rect centres in house-local feet (0,0 = floor centre).
  const runStart = -runDim / 2 + perimeterAisleFt; // near edge of first bench block
  const crossStart = -crossDim / 2 + perimeterAisleFt;
  const rowPitch =
    benchType === "rolling" ? benchWidthFt : benchWidthFt + aisleWidthFt;

  const benchRects: BenchRect[] = [];
  for (let r = 0; r < rows; r++) {
    const crossCentre = crossStart + benchWidthFt / 2 + r * rowPitch;
    for (let c = 0; c < cols; c++) {
      const runCentre = runStart + benchLengthFt / 2 + c * benchLengthFt;
      benchRects.push(
        runIsLength
          ? { cx: runCentre, cz: crossCentre, lengthFt: benchLengthFt, widthFt: benchWidthFt }
          : { cx: crossCentre, cz: runCentre, lengthFt: benchWidthFt, widthFt: benchLengthFt },
      );
    }
  }

  return { fits: true, benchCount, rows, cols, canopyAreaSqFt, aisleAreaSqFt, benchRects };
}

/**
 * Distribute a fixture count across benches — one row of lights per bench,
 * evenly spaced along the bench's long axis. Returns fixture centres in the
 * same house-local feet as the bench rects. Shared by the 3D scene and the
 * plan view so the two never drift (CLAUDE.md flags that pair).
 */
export function benchFixturePositions(
  rects: BenchRect[],
  fixtureCount: number,
): { x: number; z: number }[] {
  const out: { x: number; z: number }[] = [];
  const n = rects.length;
  if (n === 0 || fixtureCount <= 0) return out;
  const base = Math.floor(fixtureCount / n);
  let remainder = fixtureCount - base * n;
  for (const b of rects) {
    const k = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;
    if (k <= 0) continue;
    const alongLength = b.lengthFt >= b.widthFt;
    const span = alongLength ? b.lengthFt : b.widthFt;
    for (let i = 0; i < k; i++) {
      const t = (i + 0.5) / k - 0.5; // −0.5 … +0.5 across the bench span
      out.push({
        x: alongLength ? b.cx + t * span : b.cx,
        z: alongLength ? b.cz : b.cz + t * span,
      });
    }
  }
  return out;
}
