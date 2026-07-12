import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmt1, fmtInt } from "../utils/formatting";

export default function CoolingModePanel() {
  const { inputs } = useScenario();
  const d = useDerived();
  const data = d.months.map((m) => ({
    month: m.monthLabel,
    "Cooling tons": +m.coolingTons.toFixed(1),
    "Dehumid pints/day": Math.round(m.dehumidPintsPerDay),
    "Evap supply °F": Math.round(m.evapSupplyTempF),
  }));

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-600">
        How much cooling you'd need <em>if</em> you install mechanical air
        conditioning — most greenhouses don't. They hold temperature by opening
        vents and running evaporative ("swamp") coolers, and only add
        refrigerated AC in high-value, tight-control flower rooms. A "ton" here is
        just a size: <strong>1 ton = 12,000 BTU/hr of heat removed</strong> (the
        name comes from the cooling you'd get melting a ton of ice a day). These
        tons are <strong>not</strong> in the "$/gram" power number — that's
        electricity for lighting, dehumidifiers, and the peak-demand charge.
      </p>
      <div className="card">
        <div className="card-header">
          <span>Cooling you'd need if you add AC · target indoor {inputs.indoorTargetDryBulbF}°F</span>
        </div>
        <div className="card-body" style={{ height: 360 }}>
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis yAxisId="left" stroke="#5b6573" label={{ value: "Tons / pints", angle: -90, position: "insideLeft", fill: "#5b6573" }} />
              <YAxis yAxisId="right" orientation="right" stroke="#5b6573" label={{ value: "Evap supply °F", angle: 90, position: "insideRight", fill: "#5b6573" }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="Cooling tons" fill="#1f6c50" />
              <Bar yAxisId="left" dataKey="Dehumid pints/day" fill="#e8b04a" />
              <Line yAxisId="right" dataKey="Evap supply °F" stroke="#c0573a" strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine yAxisId="right" y={inputs.indoorTargetDryBulbF} stroke="#0d1117" strokeDasharray="4 3" label={{ value: "Target indoor", fill: "#0d1117", fontSize: 11 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card">
          <div className="card-header">Water pulled from the air (dehumidifiers)</div>
          <div className="card-body">
            <div className="kv">
              <span className="kv-label">Avg pints/day</span>
              <span className="kv-value">
                {fmtInt(d.months.reduce((a, m) => a + m.dehumidPintsPerDay, 0) / 12)}
              </span>
            </div>
            <div className="kv">
              <span className="kv-label">Annual kWh</span>
              <span className="kv-value">
                {fmtInt(d.months.reduce((a, m) => a + m.dehumidKwhPerDay * 30, 0))}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              This electricity <em>is</em> in the "$/gram" power number. Dehumidifiers run whether or not you have AC.
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Biggest cooling hour (sizing only)</div>
          <div className="card-body">
            <div className="kv">
              <span className="kv-label">Tons</span>
              <span className="kv-value">{fmt1(d.peakCoolingTons)}</span>
            </div>
            <div className="kv">
              <span className="kv-label">BTU/hr</span>
              <span className="kv-value">
                {fmtInt(Math.max(...d.months.map((m) => m.totalCoolingBTUhr)))}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-ink-500">
              What an AC unit would have to be rated for. Not a cost — no AC electricity is billed in this model.
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Months evap cooling can't hold target</div>
          <div className="card-body flex flex-wrap gap-2">
            {d.months
              .filter((m) => !m.evapReachesTarget)
              .map((m) => (
                <span key={m.month} className="tag tag-warn">
                  {m.monthLabel}
                </span>
              ))}
            {d.months.every((m) => m.evapReachesTarget) && (
              <span className="text-xs text-ink-500">Evaporative cooling holds the target every month under current inputs — no mechanical AC implied.</span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-500">
        Rough screening numbers only — a starting point, not a design. Real HVAC
        sizing needs an engineer working from your actual building, airflow, plant
        density, equipment, and worst-case local weather.
      </p>
    </div>
  );

  void BarChart;
}
