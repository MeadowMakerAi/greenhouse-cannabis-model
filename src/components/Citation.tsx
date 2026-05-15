import { useState } from "react";

/**
 * Inline citation marker for the dashboard. Renders a small superscript
 * `[n]` next to a headline number; click expands a popover with the
 * primary source. Defends the project's moat — every coefficient is
 * peer-reviewed, this surface makes that visible. Full bibliography
 * lives in CITATIONS.md.
 *
 * Usage:
 *   <span>3.2 lb/ft²/yr <Citation id="yield-dli" /></span>
 */

type CitationEntry = {
  /** Display title — author + year is ideal. */
  title: string;
  /** Source URL (DOI, journal, institution). */
  url?: string;
  /** One-line description of what this source contributes to the model. */
  what: string;
  /** Optional model-file pointer so a curious user can read the code. */
  modelFile?: string;
};

export const CITATIONS: Record<string, CitationEntry> = {
  "yield-dli": {
    title: "Rodriguez-Morrison, Llewellyn & Zheng (2021), Univ. of Guelph",
    url: "https://doi.org/10.3389/fpls.2021.646020",
    what: "Linear yield-DLI relationship up to ~70 mol/m²/d. Baseline of the yield model.",
    modelFile: "src/models/yieldModel.ts",
  },
  "topt-photosynthesis": {
    title: "Chandra et al. (2008), Univ. of Mississippi",
    url: "https://doi.org/10.1007/s12298-008-0027-x",
    what: "Cannabis leaf-level photosynthesis temperature optimum ≈ 30 °C / 86 °F.",
    modelFile: "src/models/plantGrowthModel.ts",
  },
  "co2-enrichment": {
    title: "Chandra et al. (2008), Univ. of Mississippi",
    url: "https://doi.org/10.1007/s12298-008-0027-x",
    what: "CO₂ enrichment net photosynthesis boost coefficients.",
    modelFile: "src/models/co2Model.ts",
  },
  "stack-vent": {
    title: "ANSI/ASAE EP406.4 — ASABE (2018)",
    url: "https://www.asabe.org/Publications/Standards",
    what: "Stack-effect natural ventilation. Cd = 0.65, paired-vent harmonic-mean effective area, ΔH between vent centers.",
    modelFile: "src/models/simulationModel.ts",
  },
  "kaspro-energy-balance": {
    title: "Bot (1983), Wageningen Univ. — KASPRO lineage",
    url: "https://research.wur.nl/en/publications/greenhouse-climate-from-physical-processes-to-a-dynamic-model",
    what: "Greenhouse energy-balance + dynamic-climate framework underlying the simulation loop.",
    modelFile: "src/models/simulationModel.ts",
  },
  "wet-bulb-stull": {
    title: "Stull (2011), Univ. of British Columbia",
    url: "https://doi.org/10.1175/JAMC-D-11-0143.1",
    what: "Wet-bulb temperature from T and RH (~0.3 °C accuracy). Drives evap-cooling feasibility.",
    modelFile: "src/models/psychrometricModel.ts",
  },
  "vapor-pressure": {
    title: "Tetens / Magnus / August-Roche-Magnus formulation",
    what: "Saturation vapor pressure → VPD calculation. Industry-standard psychrometric form.",
    modelFile: "src/models/psychrometricModel.ts",
  },
  "thermal-screen": {
    title: "UMass Center for Agriculture, Food & Environment",
    url: "https://ag.umass.edu/greenhouse-floriculture/fact-sheets/energy-conservation-in-greenhouse",
    what: "Thermal screen / energy curtain: 30–50 % overnight heat-loss reduction.",
  },
  "pathogen-bands": {
    title: "Punja & Lung (Simon Fraser); UMass + Penn State Extension",
    what: "Botrytis dewpoint-margin + powdery mildew RH/temp threshold bands.",
    modelFile: "src/models/pathogenModel.ts",
  },
  "sun-spencer": {
    title: "Spencer (1971) — Fourier-series solar declination",
    what: "Sub-day sun position used in the live simulation.",
    modelFile: "src/models/photoperiodModel.ts",
  },
};

type CitationId = keyof typeof CITATIONS;

interface Props {
  id: CitationId;
  /**
   * Display variant. `marker` = superscript [n]-style icon (default).
   * `inline` = small "view source" pill for use under headline numbers.
   */
  variant?: "marker" | "inline";
}

export default function Citation({ id, variant = "marker" }: Props) {
  const [open, setOpen] = useState(false);
  const entry = CITATIONS[id];
  if (!entry) return null;

  const label = variant === "inline" ? "📖 source" : "[src]";

  return (
    <span className="relative inline-block align-baseline">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((s) => !s);
        }}
        title={entry.title}
        className={
          variant === "inline"
            ? "ml-1 inline-flex items-center gap-0.5 rounded-sm border border-ink-200 bg-white/60 px-1 py-[1px] text-[10px] font-medium text-ink-500 hover:border-leaf-500 hover:text-leaf-700"
            : "ml-0.5 inline-flex items-center text-[10px] font-medium text-leaf-700 hover:underline"
        }
      >
        {label}
      </button>
      {open && (
        <span
          className="absolute z-30 mt-1 w-72 rounded-md border border-ink-300/60 bg-white p-3 text-left text-[11px] leading-snug text-ink-800 shadow-lg"
          style={{ right: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="block text-[10px] font-semibold uppercase tracking-wider text-ink-500">
            Source
          </span>
          <span className="mt-0.5 block font-semibold text-ink-900">
            {entry.title}
          </span>
          <span className="mt-1 block text-ink-700">{entry.what}</span>
          <span className="mt-2 flex flex-wrap items-center gap-2 text-[10px]">
            {entry.url && (
              <a
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-leaf-700 underline"
              >
                read paper
              </a>
            )}
            {entry.modelFile && (
              <span className="font-mono text-ink-500" title="Model file">
                {entry.modelFile}
              </span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-ink-500 hover:text-ink-900"
            >
              close
            </button>
          </span>
        </span>
      )}
    </span>
  );
}
