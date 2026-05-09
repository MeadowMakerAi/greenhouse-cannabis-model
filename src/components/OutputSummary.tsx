import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmtCurrency, fmtInt, fmt1, fmtPct } from "../utils/formatting";

export default function OutputSummary() {
  const { inputs } = useScenario();
  const d = useDerived();
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <KPI
        accent="leaf"
        label="Annual lighting energy"
        value={fmtInt(d.annualKwh)}
        unit="kWh/yr"
        context="overhead + under-canopy"
      />
      <KPI
        accent="data"
        label="Annual lighting cost"
        value={fmtCurrency(d.annualCost)}
        context={`@ $${inputs.electricityRatePerKwh.toFixed(2)}/kWh`}
      />
      <KPI
        accent="sun"
        label="Peak overhead lighting"
        value={fmt1(d.peakInstalledKW)}
        unit="kW"
        context={`${fmtInt(d.peakFixtureCount)} × ${d.fixture.wattsPerFixture}W · ${d.peakWattsPerSqFt.toFixed(1)} W/ft² · 1 per ${d.peakCoveragePerFixtureSqFt.toFixed(1)} ft² (${d.peakSquareGridSpacingFt.toFixed(1)}′ grid)`}
      />
      <KPI
        accent="warn"
        label="Peak cooling load"
        value={fmt1(d.peakCoolingTons)}
        unit="tons"
        context="screening estimate"
      />
      <KPI
        accent="leaf"
        label="Net canopy transmission"
        value={fmtPct(d.transmission)}
        context="glazing × roof × (1 − structure) × (1 − soiling) × (1 − obstruction)"
        spanLg={2}
      />
      <KPI
        accent="data"
        label="DLI target"
        value={`${d.target.targetDLI}`}
        unit={`mol/m²/d · ${fmtInt(d.target.targetTopCanopyPPFD)} PPFD`}
        context={d.target.label}
        spanLg={2}
      />
    </div>
  );
}

const ACCENT_CLASS: Record<string, string> = {
  leaf: "card-accent-leaf",
  data: "card-accent-data",
  sun: "card-accent-sun",
  warn: "card-accent-warn",
};

function KPI({
  label,
  value,
  unit,
  context,
  accent,
  spanLg,
}: {
  label: string;
  value: string;
  unit?: string;
  context?: string;
  accent: "leaf" | "data" | "sun" | "warn";
  spanLg?: number;
}) {
  const span = spanLg ? `lg:col-span-${spanLg}` : "";
  return (
    <div className={`card-hero ${ACCENT_CLASS[accent]} ${span} overflow-hidden`}>
      <div className="card-body pb-3">
        <div className="kpi-label">{label}</div>
        <div className="mt-1 flex items-baseline gap-1">
          <span className="kpi-number">{value}</span>
          {unit && <span className="kpi-unit">{unit}</span>}
        </div>
        {context && <div className="kpi-context">{context}</div>}
      </div>
    </div>
  );
}
