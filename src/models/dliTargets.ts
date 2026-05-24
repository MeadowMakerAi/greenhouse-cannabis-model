/**
 * Cannabis "indoor-quality" DLI thresholds — three sourced anchors
 * that the dashboard uses as the literature-grounded ruler for
 * comparing whatever target DLI the operator dials in.
 *
 * These are the bands where you can defend the claim that a
 * greenhouse-grown plant has the density, morphology, resin content,
 * and yield of a high-PPFD indoor grow. They are NOT cannabinoid-
 * potency targets — see CITATIONS.md: light intensity drives yield
 * and bud structure, not THC%.
 *
 * All values assume the standard 12 h flower photoperiod.
 *
 * Sources (all in CITATIONS.md):
 *
 *   FLOOR (Llewellyn et al. 2022, Frontiers in Plant Science) —
 *     yield response was linear up to canopy PPFD 1000 µmol/m²/s
 *     (DLI ~43.2 at 12 h photoperiod), with photon conversion
 *     efficiency held flat at 0.25 g/mol across 600/800/1000 PPFD.
 *     This is the operational floor for "indoor quality" — below
 *     this, you're under-lighting vs. an indoor benchmark.
 *
 *   OPTIMAL (Chandra et al. 2008, Phys. Mol. Biol. Plants) —
 *     leaf-level net photosynthesis Pn unsaturated up to PPFD
 *     1500 µmol/m²/s (DLI ~64.8 at 12 h). Above this the leaf is
 *     photon-saturated; whole-plant yield can still climb (see
 *     CEILING) but per-photon efficiency starts to fall.
 *
 *   CEILING (Rodriguez-Morrison et al. 2021, Frontiers in Plant
 *     Science) — dry inflorescence yield increased linearly with
 *     canopy PPFD up to 1800 µmol/m²/s (DLI ~77.8 at 12 h), even
 *     though leaf-level Pn saturated well below that. THC% did not
 *     change with PPFD. This is the whole-plant yield ceiling
 *     beyond which no peer-reviewed cannabis study has demonstrated
 *     additional yield gain.
 */

export interface DLITarget {
  /** Threshold in mol PAR / m² / day (12 h photoperiod basis). */
  dli: number;
  /** PPFD equivalent in µmol/m²/s at 12 h photoperiod. */
  ppfdAt12h: number;
  /** Short human-readable label. */
  label: string;
  /** One-line description for tooltips. */
  description: string;
  /** Citation string — keep terse; CITATIONS.md has the full list. */
  source: string;
}

export const INDOOR_QUALITY_FLOOR: DLITarget = {
  dli: 43.2,
  ppfdAt12h: 1000,
  label: "Indoor-quality floor",
  description:
    "Below this you're under-lighting vs. a 1000 PPFD indoor benchmark. Yield response is linear through this band at constant photon conversion efficiency.",
  source: "Llewellyn et al. 2022, Frontiers in Plant Science",
};

export const LEAF_SATURATION: DLITarget = {
  dli: 64.8,
  ppfdAt12h: 1500,
  label: "Leaf-saturation onset",
  description:
    "Leaf-level photosynthesis stops climbing here. Whole-plant yield can still grow above this point (see ceiling) but per-photon efficiency falls.",
  source: "Chandra et al. 2008, Phys. Mol. Biol. Plants",
};

export const YIELD_CEILING: DLITarget = {
  dli: 77.8,
  ppfdAt12h: 1800,
  label: "Yield ceiling (observed)",
  description:
    "Highest canopy PPFD where dry inflorescence yield still scaled linearly in peer-reviewed cannabis literature. Above this, no published study demonstrates additional gain.",
  source: "Rodriguez-Morrison et al. 2021, Frontiers in Plant Science",
};

/**
 * Ordered list of the three sourced bands — convenient for rendering
 * a sequenced band-ruler. Order: floor → leaf-saturation → ceiling.
 */
export const DLI_BANDS: readonly DLITarget[] = [
  INDOOR_QUALITY_FLOOR,
  LEAF_SATURATION,
  YIELD_CEILING,
] as const;

/**
 * Classify an operating DLI against the sourced bands. Useful for
 * picking a color or tag without re-implementing the threshold checks.
 */
export type DLIBandPosition =
  | "below-floor"
  | "in-floor-band"
  | "in-optimal-band"
  | "in-ceiling-band"
  | "above-ceiling";

export function classifyDLI(dli: number): DLIBandPosition {
  if (dli < INDOOR_QUALITY_FLOOR.dli) return "below-floor";
  if (dli < LEAF_SATURATION.dli) return "in-floor-band";
  if (dli < YIELD_CEILING.dli) return "in-optimal-band";
  if (dli <= YIELD_CEILING.dli * 1.05) return "in-ceiling-band"; // ±5% tolerance
  return "above-ceiling";
}
