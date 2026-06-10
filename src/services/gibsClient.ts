/**
 * NASA GIBS (Global Imagery Browse Services) WMTS tile client.
 *
 * Why GIBS: no API key, CORS `access-control-allow-origin: *`, so it fits the
 * public sim's client-only / bring-your-own-key security model — tiles load
 * straight into <img> elements with nothing to leak. Verified live 2026-06-10:
 *   · MODIS_Terra_CorrectedReflectance_TrueColor → 200 image/jpeg, daily back
 *     to 2000-02-24.
 *   · MODIS_Terra_NDVI_8Day → 200 image/png, 8-day composite from 2025-02-12.
 * Both on the EPSG:4326 (geographic / plate-carrée) `250m` TileMatrixSet.
 *
 * Resolution honesty: MODIS is 250 m/pixel — this is a REGIONAL context view,
 * not a per-field instrument. Quantitative field-scale NDVI (Sentinel-2, 10 m)
 * is an ag-twin concern, called out in the panel copy and CITATIONS.md.
 *
 * Grid honesty: the `250m` EPSG:4326 TileMatrixSet is NOT a clean power-of-two
 * pyramid (z0=2×1, z1=3×2, z2=5×3, then doubling). The matrix dimensions below
 * are copied verbatim from GIBS WMTSCapabilities (verified 2026-06-10), not
 * derived from a formula that would silently drift at low zooms.
 */

export type GibsLayerId = "trueColor" | "ndvi";

export interface GibsLayerSpec {
  id: GibsLayerId;
  /** WMTS LAYER identifier. */
  wmtsLayer: string;
  /** Tile file extension / format. */
  ext: "jpg" | "png";
  label: string;
  /** Earliest date with data (inclusive), ISO yyyy-mm-dd. */
  earliestDate: string;
  /** Default / most-recent date GIBS advertises, ISO yyyy-mm-dd. */
  defaultDate: string;
  /** One-line attribution for the panel + CITATIONS. */
  attribution: string;
  /** Short note on what the layer shows + its limits. */
  note: string;
}

export const GIBS_LAYERS: Record<GibsLayerId, GibsLayerSpec> = {
  trueColor: {
    id: "trueColor",
    wmtsLayer: "MODIS_Terra_CorrectedReflectance_TrueColor",
    ext: "jpg",
    label: "True color",
    earliestDate: "2000-02-24",
    defaultDate: "2026-06-10",
    attribution:
      "NASA EOSDIS GIBS · MODIS Terra Corrected Reflectance (true color)",
    note: "Daily natural-color imagery. Clouds read white; the surface shows through on clear days.",
  },
  ndvi: {
    id: "ndvi",
    wmtsLayer: "MODIS_Terra_NDVI_8Day",
    ext: "png",
    label: "Vegetation (NDVI)",
    earliestDate: "2025-02-12",
    defaultDate: "2026-06-09",
    attribution: "NASA EOSDIS GIBS · MODIS Terra NDVI 8-Day (250 m)",
    note: "8-day vegetation-greenness composite. Greener = denser/healthier canopy. Regional 250 m — not field-scale.",
  },
};

const HOST = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best";
export const GIBS_HOST_ORIGIN = "https://gibs.earthdata.nasa.gov";
const TILE_MATRIX_SET = "250m";

/**
 * EPSG:4326 `250m` matrix dimensions, verbatim from WMTSCapabilities
 * (verified 2026-06-10). Index = zoom level. cols spans 360° lon, rows spans
 * 180° lat. Tiles are 512×512 px.
 */
export const GIBS_250M_MATRIX: ReadonlyArray<{ cols: number; rows: number }> = [
  { cols: 2, rows: 1 }, // z0
  { cols: 3, rows: 2 }, // z1
  { cols: 5, rows: 3 }, // z2
  { cols: 10, rows: 5 }, // z3
  { cols: 20, rows: 10 }, // z4
  { cols: 40, rows: 20 }, // z5
  { cols: 80, rows: 40 }, // z6
  { cols: 160, rows: 80 }, // z7
  { cols: 320, rows: 160 }, // z8
];

export const GIBS_MAX_ZOOM = GIBS_250M_MATRIX.length - 1; // 8
export const GIBS_TILE_PX = 512;

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 0;
  return Math.max(0, Math.min(GIBS_MAX_ZOOM, Math.floor(z)));
}

/** Degrees of longitude spanned by one tile at this zoom. */
export function tileLonSpanDeg(z: number): number {
  return 360 / GIBS_250M_MATRIX[clampZoom(z)].cols;
}

/** Degrees of latitude spanned by one tile at this zoom. */
export function tileLatSpanDeg(z: number): number {
  return 180 / GIBS_250M_MATRIX[clampZoom(z)].rows;
}

/** Fractional tile column for a longitude (x grows eastward from -180°). */
export function lonToTileXf(lon: number, z: number): number {
  return (lon + 180) / tileLonSpanDeg(z);
}

