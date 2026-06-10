import { useEffect, useMemo, useState } from "react";
import { useScenario } from "../context/ScenarioContext";
import {
  GIBS_LAYERS,
  type GibsLayerId,
  buildSiteMosaic,
  clampDateToLayer,
  recentIsoDate,
} from "../services/gibsClient";

/**
 * Satellite — NASA GIBS imagery over THIS site, from its coordinates. True-color
 * (daily) ↔ NDVI vegetation (8-day) toggle + a date scrubber, rendered as a
 * tile mosaic centered on the property with a site marker.
 *
 * No API key, CORS `*`, tiles load straight into <img> — fits the client-only
 * security model. Screening-level: MODIS is 250 m/pixel, so this is REGIONAL
 * context, not a per-field instrument (that's a Sentinel-2 / ag-twin concern).
 */

// Regional context zooms on the GIBS 250m grid. z8 ≈ 1.125°/tile (tightest
// MODIS detail); z6 ≈ 4.5°/tile (wider context).
const MIN_ZOOM = 6;
const MAX_ZOOM = 8;
const MOSAIC_SIZE = 3;
// MODIS "today" is an incomplete swath (black no-data), so default a couple of
// days back to land on complete imagery; the picker still allows up to today.
const DEFAULT_DAYS_BACK = 2;

export default function SatellitePanel() {
  const { inputs } = useScenario();
  const [layerId, setLayerId] = useState<GibsLayerId>("trueColor");
  const [zoom, setZoom] = useState(MAX_ZOOM);
  // One date in state; clamped to the active layer's verified window. The
  // ceiling is each layer's advertised `defaultDate` — GIBS 404s on dates past
  // it (it does NOT snap forward), so requesting "today" would false-error.
  // These dates are a capabilities snapshot (2026-06-10); refresh them, or
  // fetch the live layer Default at runtime, to track newer imagery.
  const [rawDate, setRawDate] = useState<string>(() =>
    clampDateToLayer(GIBS_LAYERS.trueColor, recentIsoDate(DEFAULT_DAYS_BACK)),
  );
  const [tileError, setTileError] = useState(false);

  const layer = GIBS_LAYERS[layerId];
  const date = clampDateToLayer(layer, rawDate);

  // A transient tile miss shouldn't leave the error overlay stuck once the
  // mosaic inputs change to a fresh, valid request.
  useEffect(() => {
    setTileError(false);
  }, [layerId, date, zoom, inputs.latitude, inputs.longitude]);

  const mosaic = useMemo(
    () =>
      buildSiteMosaic(
        layer,
        date,
        inputs.latitude,
        inputs.longitude,
        zoom,
        MOSAIC_SIZE,
      ),
    [layer, date, inputs.latitude, inputs.longitude, zoom],
  );

  const switchLayer = (id: GibsLayerId) => {
    setTileError(false);
    setLayerId(id);
    // Re-clamp the visible date into the new layer's window.
    setRawDate((d) => clampDateToLayer(GIBS_LAYERS[id], d));
  };

  const askSage = () => {
    const seed =
      layerId === "ndvi"
        ? `I'm looking at MODIS NDVI (8-day, 250 m) vegetation imagery over my site at ${inputs.latitude.toFixed(3)}, ${inputs.longitude.toFixed(3)} for ${date}. What can regional NDVI tell me — and not tell me — about siting an outdoor cannabis grow here? Where would I need field-scale (Sentinel-2 / drone) data instead?`
        : `I'm looking at MODIS true-color satellite imagery over my site at ${inputs.latitude.toFixed(3)}, ${inputs.longitude.toFixed(3)}. What regional siting factors (land cover, water, terrain) should I check before committing to an outdoor grow here?`;
    window.dispatchEvent(
      new CustomEvent("greenhouse-model:open-agent", { detail: { seed } }),
    );
  };

  return (
    <div className="card border-leaf-500/30">
      <div className="card-header">
        <span>🛰 Satellite</span>
        <span className="text-[11px] text-ink-500">
          {inputs.latitude.toFixed(3)}, {inputs.longitude.toFixed(3)} · NASA GIBS · MODIS 250 m
        </span>
      </div>
      <div className="card-body space-y-3">
        {/* Layer toggle + zoom. */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex rounded-lg border border-ink-200/70 p-0.5">
            {(Object.keys(GIBS_LAYERS) as GibsLayerId[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => switchLayer(id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  layerId === id
                    ? "bg-leaf-500 text-white"
                    : "text-ink-600 hover:bg-ink-100"
                }`}
              >
                {GIBS_LAYERS[id].label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-600">
            <span className="uppercase tracking-wider text-[10px] text-ink-500">Zoom</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z - 1))}
              disabled={zoom <= MIN_ZOOM}
              className="h-6 w-6 rounded border border-ink-200/70 font-semibold disabled:opacity-40"
              aria-label="Zoom out (wider context)"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z + 1))}
              disabled={zoom >= MAX_ZOOM}
              className="h-6 w-6 rounded border border-ink-200/70 font-semibold disabled:opacity-40"
              aria-label="Zoom in (tighter)"
            >
              +
            </button>
          </div>
        </div>

        {/* Tile mosaic + site marker. */}
        <div className="relative overflow-hidden rounded-lg border border-ink-200/70 bg-ink-900">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${mosaic.size}, 1fr)`,
              aspectRatio: "1 / 1",
            }}
          >
            {mosaic.tiles.map((t) => (
              <img
                key={`${t.z}-${t.y}-${t.x}`}
                src={t.url}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                onError={() => setTileError(true)}
                className="block h-full w-full object-cover"
                style={{ imageRendering: "auto" }}
              />
            ))}
          </div>

          {/* Site marker — sub-tile accurate. */}
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${mosaic.markerLeftPct}%`, top: `${mosaic.markerTopPct}%` }}
          >
            <div className="h-3 w-3 rounded-full border-2 border-white bg-leaf-500 shadow-[0_0_0_2px_rgba(0,0,0,0.4)]" />
            <div className="mt-0.5 -translate-x-1/2 whitespace-nowrap rounded bg-black/60 px-1 text-[9px] font-semibold text-white">
              your site
            </div>
          </div>

          {tileError && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink-900/70 px-4 text-center text-xs text-white">
              Couldn't load some GIBS tiles — check the connection, or this
              date may have no coverage.
            </div>
          )}
        </div>

        {/* Date scrubber, clamped to the active layer's window. */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-600">
          <label className="flex items-center gap-1.5">
            <span className="uppercase tracking-wider text-[10px] text-ink-500">Date</span>
            <input
              type="date"
              value={date}
              min={layer.earliestDate}
              max={layer.defaultDate}
              onChange={(e) => {
                setTileError(false);
                setRawDate(e.target.value || recentIsoDate(DEFAULT_DAYS_BACK));
              }}
              className="rounded border border-ink-200/70 px-1.5 py-0.5 font-mono text-xs"
            />
          </label>
          <span className="text-[11px] text-ink-500">{layer.note}</span>
        </div>

        {/* Provenance + honesty. */}
        <p className="text-[11px] italic leading-relaxed text-ink-500">
          {layer.attribution}. Regional 250 m imagery — screening-level context,
          not a field-scale instrument. Clouds read white on true-color; NDVI is
          an 8-day composite, so it lags live conditions. Field-resolution
          vegetation (Sentinel-2, 10 m) is out of scope for this client-only sim.
        </p>

        <button
          type="button"
          onClick={askSage}
          className="rounded-lg bg-leaf-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-leaf-600"
        >
          Ask Sage about this imagery
        </button>
      </div>
    </div>
  );
}
