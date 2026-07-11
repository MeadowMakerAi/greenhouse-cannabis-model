/**
 * Bench layout solver — pure geometry, no fabricated coefficients.
 *
 * Turns a bench spec (type, bench width/length, aisle width, perimeter
 * clearance) plus the greenhouse footprint into concrete row rectangles and a
 * DERIVED canopy area. This is what makes canopy honest for a benched house:
 * canopy comes from where plants actually sit, not a typed guess.
 *
 * Geometry convention (feet, origin at a greenhouse corner):
 *   - X = length axis (long axis of the house). Benches run ALONG it.
 *   - Y = width axis. Rows of benches stack ACROSS it, separated by aisles.
 *
 * Rows run the full usable length as continuous strips (the realistic rolling
 * layout — a bench run down the house), segmented only visually into
 * benchLength pieces. The physical lever that separates rolling from fixed is
 * the AISLE RULE across the width:
 *   - rolling: benches pack tight and share ONE movable aisle for the whole
 *     block (roll to open a walk aisle wherever you're working). Reclaims all
 *     inter-bench aisle space → high utilization (up to ~90%, see CITATIONS).
 *   - fixed:   an aisle between EVERY row (you can't move them). ~50–67%.
 *
 * No invented utilization %: aisle width and perimeter are inputs, the rest is
 * division. See docs/CITATIONS.md for the utilization figures Sage cites.
 */

export interface BenchSpec {
  type: "rolling" | "fixed";
  /** Bench footprint across the width (the narrow dimension). */
  benchWidthFt: number;
  /** Nominal bench length — used only to segment a continuous row visually. */
  benchLengthFt: number;
  /** Rolling: the single shared walk aisle. Fixed: aisle between every row. */
  aisleWidthFt: number;
  /** Clearance kept clear around the whole bench block (endwall/sidewall). */
  perimeterFt: number;
}

export interface BenchRowRect {
  /** Feet from the length-axis origin (near endwall). */
  xFt: number;
  /** Feet from the width-axis origin (near sidewall). */
  yFt: number;
  wFt: number; // extent along length
  hFt: number; // extent along width (= benchWidthFt)
}

export interface BenchLayoutResult {
  /** Rows of benches across the width. 0 = benches don't fit the footprint. */
  rows: number;
  /** Visual bench segments per row (ceil of usable length / bench length). */
  benchesPerRow: number;
  benchCount: number;
  benchWidthFt: number;
  benchLengthFt: number;
  aisleWidthFt: number;
  perimeterFt: number;
  type: "rolling" | "fixed";
  /** Usable length a row spans (footprint length minus perimeter both ends). */
  rowLengthFt: number;
  /** Derived growing area = rows × rowLength × benchWidth. */
  canopyAreaSqFt: number;
  utilizationPct: number;
  /** One rect per row (continuous), for top-down rendering. Aisles are the
   *  negative space between/around these — not drawn as separate rects. */
  rowRects: BenchRowRect[];
  /** Echoed for the renderer's ft→px scale. */
  interiorLengthFt: number;
  interiorWidthFt: number;
}

/**
 * @param interiorLengthFt  greenhouse length (exterior≈interior, screening).
 * @param interiorWidthFt   greenhouse width.
 */
export function solveBenchLayout(
  interiorLengthFt: number,
  interiorWidthFt: number,
  spec: BenchSpec,
): BenchLayoutResult {
  const { type, benchWidthFt, benchLengthFt, aisleWidthFt, perimeterFt } = spec;

  const rowLengthFt = Math.max(0, interiorLengthFt - 2 * perimeterFt);
  const usableWidthFt = Math.max(0, interiorWidthFt - 2 * perimeterFt);

  // Rows across the width. Rolling reserves ONE aisle for the whole block;
  // fixed needs an aisle between every row (n benches + (n−1) aisles ≤ width,
  // i.e. n = ⌊(width + aisle) / (benchWidth + aisle)⌋).
  let rows = 0;
  if (benchWidthFt > 0) {
    rows =
      type === "rolling"
        ? Math.floor((usableWidthFt - aisleWidthFt) / benchWidthFt)
        : Math.floor(
            (usableWidthFt + aisleWidthFt) / (benchWidthFt + aisleWidthFt),
          );
  }
  rows = Math.max(0, rows);

  const benchesPerRow =
    rowLengthFt > 0 && benchLengthFt > 0
      ? Math.ceil(rowLengthFt / benchLengthFt)
      : 0;

  const canopyAreaSqFt = rows * rowLengthFt * benchWidthFt;
  const floorAreaSqFt = interiorLengthFt * interiorWidthFt;
  const utilizationPct =
    floorAreaSqFt > 0 ? (canopyAreaSqFt / floorAreaSqFt) * 100 : 0;

  // Place rows across the width. Rolling packs tight from the near sidewall
  // (the leftover strip at the far side reads as the single movable aisle);
  // fixed spreads each row by benchWidth + aisle.
  const pitchFt =
    type === "rolling" ? benchWidthFt : benchWidthFt + aisleWidthFt;
  const rowRects: BenchRowRect[] = [];
  for (let r = 0; r < rows; r++) {
    rowRects.push({
      xFt: perimeterFt,
      yFt: perimeterFt + r * pitchFt,
      wFt: rowLengthFt,
      hFt: benchWidthFt,
    });
  }

  return {
    rows,
    benchesPerRow,
    benchCount: rows * benchesPerRow,
    benchWidthFt,
    benchLengthFt,
    aisleWidthFt,
    perimeterFt,
    type,
    rowLengthFt,
    canopyAreaSqFt,
    utilizationPct,
    rowRects,
    interiorLengthFt,
    interiorWidthFt,
  };
}
