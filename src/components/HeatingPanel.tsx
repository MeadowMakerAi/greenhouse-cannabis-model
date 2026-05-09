import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmt1, fmtInt } from "../utils/formatting";

export default function HeatingPanel() {
  const { inputs } = useScenario();
  const d = useDerived();
  const data = d.months.map((m) => ({
    month: m.monthLabel,
    "Envelope loss": Math.round(m.envelopeLossBTUhr),
    "Lighting offset": Math.round(m.lightingHeatOffsetBTUhr),
    "Net heating load": Math.round(m.netHeatingLoadBTUhr),
  }));

  return (
    <div className="card">
      <div className="card-header">
        <span>
          Radiant heating · target {inputs.targetNightTempF}°F night · {fmtInt(inputs.radiantHeatingCapacityBTUhr)} BTU/hr installed
        </span>
        <span className={`tag ${inputs.radiantHeatingEnabled ? "tag-info" : "tag-muted"}`}>
          {inputs.radiantHeatingEnabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <div className="card-body space-y-3">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Peak net load</div>
            <div className="text-xl font-semibold">{fmtInt(d.peakNetHeatingLoad)} BTU/hr</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Capacity</div>
            <div className="text-xl font-semibold">
              {fmtInt(inputs.radiantHeatingCapacityBTUhr)} BTU/hr
            </div>
            <div className="text-[11px] text-ink-500">
              {d.peakNetHeatingLoad > inputs.radiantHeatingCapacityBTUhr ? (
                <span className="text-warn-500">undersized at design night</span>
              ) : (
                <span className="text-leaf-600">covers design night</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Annual fuel input</div>
            <div className="text-xl font-semibold">{fmt1(d.annualHeatingFuelMMBtu)} MMBtu</div>
            <div className="text-[11px] text-ink-500">
              @ {(inputs.radiantEfficiency * 100).toFixed(0)}% efficiency
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Lighting offset (peak)</div>
            <div className="text-xl font-semibold">
              {fmtInt(Math.max(...d.months.map((m) => m.lightingHeatOffsetBTUhr)))} BTU/hr
            </div>
            <div className="text-[11px] text-ink-500">
              60% of nighttime overhead lighting
            </div>
          </div>
        </div>

        <div style={{ height: 280 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis stroke="#5b6573" />
              <Tooltip />
              <Legend />
              <Bar dataKey="Envelope loss" fill="#5b6573" />
              <Bar dataKey="Lighting offset" fill="#e8b04a" />
              <Bar dataKey="Net heating load" fill="#c0573a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-ink-500">
          Radiant heating warms plant and root-zone tissue. It does not remove water vapor — dehumidification is still required at flower-stage RH targets.
        </p>
      </div>
    </div>
  );
}
