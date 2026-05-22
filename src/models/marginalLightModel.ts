/**
 * Marginal economics of adding supplemental light.
 *
 * Cannabis yield rises ~linearly with light with no biological plateau in
 * the practical range (Rodriguez-Morrison 2021) — so hitting the DLI
 * target is a floor, not the answer. This model answers "is the next
 * increment of light worth it?"
 *
 * Marginal yield comes from the project's own yield curve (projectYield
 * evaluated at the base DLI and at base + ΔDLI) — never a borrowed
 * coefficient. Marginal cost is the supplemental-lighting energy needed
 * to deliver the extra DLI at the given fixture efficacy:
 *   extra kWh = ΔDLI · canopy m² · 365 d · 1e6 / efficacy(µmol/J) / 3.6e6
 * Energy only — demand charges add more, so costPerExtraGram is a floor.
 */
import { projectYield, type YieldInput } from "./yieldModel";

const M2_PER_FT2 = 1 / 10.7639;
const J_PER_KWH = 3.6e6;
const DAYS_PER_YEAR = 365;

export interface MarginalLightStep {
  /** DLI increment evaluated, mol/m²/day. */
  deltaDLI: number;
  /** Extra dry-flower harvest, grams per year. */
  extraGrams: number;
  /** Extra supplemental-lighting energy, kWh per year. */
  extraKwh: number;
  /** Extra electricity cost, USD per year. */
  extraCost: number;
  /** Electricity cost per extra gram, USD. Energy only — a floor. */
  costPerExtraGram: number;
}

export interface MarginalLightInput {
  /** Current annual DLI delivered at canopy, mol/m²/yr. */
  annualDLIMolM2: number;
  /** Canopy area, ft². */
  canopyAreaSqFt: number;
  /** Supplemental-fixture efficacy, µmol/J. */
  fixtureEfficacy: number;
  /** Delivered electricity rate, $/kWh. */
  electricityRatePerKwh: number;
  /** Yield-model args shared with projectYield (all but annualDLIMolM2). */
  yieldArgs: Omit<YieldInput, "annualDLIMolM2">;
  /** DLI increments to evaluate, mol/m²/day. */
  deltaDLISteps: number[];
}

export function marginalLightEconomics(
  input: MarginalLightInput,
): MarginalLightStep[] {
  const canopyM2 = input.canopyAreaSqFt * M2_PER_FT2;
  const baseKg = projectYield({
    annualDLIMolM2: input.annualDLIMolM2,
    ...input.yieldArgs,
  }).totalAnnualKg;

  return input.deltaDLISteps.map((deltaDLI) => {
    const bumpedKg = projectYield({
      annualDLIMolM2: input.annualDLIMolM2 + deltaDLI * DAYS_PER_YEAR,
      ...input.yieldArgs,
    }).totalAnnualKg;
    const extraGrams = Math.max(0, (bumpedKg - baseKg) * 1000);
    const extraMolPhotons = deltaDLI * canopyM2 * DAYS_PER_YEAR;
    const extraKwh =
      input.fixtureEfficacy > 0
        ? (extraMolPhotons * 1e6) / input.fixtureEfficacy / J_PER_KWH
        : 0;
    const extraCost = extraKwh * input.electricityRatePerKwh;
    const costPerExtraGram = extraGrams > 0 ? extraCost / extraGrams : 0;
    return { deltaDLI, extraGrams, extraKwh, extraCost, costPerExtraGram };
  });
}
