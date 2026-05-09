import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmt1, fmt2, fmtInt } from "../utils/formatting";

const STAGE_LABEL: Record<string, string> = {
  vegetative: "Vegetative",
  earlyFlower: "Early flower",
  midFlower: "Mid flower",
  lateFlower: "Late flower",
};

export default function CultivationSciencePanel() {
  const { inputs, setInputs } = useScenario();
  const d = useDerived();

  // Pathogen pressure data
  const pathogenData = d.months.map((m) => ({
    month: m.monthLabel,
    Botrytis: Math.round(m.botrytisScore),
    "Powdery mildew": Math.round(m.powderyMildewScore),
  }));

  // Yield projection
  const y = d.yieldProjection;
  const eui = d.energyUseIntensity_kWhPerGram;

  // Crop steering
  const s = d.cropSteering;
  const axes = s.axes;

  return (
    <div className="space-y-3">
      <div className="card border-leaf-500/40 bg-leaf-500/[0.03]">
        <div className="card-header">
          <span>Cultivation science · pathogen, yield, crop steering</span>
          <span className="tag tag-info">Screening estimates</span>
        </div>
        <div className="card-body">
          <p className="text-sm text-ink-700">
            Decision-support outputs derived from peer-reviewed greenhouse and cannabis cultivation science. <strong>Pathogen pressure</strong> from canopy T+RH+dew-point margin (Penn State / UMass / Punja & Lung). <strong>Yield projection</strong> from Rodriguez-Morrison 2021 linear DLI response with Chandra Topt and CO₂ multipliers. <strong>Crop steering</strong> bands from industry standards (Growlink, TSRGrow, Athena Ag). All outputs are screening-level — cultivar response varies by 2× or more.
          </p>
        </div>
      </div>

      {/* Stage selector */}
      <div className="card">
        <div className="card-header">
          <span>Cultivation phase · drives pathogen vulnerability and target climate bands</span>
        </div>
        <div className="card-body">
          <div className="flex flex-wrap gap-2">
            {(["vegetative", "earlyFlower", "midFlower", "lateFlower"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setInputs({ cultivationPhase: p })}
                className={`rounded border px-3 py-1.5 text-sm ${
                  inputs.cultivationPhase === p
                    ? "border-leaf-500 bg-leaf-500/10 font-semibold text-leaf-600"
                    : "border-ink-300 hover:bg-leaf-500/5"
                }`}
              >
                {STAGE_LABEL[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Crop steering alignment */}
      <div className="card">
        <div className="card-header">
          <span>Crop steering · {s.targets.label}</span>
          <span className={`tag ${s.alignmentScore >= 80 ? "tag-info" : s.alignmentScore >= 60 ? "tag-muted" : "tag-warn"}`}>
            {s.alignmentScore.toFixed(0)}% in target band
          </span>
        </div>
        <div className="card-body space-y-3">
          <p className="text-xs text-ink-500">{s.targets.notes}</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <SteeringAxis label="Day temp" unit="°F" {...axes.dayTemp} />
            <SteeringAxis label="Night temp" unit="°F" {...axes.nightTemp} />
            <SteeringAxis label="D/N differential" unit="°F" {...axes.dayNightDiff} />
            <SteeringAxis label="RH" unit="%" {...axes.rh} />
            <SteeringAxis label="VPD" unit="kPa" {...axes.vpd} fmtFn={fmt2} />
          </div>
        </div>
      </div>

      {/* Yield projection */}
      <div className="card">
        <div className="card-header">
          <span>Annual yield projection · {inputs.cyclesPerYear} cycles/yr</span>
          <span className="text-xs text-ink-500">
            Baseline {y.baselineGramsPerM2PerCycle} g/m²/cycle (Rodriguez-Morrison 2021 fit)
          </span>
        </div>
        <div className="card-body space-y-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <YieldStat label="Per cycle" value={`${fmtInt(y.gramsPerM2PerCycle)} g/m²`} />
            <YieldStat label="Annual" value={`${fmtInt(y.gramsPerM2PerYear)} g/m²/yr`} />
            <YieldStat
              label="Total annual"
              value={`${fmt1(y.totalAnnualKg)} kg / ${fmt1(y.totalAnnualLbs)} lbs`}
            />
            <YieldStat label="Energy use intensity" value={`${fmt2(eui)} kWh/g`} hint="Total electrical / dried flower weight" />
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-500">Cycles per year</div>
              <input
                type="number"
                value={inputs.cyclesPerYear}
                onChange={(e) => setInputs({ cyclesPerYear: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                min={1}
                max={6}
                step={0.5}
                className="w-full rounded border border-ink-300 px-2 py-1 text-sm"
              />
              <div className="text-[11px] text-ink-500">Greenhouse 2–3 typical; indoor 4–5</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <YieldFactor label="DLI factor" value={y.dliFactor} good={y.dliFactor >= 0.95} hint="Linear in canopy DLI; saturates ~70 mol/m²/d" />
            <YieldFactor label="Temperature factor" value={y.tempFactor} good={y.tempFactor >= 0.92} hint={`Topt 79°F; current ${inputs.indoorTargetDryBulbF}°F`} />
            <YieldFactor label="CO₂ factor" value={y.co2Factor} good={y.co2Factor >= 1.2} hint={`${inputs.co2Enabled ? `${inputs.co2SetpointPpm} ppm enriched` : "Ambient ~420 ppm"}`} />
          </div>

          <p className="text-[11px] text-ink-500">
            <strong>Caveats:</strong> Real operations under-perform this benchmark by 20–50% due to cultivar variability, IPM losses, irrigation discipline, training method, and harvest timing. Use to compare scenarios; do not use to forecast absolute yield.
          </p>
        </div>
      </div>

      {/* Pathogen pressure */}
      <div className="card">
        <div className="card-header">
          <span>
            Pathogen pressure index · {STAGE_LABEL[inputs.cultivationPhase]}
          </span>
          <div className="flex gap-1 text-xs">
            <span className={`tag ${d.peakBotrytis >= 60 ? "tag-warn" : "tag-muted"}`}>
              Peak Botrytis {Math.round(d.peakBotrytis)}
            </span>
            <span className={`tag ${d.peakPM >= 60 ? "tag-warn" : "tag-muted"}`}>
              Peak PM {Math.round(d.peakPM)}
            </span>
          </div>
        </div>
        <div className="card-body" style={{ height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={pathogenData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis domain={[0, 100]} stroke="#5b6573" />
              <Tooltip />
              <Legend />
              <Bar dataKey="Botrytis" fill="#c0573a" />
              <Bar dataKey="Powdery mildew" fill="#e8b04a" />
              <ReferenceLine y={60} stroke="#0d1117" strokeDasharray="4 3" label={{ value: "60 = high pressure", fontSize: 10, fill: "#0d1117" }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="card-body pt-0 space-y-1 text-[11px] text-ink-500">
          <p>
            <strong>Botrytis</strong> peaks at cool temps (60–68 °F) with sustained RH &gt; 70% and small dew-point margins (condensation). Late flower most vulnerable.
          </p>
          <p>
            <strong>Powdery mildew</strong> thrives 60–80 °F with RH 50–90% and humidity oscillation (high night, low day). Less affected by free water.
          </p>
        </div>
      </div>

      {/* Heat pump alternative */}
      <div className="card">
        <div className="card-header">
          <span>Heat-pump alternative · integrated cooling + dehumidification</span>
          <span className="tag tag-muted">{inputs.useIntegratedHeatPump ? "Active" : "Comparison"}</span>
        </div>
        <div className="card-body space-y-2">
          <p className="text-xs text-ink-500">
            Hot-gas-reheat DX heat-pump systems condense moisture and re-warm supply air in one pass. Same kWh covers cooling AND dehumidification — typical combined COP 3–4 vs separate AC + condensing dehumidifier.
          </p>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <YieldStat label="Combined COP" value={fmt1(inputs.heatPumpCombinedCOP)} hint="Adjustable in inputs" />
            <YieldStat label="Annual kWh (heat pump)" value={fmtInt(d.heatPump.annualKwh)} />
            <YieldStat label="Effective dehum eff" value={`${fmt1(d.heatPump.effectivePintsPerKwh)} pints/kWh`} />
            <YieldStat label="Peak tons" value={fmt1(d.heatPump.peakTons)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SteeringAxis({
  label,
  value,
  band,
  status,
  unit,
  fmtFn,
}: {
  label: string;
  value: number;
  band: [number, number];
  status: "in" | "low" | "high";
  unit: string;
  fmtFn?: (n: number) => string;
}) {
  const fmt = fmtFn ?? fmt1;
  const tag =
    status === "in" ? "tag-info" : "tag-warn";
  return (
    <div className="rounded border border-ink-300/40 p-2">
      <div className="text-[10px] uppercase tracking-wide text-ink-500">{label}</div>
      <div className="font-mono text-sm font-semibold">
        {fmt(value)} {unit}
      </div>
      <div className="text-[10px] text-ink-500">
        target {fmt(band[0])}–{fmt(band[1])} {unit}
      </div>
      <span className={`tag ${tag} mt-1 inline-block`}>{status === "in" ? "in band" : status}</span>
    </div>
  );
}

function YieldStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="text-lg font-semibold text-ink-900">{value}</div>
      {hint && <div className="text-[11px] text-ink-500">{hint}</div>}
    </div>
  );
}

function YieldFactor({ label, value, good, hint }: { label: string; value: number; good: boolean; hint?: string }) {
  return (
    <div className={`rounded border p-2 ${good ? "border-leaf-500/40 bg-leaf-500/5" : "border-warn-500/30 bg-warn-500/5"}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-xs uppercase tracking-wide text-ink-500">{label}</span>
        <span className="font-mono text-lg font-semibold text-ink-900">×{value.toFixed(2)}</span>
      </div>
      {hint && <div className="text-[11px] text-ink-500">{hint}</div>}
      <div className="mt-1 h-1.5 overflow-hidden rounded bg-ink-300/30">
        <div
          className={`h-full ${good ? "bg-leaf-500" : "bg-warn-500"}`}
          style={{ width: `${Math.min(100, value * 50)}%` }}
        />
      </div>
    </div>
  );
}
