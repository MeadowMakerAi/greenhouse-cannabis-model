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
    "Heat lost (walls + roof)": Math.round(m.envelopeLossBTUhr),
    "Free heat from lights": Math.round(m.lightingHeatOffsetBTUhr),
    "Heat you must add": Math.round(m.netHeatingLoadBTUhr),
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
        <p className="text-sm text-ink-600">
          Heat you have to <em>add</em> on cold nights, and the fuel it takes.
          Greenhouse heat is almost always <strong>gas or propane</strong>, not
          electricity — so this cost is <strong>not</strong> in the "$/gram" power
          number. Budget it separately (it shows on the Build sheet).
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Coldest-night heat needed</div>
            <div className="text-xl font-semibold">{fmtInt(d.peakNetHeatingLoad)} BTU/hr</div>
            <div className="text-[11px] text-ink-500">
              how big the heater must be
            </div>
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
            <div className="text-xs uppercase tracking-wide text-ink-500">Fuel burned per year</div>
            <div className="text-xl font-semibold">{fmt1(d.annualHeatingFuelMMBtu)} MMBtu</div>
            <div className="text-[11px] text-ink-500">
              1 MMBtu ≈ 11 gal propane (~1,000 cu ft gas), @ {(inputs.radiantEfficiency * 100).toFixed(0)}% efficient
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Free heat from the lights</div>
            <div className="text-xl font-semibold">
              {fmtInt(Math.max(...d.months.map((m) => m.lightingHeatOffsetBTUhr)))} BTU/hr
            </div>
            <div className="text-[11px] text-ink-500">
              lamps warm the room, cutting the fuel bill (~60% of night lighting)
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
              <Bar dataKey="Heat lost (walls + roof)" fill="#5b6573" />
              <Bar dataKey="Free heat from lights" fill="#e8b04a" />
              <Bar dataKey="Heat you must add" fill="#c0573a" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <p className="text-xs text-ink-500">
          The bars: heat leaking out through the walls and roof, minus the free
          heat the lamps throw off, equals the heat your heater has to add.
          Radiant heat warms the plants and root zone but does <em>not</em> dry
          the air — you still need dehumidifiers at flower-stage humidity targets.
        </p>
      </div>
    </div>
  );
}
