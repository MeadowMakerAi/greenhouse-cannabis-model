import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useScenario } from "../context/ScenarioContext";

export default function WetBulbRiskChart() {
  const { climate } = useScenario();
  const data = climate.data.map((c) => ({
    month: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][c.month],
    "Mean dry-bulb °F": Math.round(c.meanTempF),
    "Design wet-bulb °F": Math.round(c.designWetBulbF),
    "Design dew-point °F": Math.round(c.designDewPointF),
  }));

  return (
    <div className="card">
      <div className="card-header">
        <span>Wet-bulb / dew-point risk profile</span>
        <span className="text-xs text-ink-500">[°F]</span>
      </div>
      <div className="card-body" style={{ height: 320 }}>
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
            <XAxis dataKey="month" stroke="#5b6573" />
            <YAxis stroke="#5b6573" />
            <Tooltip />
            <Legend />
            <Area dataKey="Design dew-point °F" fill="#c0573a22" stroke="#c0573a" />
            <Line dataKey="Design wet-bulb °F" stroke="#1f6c50" strokeWidth={2} dot={false} />
            <Line dataKey="Mean dry-bulb °F" stroke="#5b6573" strokeWidth={2} dot={false} />
            <ReferenceLine y={68} stroke="#c0573a" strokeDasharray="4 3" label={{ value: "DP 68°F (humidity risk)", fill: "#c0573a", fontSize: 11 }} />
            <ReferenceLine y={60} stroke="#e8b04a" strokeDasharray="4 3" label={{ value: "DP 60°F (late-flower watch)", fill: "#e8b04a", fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
