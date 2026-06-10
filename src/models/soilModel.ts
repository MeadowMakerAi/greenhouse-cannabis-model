/**
 * Soil model — pure, deterministic. No I/O, no LLM.
 *
 * Two responsibilities:
 *  1. Decode SoilGrids' mapped integers to real units using the layer's OWN
 *     `d_factor` (never a hard-coded constant — the API tells us the factor).
 *  2. Classify a sand/silt/clay mix into a USDA texture class.
 *
 * The texture boundaries are the published USDA-NRCS Soil Survey Manual
 * texture triangle — a definitional standard, not an empirical coefficient.
 * See CITATIONS.md → "Soil texture (USDA-NRCS)" and "SoilGrids 2.0".
 */

export type TextureClass =
  | "sand"
  | "loamy sand"
  | "sandy loam"
  | "loam"
  | "silt loam"
  | "silt"
  | "sandy clay loam"
  | "clay loam"
  | "silty clay loam"
  | "sandy clay"
  | "silty clay"
  | "clay";

/**
 * Decode a SoilGrids mapped value to its target units.
 * SoilGrids ships integers scaled by a per-layer `d_factor` (e.g. pH×10).
 * Real value = mapped / d_factor. This is the unit-trap guard: the same class
 * of bug as reading NASA POWER MJ as kWh — always divide by the API's factor.
 */
export function decodeSoilGrids(mapped: number, dFactor: number): number {
  if (!Number.isFinite(mapped) || !Number.isFinite(dFactor) || dFactor === 0) {
    return NaN;
  }
  return mapped / dFactor;
}

/**
 * A value from an external API is trustworthy only if it's a finite number and
 * (optionally) within a physical range. Anything else → null, never a bogus
 * reading that poisons downstream reasoning. Guards Open-Meteo soil fields.
 */
export function finiteOrNull(
  v: number | null | undefined,
  min = -Infinity,
  max = Infinity,
): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

/**
 * USDA texture class from sand/silt/clay percentages.
 * Inputs are percentages (0–100); they are renormalised to sum to 100 first so
 * SoilGrids fractions (which can sum to slightly off 100 after rounding) land
 * in the right bin. Boundaries follow the USDA-NRCS texture triangle, evaluated
 * clay-rich → sand-rich so the first match wins.
 */
export function usdaTextureClass(
  sandPct: number,
  siltPct: number,
  clayPct: number,
): TextureClass | null {
  if (
    !Number.isFinite(sandPct) ||
    !Number.isFinite(siltPct) ||
    !Number.isFinite(clayPct)
  ) {
    return null;
  }
  const sum = sandPct + siltPct + clayPct;
  if (sum <= 0) return null;
  // Renormalise to 100 so the boundary inequalities are exact.
  const sand = (sandPct / sum) * 100;
  const silt = (siltPct / sum) * 100;
  const clay = (clayPct / sum) * 100;

  // Clay-rich classes first.
  if (clay >= 40 && silt >= 40) return "silty clay";
  if (clay >= 40 && sand <= 45 && silt < 40) return "clay";
  if (clay >= 35 && sand >= 45) return "sandy clay";
  if (clay >= 27 && clay < 40 && sand > 20 && sand <= 45) return "clay loam";
  if (clay >= 27 && clay < 40 && sand <= 20) return "silty clay loam";
  if (clay >= 20 && clay < 35 && silt < 28 && sand > 45) return "sandy clay loam";

  // Loam band.
  if (clay >= 7 && clay < 27 && silt >= 28 && silt < 50 && sand <= 52)
    return "loam";
  if (silt >= 80 && clay < 12) return "silt";
  if (silt >= 50 && ((clay >= 12 && clay < 27) || (silt < 80 && clay < 12)))
    return "silt loam";

  // Sandy loam: two USDA sub-rules.
  if (
    (clay >= 7 && clay <= 20 && sand > 52 && silt + 2 * clay >= 30) ||
    (clay < 7 && silt < 50 && silt + 2 * clay >= 30)
  ) {
    return "sandy loam";
  }

  // Sandiest classes last.
  if (silt + 1.5 * clay < 15) return "sand";
  if (silt + 2 * clay < 30) return "loamy sand";

  // Anything left in the loam interior.
  return "sandy loam";
}

/** A decoded SoilGrids profile at one depth interval. `null` = not returned. */
export interface SoilProfile {
  /** Depth interval label, e.g. "0–5 cm". */
  depthLabel: string;
  /** Soil pH in water. */
  phH2O: number | null;
  /** Soil organic carbon, g/kg. */
  socGkg: number | null;
  /** Sand fraction, %. */
  sandPct: number | null;
  /** Silt fraction, %. */
  siltPct: number | null;
  /** Clay fraction, %. */
  clayPct: number | null;
  /** Cation exchange capacity, cmol(c)/kg. */
  cecCmolKg: number | null;
  /** Bulk density of the fine earth fraction, kg/dm³. */
  bulkDensityKgDm3: number | null;
  /** USDA texture class derived from sand/silt/clay (null if any missing). */
  texture: TextureClass | null;
}

/** Live soil state at the surface (Open-Meteo). `null` = not returned. */
export interface LiveSoil {
  /** Volumetric soil moisture 0–1 cm, m³/m³. */
  moisture0to1: number | null;
  /** Volumetric soil moisture 3–9 cm, m³/m³. */
  moisture3to9: number | null;
  /** Soil temperature at 0 cm, °C. */
  soilTempC: number | null;
}
