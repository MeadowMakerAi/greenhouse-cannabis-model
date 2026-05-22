import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { projectYield } from "../models/yieldModel";
import { fmtCurrency } from "../utils/formatting";
import Citation from "./Citation";

/**
 * "Is more light worth it?" — marginal economics of supplemental light.
 *
 * Somersault item 3. Cannabis yield rises ~linearly with light, with no
 * plateau in the practical range (Rodriguez-Morrison 2021). So hitting the
 * DLI target is a floor, not the answer — above it, the real question is
 * whether the NEXT increment of light pays for itself.
 *
 * Marginal yield comes from the project's own yield curve (projectYield
 * called twice, base vs bumped) — never a borrowed coefficient. Marginal
 * cost is the supplemental-lighting energy to deliver the extra DLI:
 *   extra kWh = ΔDLI · canopy m² · 365 d · 1e6 / efficacy(µmol/J) / 3.6e6
 * Energy only — demand charges add more, so the $/g shown is a floor.
 */
const G_PER_LB = 453.592;

export default function MarginalLightPanel() {
  const { inputs } = useScenario();
  const d = useDerived();

  const canopyM2 = inputs.canopyAreaSqFt / 10.7639;
  const efficacy = d.fixture.ppe; // µmol/J

  const yieldArgs = {
    meanFlowerDayTempF: inputs.indoorTargetDryBulbF,
    co2Ppm: inputs.co2SetpointPpm,
    co2Enabled: inputs.co2Enabled,
    cyclesPerYear: inputs.cyclesPerYear,
    canopyAreaSqFt: inputs.canopyAreaSqFt,
  };
  const baseKg = projectYield({
    annualDLIMolM2: d.annualDLIMolM2,
    ...yieldArgs,
  }).totalAnnualKg;

  const steps = [5, 10, 15].map((deltaDLI) => {
    const bumpedKg = projectYield({
      annualDLIMolM2: d.annualDLIMolM2 + deltaDLI * 365,
      ...yieldArgs,
    }).totalAnnualKg;
    const extraGrams = Math.max(0, (bumpedKg - baseKg) * 1000);
    const extraMolPhotons = deltaDLI * canopyM2 * 365;
    const extraKwh =
      efficacy > 0 ? (extraMolPhotons * 1e6) / efficacy / 3.6e6 : 0;
    const extraCost = extraKwh * inputs.electricityRatePerKwh;
    const costPerExtraGram = extraGrams > 0 ? extraCost / extraGrams : 0;
    return { deltaDLI, extraGrams, extraCost, costPerExtraGram };
  });

  const firstStep = steps[0];
  const worthIt = firstStep.costPerExtraGram > 0 && firstStep.costPerExtraGram < 1;

  return (
    <div className="card">
      <div className="card-header">
        <div className="text-sm font-semibold text-ink-900">
          Is more light worth it?
        </div>
        <p className="mt-0.5 text-[11px] leading-snug text-ink-500">
          Hitting your DLI target is the floor for indoor-grade bud — not the
          end of the story. Yield keeps rising with light, so the real question
          is whether the next increment pays for itself.
        </p>
      </div>
      <div className="card-body space-y-3">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-ink-500">
              <th className="py-1 text-left font-medium">Add light</th>
              <th className="py-1 text-right font-medium">Extra harvest</th>
              <th className="py-1 text-right font-medium">Extra power cost</th>
              <th className="py-1 text-right font-medium">Cost / extra gram</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => (
              <tr key={s.deltaDLI} className="border-t border-ink-200/70">
                <td className="py-1.5 text-left">+{s.deltaDLI} DLI</td>
                <td className="py-1.5 text-right">
                  +{(s.extraGrams / G_PER_LB).toFixed(1)} lb/yr
                </td>
                <td className="py-1.5 text-right">
                  +{fmtCurrency(s.extraCost)}/yr
                </td>
                <td className="py-1.5 text-right font-semibold text-ink-900">
                  ${s.costPerExtraGram.toFixed(2)} /g
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="text-[11px] leading-relaxed text-ink-600">
          Adding 5 more DLI costs about{" "}
          <span className="font-semibold text-ink-900">
            ${firstStep.costPerExtraGram.toFixed(2)} in electricity per extra
            gram
          </span>{" "}
          of dry flower (just the power for the extra fixtures — no added
          labor or nutrients).{" "}
          {worthIt
            ? "Wholesale flower runs well above that, so more light keeps paying for itself."
            : "Compare that against your wholesale price per gram before adding fixtures."}{" "}
          Cannabis yield rises with light with no biological plateau in this
          range <Citation id="yield-dli" /> — the ceiling is how much fixture,
          power, and cooling you can install and afford, not the plant. Power
          cost only; demand charges push the real figure a little higher.
        </p>
      </div>
    </div>
  );
}
