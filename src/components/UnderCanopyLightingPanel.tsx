import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmtCurrency, fmtInt, fmt1, fmtPct } from "../utils/formatting";

export default function UnderCanopyLightingPanel() {
  const { inputs } = useScenario();
  const d = useDerived();
  const annualUC = d.months.reduce((a, m) => a + m.underCanopyKwhMonth, 0);
  const annualUCCost = d.months.reduce((a, m) => a + m.underCanopyMonthlyCost, 0);
  const peakUCkW = Math.max(...d.months.map((m) => m.underCanopyKW));
  const sample = d.months[0];

  const chartData = d.months.map((m) => ({
    month: m.monthLabel,
    "Top-canopy DLI": +(m.flowerWindowDLI + d.target.targetDLI - m.flowerWindowDLI).toFixed(1),
    "Lower-canopy DLI (zone)": +m.underCanopyDLI.toFixed(1),
    "Whole-plant DLI uplift": +m.wholePlantDLIUplift.toFixed(2),
    "UC heat (kBTU/hr)": +(m.underCanopyHeatBTUhr / 1000).toFixed(1),
  }));

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="card-header">
          <span>Lower-canopy strategy · real photon delivery</span>
          <span className={`tag ${inputs.underCanopyEnabled ? "tag-info" : "tag-muted"}`}>
            {inputs.underCanopyEnabled ? "Enabled" : "Disabled"}
          </span>
        </div>
        <div className="card-body grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">UC PPFD at zone</div>
            <div className="text-xl font-semibold">
              {fmtInt(inputs.underCanopyPPFD)} <span className="text-sm font-normal text-ink-500">µmol/m²/s</span>
            </div>
            <div className="text-[11px] text-ink-500">
              over {inputs.underCanopyCoveragePct}% of canopy
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Lower-canopy DLI (zone)</div>
            <div className="text-xl font-semibold">
              {fmt1(sample?.underCanopyDLI ?? 0)} <span className="text-sm font-normal text-ink-500">mol/m²/d</span>
            </div>
            <div className="text-[11px] text-ink-500">
              {inputs.underCanopyPhotoperiodHours}h photoperiod
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Whole-plant DLI uplift</div>
            <div className="text-xl font-semibold">
              +{fmt1(sample?.wholePlantDLIUplift ?? 0)} <span className="text-sm font-normal text-ink-500">mol/m²/d</span>
            </div>
            <div className="text-[11px] text-ink-500">
              {fmtPct(sample?.wholePlantDLIUpliftFraction ?? 0)} of top-canopy DLI
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Avg added PPFD across canopy</div>
            <div className="text-xl font-semibold">
              +{fmtInt(sample?.wholePlantPPFDUplift ?? 0)} <span className="text-sm font-normal text-ink-500">µmol/m²/s</span>
            </div>
            <div className="text-[11px] text-ink-500">coverage-weighted</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Photon flux added</div>
            <div className="text-xl font-semibold">
              {fmtInt(sample?.underCanopyPhotonFlux_umol_s ?? 0)} <span className="text-sm font-normal text-ink-500">µmol/s</span>
            </div>
            <div className="text-[11px] text-ink-500">
              {fmt1(sample?.dailyPhotonAddedMMolPerFt2 ?? 0)} mmol/ft²/day
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Peak UC kW</div>
            <div className="text-xl font-semibold">{fmt1(peakUCkW)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Annual UC kWh</div>
            <div className="text-xl font-semibold">{fmtInt(annualUC)}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Annual UC cost</div>
            <div className="text-xl font-semibold">{fmtCurrency(annualUCCost)}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>Photon delivery · top-canopy target vs lower-canopy zone vs whole-plant uplift</span>
          <span className="text-xs text-ink-500">[mol/m²/day · kBTU/hr]</span>
        </div>
        <div className="card-body" style={{ height: 340 }}>
          <ResponsiveContainer>
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis stroke="#5b6573" label={{ value: "DLI (mol/m²/d)", angle: -90, position: "insideLeft", fill: "#5b6573" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Lower-canopy DLI (zone)" fill="#1f6c50" />
              <Line dataKey="Top-canopy DLI" stroke="#e8b04a" strokeWidth={2} dot={false} />
              <Line dataKey="Whole-plant DLI uplift" stroke="#2f8f6c" strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="UC heat (kBTU/hr)" stroke="#c0573a" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header">How to read this</div>
        <div className="card-body space-y-2 text-sm text-ink-700">
          <p>
            <strong>Lower-canopy DLI (zone)</strong> is the real DLI delivered to lower bud sites and side branches that the under-canopy fixtures actually illuminate. It is genuine photon flux at plant tissue, in mol/m²/day.
          </p>
          <p>
            <strong>Whole-plant DLI uplift</strong> is the additive contribution to whole-plant photon delivery, weighted by the {inputs.underCanopyCoveragePct}% canopy coverage. Use this to compare against published cultivar DLI response curves when evaluating yield uplift.
          </p>
          <p className="rounded bg-warn-500/10 p-2 text-warn-500">
            <strong>Substitution warning:</strong> the lower-canopy DLI does <em>not</em> replace the top-canopy PPFD requirement at the apex. Top buds still need overhead light to hit target. Under-canopy adds to the lower-canopy yield ceiling — it does not subtract from the overhead requirement.
          </p>
        </div>
      </div>
    </div>
  );
}
