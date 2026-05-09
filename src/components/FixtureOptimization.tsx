import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { sqftToSqm } from "../utils/unitConversions";
import { DAYS_IN_MONTH, fmt1, fmt2, fmtCurrency, fmtInt } from "../utils/formatting";

interface Row {
  id: string;
  vendor: string;
  type: "LED" | "HPS";
  ppe: number;
  source: string;
  peakKW: number;
  peakFixtureCount: number;
  annualKwh: number;
  annualCost: number;
  annualPhotonMolDelivered: number; // mol of supplemental PAR delivered annually to canopy
  costPerMolUsd: number;
  efficacyAtCanopy: number; // µmol/J effective at canopy (PPE × util)
}

export default function FixtureOptimization() {
  const { inputs, setInputs } = useScenario();
  const all = useAllFixtures();
  const d = useDerived();

  const canopyM2 = sqftToSqm(inputs.canopyAreaSqFt);

  const rows: Row[] = Object.values(all).map((f) => {
    let kwh = 0;
    let cost = 0;
    let peakKW = 0;
    let peakFixtures = 0;
    let molDelivered = 0;
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
      // Photons delivered to canopy this month: supplemental PPFD × canopy m² × photoperiod_s × days / 1e6
      const monthMol =
        m.supplementalPPFDRequired *
        canopyM2 *
        inputs.flowerPhotoperiodHours *
        3600 *
        DAYS_IN_MONTH[idx] /
        1_000_000;
      molDelivered += monthMol;
    });
    return {
      id: f.id,
      vendor: f.vendor ? `${f.vendor} ${f.model ?? ""}` : f.label,
      type: f.type,
      ppe: f.ppe,
      source: f.source,
      peakKW,
      peakFixtureCount: peakFixtures,
      annualKwh: kwh,
      annualCost: cost,
      annualPhotonMolDelivered: molDelivered,
      costPerMolUsd: molDelivered > 0 ? cost / molDelivered : 0,
      efficacyAtCanopy: f.ppe * f.opticalUtilization,
    };
  });

  // Sort by annual cost ascending — cheapest = optimal opex
  const sorted = [...rows].sort((a, b) => a.annualCost - b.annualCost);
  const winner = sorted[0];

  const chartData = sorted.map((r) => ({
    fixture: r.vendor.length > 28 ? r.vendor.slice(0, 26) + "…" : r.vendor,
    "Annual cost ($)": Math.round(r.annualCost),
    "Cost per mol ($)": +r.costPerMolUsd.toFixed(4),
    id: r.id,
  }));

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="card-header">
          <span>
            Optimization · annual operating cost to hit {d.target.targetDLI} DLI year-round
          </span>
          <span className="text-xs text-ink-500">canopy {fmtInt(inputs.canopyAreaSqFt)} ft² · ${inputs.electricityRatePerKwh.toFixed(2)}/kWh</span>
        </div>
        <div className="card-body space-y-3">
          {winner && (
            <div className="rounded border border-leaf-500/40 bg-leaf-500/5 p-3 text-sm">
              <div className="text-[11px] uppercase tracking-wide text-leaf-600">
                Lowest annual operating cost
              </div>
              <div className="font-semibold text-ink-900">{winner.vendor}</div>
              <div className="text-xs text-ink-700">
                {fmtCurrency(winner.annualCost)} / yr · {fmtInt(winner.annualKwh)} kWh ·
                {" "}peak {fmt1(winner.peakKW)} kW ({fmtInt(winner.peakFixtureCount)} fixtures) ·
                {" "}{fmt2(winner.ppe)} µmol/J
              </div>
              {winner.id !== inputs.fixtureId && (
                <button
                  type="button"
                  className="mt-2 rounded bg-leaf-500 px-3 py-1 text-xs font-semibold text-white hover:bg-leaf-600"
                  onClick={() => setInputs({ fixtureId: winner.id })}
                >
                  Use {winner.vendor} as the active fixture
                </button>
              )}
            </div>
          )}

          <div style={{ height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={chartData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
                <XAxis type="number" stroke="#5b6573" />
                <YAxis type="category" dataKey="fixture" stroke="#5b6573" width={180} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Annual cost ($)">
                  {chartData.map((row) => (
                    <Cell
                      key={row.id}
                      fill={row.id === winner?.id ? "#1f6c50" : row.id === inputs.fixtureId ? "#e8b04a" : "#a8b0bb"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-3 text-[11px] text-ink-500">
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded bg-leaf-600" /> optimal (lowest annual cost)
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded bg-sun-500" /> currently selected
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded bg-ink-300" /> alternatives
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>Cost per mol of supplemental photons · pure efficacy ranking</span>
          <span className="text-xs text-ink-500">[$/mol PAR delivered to canopy]</span>
        </div>
        <div className="card-body">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-300/40 text-left text-xs uppercase tracking-wide text-ink-500">
                <th className="py-1 pr-2">Fixture</th>
                <th className="py-1 pr-2 text-right">Type</th>
                <th className="py-1 pr-2 text-right">PPE</th>
                <th className="py-1 pr-2 text-right">PPE × util</th>
                <th className="py-1 pr-2 text-right">Annual mol delivered</th>
                <th className="py-1 pr-2 text-right">Annual $</th>
                <th className="py-1 pr-2 text-right">$/mol</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.id}
                  className={`border-b border-ink-300/20 ${r.id === winner?.id ? "bg-leaf-500/5" : ""} ${r.id === inputs.fixtureId ? "font-semibold" : ""}`}
                >
                  <td className="py-1 pr-2">{r.vendor}</td>
                  <td className="py-1 pr-2 text-right">{r.type}</td>
                  <td className="py-1 pr-2 text-right font-mono">{r.ppe.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right font-mono">{r.efficacyAtCanopy.toFixed(2)}</td>
                  <td className="py-1 pr-2 text-right font-mono">{fmtInt(r.annualPhotonMolDelivered)}</td>
                  <td className="py-1 pr-2 text-right font-mono">{fmtCurrency(r.annualCost)}</td>
                  <td className="py-1 pr-2 text-right font-mono">${r.costPerMolUsd.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-ink-500">
            Annual mol delivered is the same number across rows — the canopy photon requirement is fixture-independent. What changes is the watts each fixture burns to deliver it. $/mol is the pure operating-cost efficacy of each fixture against electricity at ${inputs.electricityRatePerKwh.toFixed(2)}/kWh.
          </p>
        </div>
      </div>
    </div>
  );
}
