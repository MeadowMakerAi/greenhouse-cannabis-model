/**
 * Soil data fetch — browser-direct, no key, both endpoints CORS-open.
 *
 *  · Static soil profile  — SoilGrids v2 (ISRIC), global 250 m digital soil map.
 *    rest.isric.org returns `access-control-allow-origin: *` (verified), so it
 *    works from the client — unlike US-gov SSURGO, which needs a proxy. Each
 *    property is decoded with the layer's OWN d_factor (see soilModel).
 *  · Live surface soil    — Open-Meteo forecast (already in the CSP), current
 *    soil moisture + temperature at depth.
 *
 * Both degrade to `null` on any error so the dashboard never hard-fails offline.
 * Docs: https://www.isric.org/explore/soilgrids · https://open-meteo.com/en/docs
 */

import {
  decodeSoilGrids,
  finiteOrNull,
  usdaTextureClass,
  type SoilProfile,
  type LiveSoil,
} from "../models/soilModel";
import { timedSignal, SOIL_TIMEOUT_MS } from "./abortTimeout";

const SOILGRIDS = "https://rest.isric.org/soilgrids/v2.0/properties/query";
const OPEN_METEO = "https://api.open-meteo.com/v1/forecast";
const DEPTH = "0-5cm";

/** SoilGrids properties we read, with how each decoded value maps onto SoilProfile. */
const SOILGRIDS_PROPS = ["phh2o", "soc", "sand", "silt", "clay", "cec", "bdod"] as const;

interface SoilGridsLayer {
  name: string;
  unit_measure?: { d_factor?: number };
  depths?: Array<{ label?: string; values?: { mean?: number | null } }>;
}
interface SoilGridsResponse {
  properties?: { layers?: SoilGridsLayer[] };
}

/** Decode a layer's requested-depth mean into target units via its own d_factor. */
function decodeLayer(layer: SoilGridsLayer | undefined): number | null {
  // Select the depth by label, not position — guards against API reordering.
  const depth =
    layer?.depths?.find((d) => d.label === DEPTH) ?? layer?.depths?.[0];
  const mapped = depth?.values?.mean;
  const dFactor = layer?.unit_measure?.d_factor;
  if (mapped == null || dFactor == null) return null;
  const v = decodeSoilGrids(mapped, dFactor);
  return Number.isFinite(v) ? v : null;
}

/**
 * Fetch the 0–5 cm soil profile for a coordinate from SoilGrids.
 * Returns null on any network/parse failure (graceful offline).
 */
export async function fetchSoilProfile(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<SoilProfile | null> {
  try {
    const params = new URLSearchParams();
    params.set("lat", latitude.toFixed(4));
    params.set("lon", longitude.toFixed(4));
    for (const p of SOILGRIDS_PROPS) params.append("property", p);
    params.append("depth", DEPTH);
    params.append("value", "mean");

    const res = await fetch(`${SOILGRIDS}?${params}`, {
      signal: timedSignal(SOIL_TIMEOUT_MS, signal),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as SoilGridsResponse;
    const layers = json.properties?.layers ?? [];
    const byName = (name: string) => layers.find((l) => l.name === name);

    // SoilGrids reports sand/silt/clay with target_units already "%" (verified
    // live against the API's unit_measure) — the d_factor decode IS the percent.
    // Do NOT divide again; that was a unit-trap (clay 22.5% → 2.25%).
    const sandPct = decodeLayer(byName("sand"));
    const siltPct = decodeLayer(byName("silt"));
    const clayPct = decodeLayer(byName("clay"));

    const texture =
      sandPct != null && siltPct != null && clayPct != null
        ? usdaTextureClass(sandPct, siltPct, clayPct)
        : null;

    const phH2O = decodeLayer(byName("phh2o"));
    const socGkg = decodeLayer(byName("soc"));
    const cecCmolKg = decodeLayer(byName("cec"));
    const bulkDensityKgDm3 = decodeLayer(byName("bdod"));

    // A 200 with every field null (e.g. an ocean coordinate) is not a profile —
    // return null so the panel shows "unavailable" instead of seeding the agent
    // with all-empty data.
    const anyValue =
      phH2O != null ||
      socGkg != null ||
      sandPct != null ||
      siltPct != null ||
      clayPct != null ||
      cecCmolKg != null ||
      bulkDensityKgDm3 != null;
    if (!anyValue) return null;

    return {
      depthLabel: "0–5 cm",
      phH2O,
      socGkg,
      sandPct,
      siltPct,
      clayPct,
      cecCmolKg,
      bulkDensityKgDm3,
      texture,
    };
  } catch {
    return null;
  }
}

interface OpenMeteoSoilResponse {
  current?: {
    soil_moisture_0_to_1cm?: number;
    soil_moisture_3_to_9cm?: number;
    soil_temperature_0cm?: number;
  };
}

/**
 * Fetch current surface soil moisture + temperature from Open-Meteo.
 * Returns null on failure (graceful offline).
 */
export async function fetchLiveSoil(
  latitude: number,
  longitude: number,
  signal?: AbortSignal,
): Promise<LiveSoil | null> {
  try {
    const params = new URLSearchParams({
      latitude: latitude.toFixed(4),
      longitude: longitude.toFixed(4),
      current: [
        "soil_moisture_0_to_1cm",
        "soil_moisture_3_to_9cm",
        "soil_temperature_0cm",
      ].join(","),
      timezone: "auto",
    });
    const res = await fetch(`${OPEN_METEO}?${params}`, {
      signal: timedSignal(SOIL_TIMEOUT_MS, signal),
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as OpenMeteoSoilResponse;
    const c = json.current ?? {};
    const live: LiveSoil = {
      // Volumetric moisture is a fraction → clamp to [0, 1]; temp just finite.
      moisture0to1: finiteOrNull(c.soil_moisture_0_to_1cm, 0, 1),
      moisture3to9: finiteOrNull(c.soil_moisture_3_to_9cm, 0, 1),
      soilTempC: finiteOrNull(c.soil_temperature_0cm),
    };
    if (live.moisture0to1 == null && live.moisture3to9 == null && live.soilTempC == null) {
      return null;
    }
    return live;
  } catch {
    return null;
  }
}
