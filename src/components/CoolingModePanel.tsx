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
      <div className="card">
        <div className="card-header">
          <span>HVAC screening · target indoor {inputs.indoorTargetDryBulbF}°F</span>
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
          <div className="card-header">Annual dehumidification</div>
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
          </div>
        </div>
        <div className="card">
          <div className="card-header">Peak cooling</div>
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
          </div>
        </div>
        <div className="card">
          <div className="card-header">Evap reach failures</div>
          <div className="card-body flex flex-wrap gap-2">
            {d.months
              .filter((m) => !m.evapReachesTarget)
              .map((m) => (
                <span key={m.month} className="tag tag-warn">
                  {m.monthLabel}
                </span>
              ))}
            {d.months.every((m) => m.evapReachesTarget) && (
              <span className="text-xs text-ink-500">Evap meets target every month under current inputs.</span>
            )}
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-500">
        Screening-level estimate only. Final HVAC sizing requires engineering design using actual envelope, airflow, crop density, equipment, and design-day weather.
      </p>
    </div>
  );

  void BarChart;
}
