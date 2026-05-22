import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { yieldRealismCases } from "../data/yieldRealism";
import { marginalLightEconomics } from "../models/marginalLightModel";
import { fmtCurrency } from "../utils/formatting";
import Citation from "./Citation";

/**
 * "Is more light worth it?" — marginal economics of supplemental light.
 *
 * Somersault item 3. The marginal math lives in models/marginalLightModel
 * (pure + tested); this component only renders it. Cannabis yield rises
 * ~linearly with light with no plateau in range (Rodriguez-Morrison 2021),
 * so hitting the DLI target is a floor — the real question is whether the
 * NEXT increment of light pays for itself.
 */
const G_PER_LB = 453.592;

export default function MarginalLightPanel() {
  const { inputs } = useScenario();
  const d = useDerived();

  const steps = marginalLightEconomics({
    annualDLIMolM2: d.annualDLIMolM2,
    canopyAreaSqFt: inputs.canopyAreaSqFt,
    fixtureEfficacy: d.fixture.ppe,
    electricityRatePerKwh: inputs.electricityRatePerKwh,
    yieldArgs: {
      meanFlowerDayTempF: inputs.indoorTargetDryBulbF,
      co2Ppm: inputs.co2SetpointPpm,
      co2Enabled: inputs.co2Enabled,
      cyclesPerYear: inputs.cyclesPerYear,
      canopyAreaSqFt: inputs.canopyAreaSqFt,
      realismFactor: yieldRealismCases[inputs.yieldRealismCase].multiplier,
    },
    deltaDLISteps: [5, 10, 15],
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
