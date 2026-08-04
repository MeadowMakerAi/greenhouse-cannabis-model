import { describe, it, expect } from "vitest";
import {
  solveBenchLayout,
  benchFixturePositions,
  type BenchLayoutInput,
} from "./benchLayout";

// Default house 48 L × 32 W, commercial rolling bench 4 × 40, 3 ft aisle,
// 2 ft perimeter, running along the house length.
const base: BenchLayoutInput = {
  houseLengthFt: 48,
  houseWidthFt: 32,
  benchType: "rolling",
  benchWidthFt: 4,
  benchLengthFt: 40,
  aisleWidthFt: 3,
  perimeterAisleFt: 2,
  orientation: "length-run",
};

describe("solveBenchLayout — pure bench packing geometry", () => {
  it("packs a rolling layout and derives canopy from bench tops", () => {
    const r = solveBenchLayout(base);
    // usableRun 44 → 1 bench-length; usableCross 28, one shared aisle →
    // floor((28-3)/4) = 6 rows.
    expect(r.fits).toBe(true);
    expect(r.cols).toBe(1);
    expect(r.rows).toBe(6);
    expect(r.benchCount).toBe(6);
    expect(r.canopyAreaSqFt).toBe(6 * 4 * 40); // 960
    expect(r.benchRects).toHaveLength(6);
  });

  it("canopy always equals benchCount × bench footprint, and aisle = floor − canopy", () => {
    const r = solveBenchLayout(base);
    expect(r.canopyAreaSqFt).toBe(r.benchCount * base.benchWidthFt * base.benchLengthFt);
    expect(r.aisleAreaSqFt).toBeCloseTo(
      base.houseLengthFt * base.houseWidthFt - r.canopyAreaSqFt,
      5,
    );
    expect(r.aisleAreaSqFt).toBeGreaterThanOrEqual(0);
  });

  it("rolling packs MORE canopy than fixed in the same house (one shared aisle vs. an aisle per row)", () => {
    const rolling = solveBenchLayout({ ...base, benchType: "rolling" });
    const fixed = solveBenchLayout({ ...base, benchType: "fixed" });
    // fixed rows = floor((28+3)/(4+3)) = 4 → fewer benches than rolling's 6.
    expect(fixed.rows).toBe(4);
    expect(fixed.benchCount).toBe(4);
    expect(rolling.canopyAreaSqFt).toBeGreaterThan(fixed.canopyAreaSqFt);
  });

  it("all bench rectangles stay inside the house footprint", () => {
    const r = solveBenchLayout(base);
    const halfL = base.houseLengthFt / 2;
    const halfW = base.houseWidthFt / 2;
    for (const b of r.benchRects) {
      expect(Math.abs(b.cx) + b.lengthFt / 2).toBeLessThanOrEqual(halfL + 1e-9);
      expect(Math.abs(b.cz) + b.widthFt / 2).toBeLessThanOrEqual(halfW + 1e-9);
    }
  });

  it("width-run transposes bench dimensions onto the house axes", () => {
    // 4 × 20 bench running across the width of the 48 × 32 house.
    const r = solveBenchLayout({
      ...base,
      benchLengthFt: 20,
      orientation: "width-run",
    });
    expect(r.fits).toBe(true);
    // run axis = width (32): usableRun 28 → floor(28/20) = 1 along width.
    // cross axis = length (48): usableCross 44, rolling → floor((44-3)/4) = 10.
    expect(r.benchCount).toBe(10);
    // Bench long side (20) now lies along the house WIDTH; short side (4)
    // along the house LENGTH.
    expect(r.benchRects[0].lengthFt).toBe(4);
    expect(r.benchRects[0].widthFt).toBe(20);
  });

  it("returns fits=false (not zero-crash) when the bench spec can't fit the house", () => {
    const r = solveBenchLayout({ ...base, houseLengthFt: 10, houseWidthFt: 10 });
    expect(r.fits).toBe(false);
    expect(r.benchCount).toBe(0);
    expect(r.canopyAreaSqFt).toBe(0);
    // Whole floor is unusable/aisle when nothing fits — never NaN.
    expect(r.aisleAreaSqFt).toBe(100);
    expect(r.benchRects).toHaveLength(0);
  });

  it("rejects non-finite / negative dimensions without throwing", () => {
    expect(solveBenchLayout({ ...base, houseWidthFt: NaN }).fits).toBe(false);
    expect(solveBenchLayout({ ...base, benchWidthFt: -4 }).fits).toBe(false);
    expect(solveBenchLayout({ ...base, benchLengthFt: 0 }).fits).toBe(false);
  });
});

describe("benchFixturePositions — bench-aligned light grid (shared by 3D + plan view)", () => {
  const rects = solveBenchLayout(base).benchRects; // 6 benches, 4×40 each

  it("places exactly the requested fixture count", () => {
    expect(benchFixturePositions(rects, 18)).toHaveLength(18);
    expect(benchFixturePositions(rects, 6)).toHaveLength(6);
  });

  it("distributes evenly with the remainder on the first benches", () => {
    // 6 benches, 8 fixtures → two benches get 2, four get 1.
    const positions = benchFixturePositions(rects, 8);
    expect(positions).toHaveLength(8);
  });

  it("keeps fixtures within each bench's length span", () => {
    const positions = benchFixturePositions(rects, 18);
    // Every fixture x must fall inside some bench's [cx±length/2].
    for (const p of positions) {
      const inABench = rects.some(
        (b) => Math.abs(p.x - b.cx) <= b.lengthFt / 2 + 1e-9,
      );
      expect(inABench).toBe(true);
    }
  });

  it("returns empty for no benches or no fixtures", () => {
    expect(benchFixturePositions([], 10)).toHaveLength(0);
    expect(benchFixturePositions(rects, 0)).toHaveLength(0);
  });
});
