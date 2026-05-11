import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import {
  generateRecommendations,
  type FixtureCostRow,
  type Recommendation,
} from "../models/optimizationModel";
import { DAYS_IN_MONTH } from "../utils/formatting";

const SEVERITY_STYLE: Record<Recommendation["severity"], { tag: string; bar: string; chip: string }> = {
  savings: { tag: "tag-info", bar: "bg-leaf-500", chip: "Savings" },
  sizing: { tag: "tag-muted", bar: "bg-ink-500", chip: "Sizing" },
  warn: { tag: "tag-warn", bar: "bg-warn-500", chip: "Risk" },
  info: { tag: "tag-muted", bar: "bg-ink-300", chip: "Note" },
};

const CATEGORY_LABEL: Record<string, string> = {
  lighting: "Lighting",
  co2: "CO₂ enrichment",
  ventilation: "Ventilation",
  shade: "Shade strategy",
  heating: "Radiant heating",
  cooling: "Mechanical cooling",
  dehumid: "Dehumidification",
  envelope: "Envelope upgrade",
};

export default function OptimizedSystemPanel() {
  const { inputs, setInputs } = useScenario();
  const all = useAllFixtures();
  const d = useDerived();

  const fixtureCosts: FixtureCostRow[] = Object.values(all).map((f) => {
    let kwh = 0;
    let cost = 0;
    let peakKW = 0;
    let peakFixtures = 0;
    d.months.forEach((m, idx) => {
      const sized = fixtureKWFromPPFD({
        supplementalPPFDRequired: m.supplementalPPFDRequired,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        fixture: f,
        photoperiodHours: inputs.flowerPhotoperiodHours,
        electricityRatePerKwh: inputs.electricityRatePerKwh,
        daysInMonth: DAYS_IN_MONTH[idx],
      });
      kwh += sized.monthlyKwh;
      cost += sized.monthlyCostUSD;
      peakKW = Math.max(peakKW, sized.installedKW);
      peakFixtures = Math.max(peakFixtures, sized.fixtureCount);
    });
    // Codex P1: fold demand cost into the rank so the recommender
    // matches what the user sees in the dashboard. Without this, a
    // lower-PPE fixture with similar kWh could win on energy alone
    // and lose by hundreds of $ once the utility's demand charge is
    // applied — silently bad capex advice.
    const demandCost = peakKW * inputs.demandChargePerKwMonth * 12;
    return {
      id: f.id,
      fixture: f,
      annualCostUSD: cost + demandCost,
      annualKwh: kwh,
      peakKW,
      peakFixtures,
    };
  });

  const currentCost =
    fixtureCosts.find((r) => r.id === inputs.fixtureId)?.annualCostUSD ?? 0;
  const evapFailureMonths = d.months.filter((m) => !m.evapReachesTarget).length;
  const highHumidityMonths = d.months.filter((m) => m.highHumidityRisk).length;
  const peakDehumidPintsPerDay = Math.max(...d.months.map((m) => m.dehumidPintsPerDay));
  const peakCoolingBTUhr = Math.max(...d.months.map((m) => m.totalCoolingBTUhr));
  const peakSupplementalPPFD = Math.max(
    ...d.months.map((m) => m.supplementalPPFDRequired),
  );

  const recs = generateRecommendations({
    fixtureCosts,
    currentFixtureId: inputs.fixtureId,
    currentAnnualCostUSD: currentCost,
    targetDLI: d.target.targetDLI,
    highHumidityMonths,
    ventilationMode: inputs.ventilationMode,
    co2Enabled: inputs.co2Enabled,
    co2SetpointPpm: inputs.co2SetpointPpm,
    shadeEnabled: inputs.shadeEnabled,
    shadeDeployMode: inputs.shadeDeployMode,
    peakSupplementalPPFD,
    targetTopCanopyPPFD: d.target.targetTopCanopyPPFD,
    peakNetHeatingLoadBTUhr: d.peakNetHeatingLoad,
    installedRadiantCapacityBTUhr: inputs.radiantHeatingCapacityBTUhr,
    envelopeUValueBTUhrFtF: inputs.envelopeUValueBTUhrFtF,
    annualHeatingFuelMMBtu: d.annualHeatingFuelMMBtu,
    peakCoolingBTUhr,
    evapCoolingEnabled: inputs.evapCoolingEnabled,
    evapEfficiencyPct: inputs.evapEfficiencyPct,
    evapFailureMonths,
    peakDehumidPintsPerDay,
    dehumidEfficiencyPintsPerKwh: inputs.dehumidifierEfficiencyPintsPerKwh,
    indoorTargetDryBulbF: inputs.indoorTargetDryBulbF,
  });

  const savingsRecs = recs.filter((r) => r.severity === "savings");
  const sizingRecs = recs.filter((r) => r.severity === "sizing");
  const warnRecs = recs.filter((r) => r.severity === "warn");
  const infoRecs = recs.filter((r) => r.severity === "info");

  const applyAllSavings = () => {
    const patch: Record<string, unknown> = {};
    savingsRecs.forEach((r) => {
      if (r.applyPatch) Object.assign(patch, r.applyPatch);
    });
    if (Object.keys(patch).length) setInputs(patch);
  };

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="card-header">
          <span>Optimized system · recommended specs for the current targets</span>
          <div className="flex gap-1 text-xs">
            <span className="tag tag-info">{savingsRecs.length} savings</span>
            <span className="tag tag-muted">{sizingRecs.length} sizing</span>
            <span className="tag tag-warn">{warnRecs.length} risk</span>
          </div>
        </div>
        <div className="card-body space-y-2">
          <p className="text-sm text-ink-700">
            The model takes your current canopy, DLI target, climate, and electricity cost, then recommends an optimized stack: lighting fixture, CO₂ + ventilation strategy, shade strategy, heating capacity, cooling tonnage, dehumidification capacity, and envelope upgrades. Each recommendation shows the gap from current state and is one-click applyable.
          </p>
          {savingsRecs.some((r) => r.applyPatch) && (
            <button
              type="button"
              onClick={applyAllSavings}
              className="rounded bg-leaf-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-leaf-600"
            >
              Apply all {savingsRecs.filter((r) => r.applyPatch).length} savings recommendations
            </button>
          )}
        </div>
      </div>

      {recs.length === 0 && (
        <div className="card">
          <div className="card-body text-sm text-ink-700">
            No optimization gaps detected at current settings. The configuration is within efficient bands across lighting, climate, and HVAC.
          </div>
        </div>
      )}

      {[
        { label: "Capital + operating savings", list: savingsRecs },
        { label: "Sizing recommendations", list: sizingRecs },
        { label: "Risks to address", list: warnRecs },
        { label: "Notes", list: infoRecs },
      ].map(
        (group) =>
          group.list.length > 0 && (
            <div key={group.label} className="card">
              <div className="card-header">
                <span>{group.label}</span>
                <span className="tag tag-muted">{group.list.length}</span>
              </div>
              <div className="card-body divide-y divide-ink-300/30">
                {group.list.map((r) => {
                  const style = SEVERITY_STYLE[r.severity];
                  return (
                    <div key={r.id} className="grid grid-cols-[160px_1fr_auto] items-start gap-3 py-2">
                      <div>
                        <div className="text-[11px] uppercase tracking-wide text-ink-500">
                          {CATEGORY_LABEL[r.category] ?? r.category}
                        </div>
                        <div className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${style.tag}`}>
                          {style.chip}
                        </div>
                      </div>
                      <div>
                        <div className="font-semibold text-ink-900">{r.title}</div>
                        <div className="mt-1 grid grid-cols-2 gap-3 text-xs">
                          <div>
                            <div className="text-ink-500">Current</div>
                            <div className="font-mono text-ink-900">{r.currentValue}</div>
                          </div>
                          <div>
                            <div className="text-ink-500">Recommended</div>
                            <div className="font-mono text-ink-900">{r.recommendedValue}</div>
                          </div>
                        </div>
                        <p className="mt-2 text-xs text-ink-700">{r.rationale}</p>
                        {r.savings && (
                          <div className="mt-1 text-xs font-semibold text-leaf-600">
                            Estimated impact: {r.savings}
                          </div>
                        )}
                      </div>
                      <div>
                        {r.applyPatch && (
                          <button
                            type="button"
                            onClick={() => setInputs(r.applyPatch as Record<string, unknown>)}
                            className="rounded border border-leaf-500 px-2 py-1 text-xs text-leaf-600 hover:bg-leaf-500/5"
                          >
                            Apply
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ),
      )}
    </div>
  );
}
