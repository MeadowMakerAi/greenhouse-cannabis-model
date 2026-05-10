import { ResponsiveContainer, Area, AreaChart } from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmtCurrency, fmtInt, fmt1, fmtPct } from "../utils/formatting";

/**
 * Editorial KPI strip — hero metric + supporting ledger row.
 *
 * Layout intent (per /somersault round-2 synthesis):
 *   • Hero: annual lighting energy at display weight (96pt-ish), tabular,
 *     IBM Plex Sans Condensed, with a 12-month monthly sparkline that earns
 *     visual real estate. This is the single load-bearing decision metric
 *     in the model — every other cost/heat/yield figure derives from it.
 *   • Vitals (top-right): DLI target + net transmission, the two structural
 *     constraints the user is designing against.
 *   • Ledger (bottom): 5 supporting metrics in a 5-col row, label small-caps
 *     above, value tabular below, hairline column dividers. NO card chrome —
 *     the structure is the typography, not the container.
 */
export default function OutputSummary() {
  const { inputs } = useScenario();
  const d = useDerived();

  const monthly = d.months.map((m, i) => ({
    month: i,
    kwh: m.monthlyKwh + m.underCanopyKwhMonth,
  }));

  const peakKwh = Math.max(...monthly.map((m) => m.kwh), 0);
  const onTarget = d.target.targetDLI > 0;

  return (
    <section className="relative overflow-hidden">
      {/* Subliminal blueprint grid behind the hero panel — Vercel/Geist
          pattern. 24px cells at 4% opacity. Felt before seen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(13,17,23,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(13,17,23,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0) 85%)",
        }}
      />

      <div className="relative">
        {/* ── Top: hero + right-aligned vitals ── */}
        <div className="flex flex-wrap items-end justify-between gap-6 pb-4">
          <div className="min-w-0 flex-1">
            <div className="kpi-eyebrow">
              <span className="text-leaf-700">●</span>{" "}
              Annual lighting energy
            </div>
            <div className="mt-1 flex items-end gap-4">
              <div className="kpi-hero">
                {fmtInt(d.annualKwh)}
                <span className="kpi-hero-unit">kWh/yr</span>
              </div>
              {/* Monthly sparkline — 12 bars of total kWh delivered */}
              <div className="hidden h-14 w-40 sm:block">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={monthly}
                    margin={{ top: 4, right: 0, left: 0, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="kwhSpark"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop offset="0%" stopColor="#1f6c50" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#1f6c50" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="kwh"
                      stroke="#1f6c50"
                      strokeWidth={1.5}
                      fill="url(#kwhSpark)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="kpi-context-lead mt-2">
              Overhead + under-canopy at $
              {inputs.electricityRatePerKwh.toFixed(2)}/kWh ·{" "}
              {fmtInt(d.peakInstalledKW)} kW peak ·{" "}
              {fmtInt(peakKwh)} kWh peak month
            </div>
          </div>

          {/* Right rail — design constraints */}
          <div className="flex items-stretch gap-5 self-stretch">
            <div className="hidden w-px self-stretch bg-ink-200/70 md:block" />
            <Vital
              label="DLI target"
              value={`${onTarget ? d.target.targetDLI : "—"}`}
              unit="mol/m²/d"
              context={d.target.label}
            />
            <Vital
              label="Net transmission"
              value={fmtPct(d.transmission)}
              unit=""
              context="glaze × roof × structure × soil"
            />
          </div>
        </div>

        {/* Hairline rule + leaf accent tick */}
        <div className="relative h-px bg-ink-200/80">
          <div className="absolute left-0 top-0 h-px w-24 bg-leaf-600" />
        </div>

        {/* ── Bottom: 5-col ledger row ── */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 pt-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-x-0 lg:divide-x lg:divide-ink-200/70">
          <Ledger
            label="Annual cost"
            value={fmtCurrency(d.annualCost)}
            context={`@ $${inputs.electricityRatePerKwh.toFixed(2)}/kWh`}
          />
          <Ledger
            label="Peak overhead"
            value={fmt1(d.peakInstalledKW)}
            unit="kW"
            context={`${fmtInt(d.peakFixtureCount)} × ${
              d.fixture.wattsPerFixture
            }W · ${d.peakWattsPerSqFt.toFixed(1)} W/ft²`}
          />
          <Ledger
            label="Peak cooling"
            value={fmt1(d.peakCoolingTons)}
            unit="tons"
            context="screening estimate"
            warn={d.peakCoolingTons > 0}
            warnSuppress
          />
          <Ledger
            label="PPFD target"
            value={fmtInt(d.target.targetTopCanopyPPFD)}
            unit="µmol/m²/s"
            context={`for ${d.target.targetDLI} DLI`}
          />
          <Ledger
            label="Fixture"
            value={d.fixture.label.split("·")[0].trim()}
            unit=""
            context={`${d.fixture.ppe.toFixed(1)} µmol/J · ${d.fixture.type}`}
            verbatim
          />
        </div>
      </div>
    </section>
  );
}

function Vital({
  label,
  value,
  unit,
  context,
}: {
  label: string;
  value: string;
  unit?: string;
  context?: string;
}) {
  return (
    <div className="min-w-[8rem]">
      <div className="kpi-eyebrow">{label}</div>
      <div className="kpi-vital">
        {value}
        {unit && <span className="kpi-vital-unit">{unit}</span>}
      </div>
      {context && (
        <div className="kpi-context proportional-nums">{context}</div>
      )}
    </div>
  );
}

function Ledger({
  label,
  value,
  unit,
  context,
  warn,
  warnSuppress,
  verbatim,
}: {
  label: string;
  value: string;
  unit?: string;
  context?: string;
  warn?: boolean;
  warnSuppress?: boolean;
  verbatim?: boolean;
}) {
  return (
    <div className="lg:px-5 lg:first:pl-0 lg:last:pr-0">
      <div className="kpi-eyebrow">{label}</div>
      <div
        className={`mt-0.5 ${verbatim ? "kpi-ledger-text" : "kpi-ledger"} ${
          warn && !warnSuppress ? "text-warn-600" : "text-ink-900"
        }`}
      >
        {value}
        {unit && <span className="kpi-ledger-unit">{unit}</span>}
      </div>
      {context && (
        <div className="kpi-context proportional-nums">{context}</div>
      )}
    </div>
  );
}
