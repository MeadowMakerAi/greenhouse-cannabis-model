import { describe, it, expect } from "vitest";
import {
  GIBS_LAYERS,
  GIBS_250M_MATRIX,
  GIBS_MAX_ZOOM,
  tileLonSpanDeg,
  tileLatSpanDeg,
  lonToTileX,
  latToTileY,
  tileUrl,
  clampDateToLayer,
  recentIsoDate,
  buildSiteMosaic,
} from "./gibsClient";

// Montgomery, NY — the default site. Tile indices below were verified to
// return HTTP 200 against the live GIBS endpoint on 2026-06-10.
const LAT = 41.475384;
const LON = -74.244553;

describe("GIBS 250m tile grid", () => {
  it("has 9 zoom levels matching WMTSCapabilities", () => {
    expect(GIBS_250M_MATRIX).toHaveLength(9);
    expect(GIBS_MAX_ZOOM).toBe(8);
    // Spot-check the non-power-of-two low levels and the doubling tail.
    expect(GIBS_250M_MATRIX[0]).toEqual({ cols: 2, rows: 1 });
    expect(GIBS_250M_MATRIX[2]).toEqual({ cols: 5, rows: 3 });
    expect(GIBS_250M_MATRIX[8]).toEqual({ cols: 320, rows: 160 });
  });

  it("tile spans are square in degrees at high zoom", () => {
    expect(tileLonSpanDeg(8)).toBeCloseTo(1.125, 6);
    expect(tileLatSpanDeg(8)).toBeCloseTo(1.125, 6);
    expect(tileLonSpanDeg(6)).toBeCloseTo(4.5, 6);
  });

  it("maps the Montgomery site to the verified tiles", () => {
    // z8 → (y=43, x=94); z6 → (y=10, x=23). Both confirmed 200 live.
    expect(lonToTileX(LON, 8)).toBe(94);
    expect(latToTileY(LAT, 8)).toBe(43);
    expect(lonToTileX(LON, 6)).toBe(23);
    expect(latToTileY(LAT, 6)).toBe(10);
  });

  it("clamps to the matrix edges at the antimeridian / poles", () => {
    expect(lonToTileX(-180, 8)).toBe(0);
    expect(lonToTileX(179.999, 8)).toBe(GIBS_250M_MATRIX[8].cols - 1);
    expect(latToTileY(90, 8)).toBe(0);
    expect(latToTileY(-89.999, 8)).toBe(GIBS_250M_MATRIX[8].rows - 1);
  });

  it("clamps out-of-range zoom", () => {
    expect(lonToTileX(LON, 99)).toBe(lonToTileX(LON, 8));
    expect(latToTileY(LAT, -5)).toBe(latToTileY(LAT, 0));
  });
});

describe("tileUrl", () => {
  it("builds the WMTS REST path with the right format extension", () => {
    expect(tileUrl(GIBS_LAYERS.trueColor, "2026-06-10", 8, 43, 94)).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2026-06-10/250m/8/43/94.jpg",
    );
    expect(tileUrl(GIBS_LAYERS.ndvi, "2026-06-09", 6, 10, 23)).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_NDVI_8Day/default/2026-06-09/250m/6/10/23.png",
    );
  });
});

describe("clampDateToLayer", () => {
  it("guards the NDVI lower bound (no data before 2025-02-12)", () => {
    expect(clampDateToLayer(GIBS_LAYERS.ndvi, "2024-06-01")).toBe("2025-02-12");
  });
  it("guards the upper bound", () => {
    expect(clampDateToLayer(GIBS_LAYERS.ndvi, "2030-01-01")).toBe(
      GIBS_LAYERS.ndvi.defaultDate,
    );
  });
  it("passes through an in-range date unchanged", () => {
    expect(clampDateToLayer(GIBS_LAYERS.trueColor, "2026-05-01")).toBe(
      "2026-05-01",
    );
  });
  it("caps at a caller-supplied maxIso (computed today)", () => {
    expect(
      clampDateToLayer(GIBS_LAYERS.trueColor, "2026-06-10", "2026-06-08"),
    ).toBe("2026-06-08");
  });
  it("never lets maxIso drop below earliestDate", () => {
    // A nonsensical max older than the archive start still floors at earliest.
    expect(
      clampDateToLayer(GIBS_LAYERS.ndvi, "2020-01-01", "2010-01-01"),
    ).toBe(GIBS_LAYERS.ndvi.earliestDate);
  });
});

describe("recentIsoDate", () => {
  it("returns yyyy-mm-dd and counts backward", () => {
    expect(recentIsoDate(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // today − 2 must be strictly earlier than today.
    expect(recentIsoDate(2) < recentIsoDate(0)).toBe(true);
  });
  it("treats negative offsets as today", () => {
    expect(recentIsoDate(-5)).toBe(recentIsoDate(0));
  });
});

describe("buildSiteMosaic", () => {
  it("returns a size×size grid centered on the site tile", () => {
    const m = buildSiteMosaic(
      GIBS_LAYERS.trueColor,
      "2026-06-10",
      LAT,
      LON,
      8,
      3,
    );
    expect(m.size).toBe(3);
    expect(m.tiles).toHaveLength(9);
    // The site tile (43,94) must be in the mosaic.
    expect(m.tiles.some((t) => t.y === 43 && t.x === 94)).toBe(true);
    // Marker falls inside the mosaic.
    expect(m.markerLeftPct).toBeGreaterThan(0);
    expect(m.markerLeftPct).toBeLessThan(100);
    expect(m.markerTopPct).toBeGreaterThan(0);
    expect(m.markerTopPct).toBeLessThan(100);
  });

  it("clamps Y at the pole and keeps every tile on-matrix", () => {
    // Near the north pole: the grid must shift down, never index a row < 0.
    const m = buildSiteMosaic(GIBS_LAYERS.trueColor, "2026-06-10", 89, -179, 8, 3);
    expect(m.tiles.every((t) => t.x >= 0 && t.x < GIBS_250M_MATRIX[8].cols)).toBe(true);
    expect(m.tiles.every((t) => t.y >= 0 && t.y < GIBS_250M_MATRIX[8].rows)).toBe(true);
  });

  it("wraps X across the antimeridian so the site stays centered", () => {
    const cols = GIBS_250M_MATRIX[8].cols; // 320
    // lon 179.9 sits in the easternmost column; its west neighbor is column 0.
    const m = buildSiteMosaic(GIBS_LAYERS.trueColor, "2026-06-10", 41.475, 179.9, 8, 3);
    const xs = m.tiles.map((t) => t.x);
    // Mosaic must span the seam: include both a high column and column 0.
    expect(xs).toContain(0);
    expect(xs.some((x) => x === cols - 1)).toBe(true);
    expect(m.tiles.every((t) => t.x >= 0 && t.x < cols)).toBe(true);
    // Site still reads as centered (not a one-sided strip).
    expect(m.markerLeftPct).toBeGreaterThan(30);
    expect(m.markerLeftPct).toBeLessThan(90);
  });
});
