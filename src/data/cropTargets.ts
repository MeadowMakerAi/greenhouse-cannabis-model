export interface CropTarget {
  id: string;
  label: string;
  targetDLI: number;
  /**
   * Canopy PPFD that delivers `targetDLI` over a 12-hour flower photoperiod.
   * DLI = PPFD x hours x 0.0036, so at 12 h: PPFD = DLI / 0.0432.
   * Verified against [[reference-cannabis-dli-light-science]] — light drives
   * bud density, structure, and yield, NOT cannabinoid/terpene %.
   */
  targetTopCanopyPPFD: number;
  /** Plain-language: what this light level actually buys the grower. */
  description: string;
}

export const cropTargets: Record<string, CropTarget> = {
  minimumFlower: {
    id: "minimumFlower",
    label: "Greenhouse baseline",
    targetDLI: 30,
    targetTopCanopyPPFD: 700,
    description:
      "About 700 umol/m2/s of light at the canopy on a 12-hour flower day. " +
      "This is the floor for usable bud density — below it, flower runs airy " +
      "and loose. Workable greenhouse-grade flower, but not reliably indoor-grade.",
  },
  commercialPremium: {
    id: "commercialPremium",
    label: "Indoor-grade flower",
    targetDLI: 40,
    targetTopCanopyPPFD: 925,
    description:
      "About 925 umol/m2/s at the canopy on a 12-hour flower day. This is where " +
      "greenhouse flower reliably reaches indoor-grade density and structure. " +
      "Yield keeps climbing above this level — the limit is electricity cost, " +
      "not the plant.",
  },
  co2Enhanced: {
    id: "co2Enhanced",
    label: "Indoor-grade + CO₂ boost",
    targetDLI: 50,
    targetTopCanopyPPFD: 1150,
    description:
      "About 1,150 umol/m2/s at the canopy on a 12-hour flower day. Higher light " +
      "only pays off with CO₂ enrichment (1,000-1,200 ppm) plus tight VPD, " +
      "irrigation, and cooling control. Drives yield and bud size — not " +
      "potency, which is set by genetics.",
  },
};
