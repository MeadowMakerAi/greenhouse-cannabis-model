import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmtCurrency, fmtInt, fmt1, fmtPct } from "../utils/formatting";

export default function OutputSummary() {
  const { inputs } = useScenario();
  const d = useDerived();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.08em] text-ink-500">
          Key outputs
        </div>
        <div
          className="rounded-full border border-warn-500/30 bg-warn-500/5 px-2 py-0.5 text-[10px] font-medium text-warn-600"
          title="Outputs are decision-support only. Validate against stamped engineering before any capex commitment."
        >
          ⚠ Screening-level — verify before capex
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
      {/* Hero — DLI target is the operational north-star: yield ceiling,
       * fixture count, energy bill, all flow from this number. */}
      <div className="card-hero-primary lg:col-span-2">
        <div className="card-accent-leaf absolute inset-x-0 top-0 h-[3px]" />
        <div className="px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="kpi-label">DLI Target</span>
                <span className="tag tag-info">{d.target.label}</span>
              </div>
              <div className="mt-2 flex items-baseline gap-3">
                <span className="kpi-number-hero kpi-number-gradient-leaf">
                  {d.target.targetDLI}
                </span>
                <span className="text-sm font-medium text-ink-500">mol/m²/d</span>
              </div>
              <div className="mt-1 flex items-baseline gap-2 text-sm text-ink-700">
                <span className="font-mono font-semibold tabular-nums text-ink-900">
                  {fmtInt(d.target.targetTopCanopyPPFD)}
                </span>
                <span className="text-ink-500">µmol/m²/s top canopy</span>
                <span className="text-ink-300">·</span>
                <span className="font-mono font-semibold tabular-nums text-ink-900">
                  {fmtInt(d.peakFixtureCount)}
                </span>
                <span className="text-ink-500">fixtures @ {d.fixture.wattsPerFixture}W</span>
              </div>
            </div>
            <div className="hidden flex-col items-end gap-2 md:flex">
              <div className="rounded-lg border border-leaf-500/30 bg-leaf-50 px-3 py-1.5">
                <div className="kpi-label text-leaf-700">Net transmission</div>
                <div className="font-mono text-lg font-semibold tabular-nums text-leaf-700">
                  {fmtPct(d.transmission)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Energy / cost — the financial dominant */}
      <div className="card-kpi-secondary card-accent-data">
        <div className="px-4 py-3.5">
          <div className="kpi-label">Annual lighting cost</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="kpi-number kpi-number-gradient-data">
              {fmtCurrency(d.annualCost)}
            </span>
          </div>
          <div className="kpi-context">
            {fmtInt(d.annualKwh)} kWh/yr @ ${inputs.electricityRatePerKwh.toFixed(2)}/kWh
          </div>
        </div>
      </div>

      {/* Secondary row — 3 cards */}
      <div className="card-kpi-secondary card-accent-sun">
        <div className="px-4 py-3.5">
          <div className="kpi-label">Peak overhead lighting</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="kpi-number">{fmt1(d.peakInstalledKW)}</span>
            <span className="kpi-unit">kW</span>
          </div>
          <div className="kpi-context">
            {d.peakWattsPerSqFt.toFixed(1)} W/ft² · {d.peakSquareGridSpacingFt.toFixed(1)}′ grid
          </div>
        </div>
      </div>

      <div className="card-kpi-secondary card-accent-warn">
        <div className="px-4 py-3.5">
          <div className="kpi-label">Peak cooling load</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="kpi-number">{fmt1(d.peakCoolingTons)}</span>
            <span className="kpi-unit">tons</span>
          </div>
          <div className="kpi-context">screening estimate at {inputs.indoorTargetDryBulbF}°F setpoint</div>
        </div>
      </div>

      <div className="card-kpi-secondary card-accent-leaf">
        <div className="px-4 py-3.5">
          <div className="kpi-label">Coverage</div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="kpi-number">{d.peakCoveragePerFixtureSqFt.toFixed(1)}</span>
            <span className="kpi-unit">ft²/fixture</span>
          </div>
          <div className="kpi-context">
            {fmtInt(inputs.canopyAreaSqFt)} ft² canopy · {d.peakFixtureCount} overhead
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
