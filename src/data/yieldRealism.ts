/**
 * Yield-realism scenarios.
 *
 * The yield model projects a "dialed-in" operation — ideal cultivar, tight
 * VPD/irrigation discipline, no pathogen losses. yieldModel.ts's own note
 * puts real operations 20-50% below that ceiling. These four cases let an
 * operator pick the scenario they're actually planning against; the
 * multiplier scales the model's projection, which in turn drives the
 * harvest figures and the power-cost-per-gram crown.
 *
 * These are planning scenarios the operator chooses — NOT measured values.
 * The −15 / −30 / −45 % haircuts sit inside the model's cited 20-50 % band.
 */
export type YieldRealismCase =
  | "dialedIn"
  | "optimistic"
  | "base"
  | "conservative";

export interface YieldRealism {
  id: YieldRealismCase;
  label: string;
  /** Multiplier applied to the model's dialed-in yield projection. */
  multiplier: number;
  description: string;
}

export const yieldRealismCases: Record<YieldRealismCase, YieldRealism> = {
  dialedIn: {
    id: "dialedIn",
    label: "Dialed-in (model ceiling)",
    multiplier: 1.0,
    description:
      "The model's best case — ideal cultivar, tight VPD and irrigation, " +
      "no pathogen loss. Few operations hit this every cycle.",
  },
  optimistic: {
    id: "optimistic",
    label: "Optimistic",
    multiplier: 0.85,
    description:
      "A strong operator on a good run — roughly 15% below the dialed-in " +
      "ceiling.",
  },
  base: {
    id: "base",
    label: "Base case",
    multiplier: 0.7,
    description:
      "A competent commercial operation with normal losses — about 30% " +
      "below the model ceiling. The honest default for planning.",
  },
  conservative: {
    id: "conservative",
    label: "Conservative",
    multiplier: 0.55,
    description:
      "Real-world with meaningful losses — pathogen pressure, cultivar " +
      "variance, learning curve. About 45% below the ceiling.",
  },
};
