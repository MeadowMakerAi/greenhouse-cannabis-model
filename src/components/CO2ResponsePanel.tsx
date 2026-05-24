import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmt1, fmtInt } from "../utils/formatting";
import DLIBandTile from "./DLIBandTile";

export default function CO2ResponsePanel() {
  const { inputs } = useScenario();
  const d = useDerived();
  const co2 = d.co2;

  return (
    <div className="space-y-3">
      {/* Sourced DLI band ruler — anchor the operator's target against
          the three peer-reviewed cannabis DLI thresholds and show the
          CO₂ yield-equivalent uplift inline. Renders first so the
          ruler is the first thing the eye lands on. */}
      <DLIBandTile />

      <div className="card">
        <div className="card-header">
          <span>CO₂ feasibility · {inputs.co2SetpointPpm} ppm · {inputs.ventilationMode.replace("_", " ")}</span>
          <span className={`tag ${co2.feasible ? "tag-info" : "tag-warn"}`}>
            {co2.feasible ? "Feasible" : "Infeasible"}
          </span>
        </div>
        <div className="card-body grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Recommended DLI</div>
            <div className="text-xl font-semibold">
              {fmt1(co2.recommendedDLIRangeMin)}–{fmt1(co2.recommendedDLIRangeMax)}
            </div>
            <div className="text-xs text-ink-500">mol/m²/d</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Recommended PPFD</div>
            <div className="text-xl font-semibold">
              {fmtInt(co2.recommendedPPFDRangeMin)}–{fmtInt(co2.recommendedPPFDRangeMax)}
            </div>
            <div className="text-xs text-ink-500">µmol/m²/s @ 12h</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Active target DLI</div>
            <div className="text-xl font-semibold">{d.target.targetDLI}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Ventilation mode</div>
            <div className="text-xl font-semibold capitalize">{inputs.ventilationMode.replace("_", " ")}</div>
          </div>
        </div>
      </div>

      {co2.warnings.length > 0 && (
        <div className="card">
          <div className="card-header">CO₂ warnings</div>
          <div className="card-body space-y-1 text-sm text-ink-700">
            {co2.warnings.map((w, i) => (
              <div key={i} className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-warn-500" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">Operating windows</div>
        <div className="card-body grid grid-cols-2 gap-3 md:grid-cols-4">
          {d.months.map((m) => {
            const compatible =
              inputs.co2Enabled &&
              !["open_vented", "moderate"].includes(inputs.ventilationMode) &&
              !m.highHumidityRisk;
            return (
              <span
                key={m.month}
                className={`tag ${compatible ? "tag-info" : m.highHumidityRisk ? "tag-warn" : "tag-muted"}`}
              >
                {m.monthLabel}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