/** Fractional tile row for a latitude (y grows southward from +90°). */
export function latToTileYf(lat: number, z: number): number {
  return (90 - lat) / tileLatSpanDeg(z);
}

/** Integer tile column, clamped to the matrix. */
export function lonToTileX(lon: number, z: number): number {
  const cols = GIBS_250M_MATRIX[clampZoom(z)].cols;
  return Math.max(0, Math.min(cols - 1, Math.floor(lonToTileXf(lon, z))));
}

/** Integer tile row, clamped to the matrix. */
export function latToTileY(lat: number, z: number): number {
  const rows = GIBS_250M_MATRIX[clampZoom(z)].rows;
  return Math.max(0, Math.min(rows - 1, Math.floor(latToTileYf(lat, z))));
}

/**
 * WMTS REST tile URL. Format:
 *   {host}/{layer}/default/{date}/{tms}/{z}/{y}/{x}.{ext}
 */
export function tileUrl(
  layer: GibsLayerSpec,
  date: string,
  z: number,
  y: number,
  x: number,
): string {
  return `${HOST}/${layer.wmtsLayer}/default/${date}/${TILE_MATRIX_SET}/${clampZoom(
    z,
  )}/${y}/${x}.${layer.ext}`;
}

/**
 * Clamp an ISO yyyy-mm-dd to a layer's valid window. GIBS snaps within-range
 * dates to the right composite (P1D dimension), so we only guard the bounds —
 * requesting a date before `earliestDate` 404s (true for NDVI before 2025).
 * `maxIso` lets the caller cap at a computed "today" instead of the static
 * authoring-time `defaultDate`; it never drops below `earliestDate`.
 */
export function clampDateToLayer(
  layer: GibsLayerSpec,
  isoDate: string,
  maxIso: string = layer.defaultDate,
): string {
  const lo = layer.earliestDate;
  const hi = maxIso < lo ? lo : maxIso;
  if (isoDate < lo) return lo;
  if (isoDate > hi) return hi;
  return isoDate;
}

/**
 * Today (UTC) minus `daysAgo`, as ISO yyyy-mm-dd. MODIS "today" is usually an
 * incomplete swath (the tile exists but is a black no-data fill), so the panel
 * defaults a few days back to land on complete imagery. Browser-only runtime
 * date — fine here (the no-`Date` rule is for replayable workflow scripts).
 */
export function recentIsoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - Math.max(0, daysAgo));
  return d.toISOString().slice(0, 10);
}

export interface MosaicTile {
  z: number;
  y: number;
  x: number;
  url: string;
  /** Grid position within the rendered mosaic (0 = first row/col). */
  gridRow: number;
  gridCol: number;
}

export interface SiteMosaic {
  tiles: MosaicTile[];
  /** Mosaic dimension (size × size tiles). */
  size: number;
  /** Site marker position as a fraction [0,1] across the whole mosaic. */
  markerLeftPct: number;
  markerTopPct: number;
}

/**
 * Build a square tile mosaic centered on the site, with the site-marker
 * position resolved to sub-tile precision. `size` should be odd so the site
 * tile sits in the middle (default 3 → 3×3). Tiles are clamped to the matrix
 * edges; the marker fraction stays accurate even when clamping shifts a tile.
 */
export function buildSiteMosaic(
  layer: GibsLayerSpec,
  date: string,
  lat: number,
  lon: number,
  z: number,
  size = 3,
): SiteMosaic {
  const zz = clampZoom(z);
  const { cols, rows } = GIBS_250M_MATRIX[zz];
  const half = Math.floor(size / 2);

  const centerXf = lonToTileXf(lon, zz);
  const centerYf = latToTileYf(lat, zz);
  const centerX = Math.max(0, Math.min(cols - 1, Math.floor(centerXf)));
  const centerY = Math.max(0, Math.min(rows - 1, Math.floor(centerYf)));

  // Top-left tile of the mosaic, clamped so the whole grid stays on-matrix.
  const startX = Math.max(0, Math.min(cols - size, centerX - half));
  const startY = Math.max(0, Math.min(rows - size, centerY - half));

  const tiles: MosaicTile[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const x = startX + c;
      const y = startY + r;
      tiles.push({
        z: zz,
        y,
        x,
        url: tileUrl(layer, date, zz, y, x),
        gridRow: r,
        gridCol: c,
      });
    }
  }

  // Marker: where the site falls across the mosaic span, in [0,1].
  const markerLeftPct = ((centerXf - startX) / size) * 100;
  const markerTopPct = ((centerYf - startY) / size) * 100;

  return {
    tiles,
    size,
    markerLeftPct: Math.max(0, Math.min(100, markerLeftPct)),
    markerTopPct: Math.max(0, Math.min(100, markerTopPct)),
  };
}
