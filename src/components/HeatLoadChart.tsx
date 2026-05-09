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

export default function HeatLoadChart() {
  const d = useDerived();
  const data = d.months.map((m) => ({
    month: m.monthLabel,
    "Lighting BTU/hr": Math.round(m.lightingHeatBTUhr),
    "Under-canopy BTU/hr": Math.round(m.underCanopyHeatBTUhr),
    "Total cooling BTU/hr": Math.round(m.totalCoolingBTUhr),
  }));
  return (
    <div className="card">
      <div className="card-header">
        <span>Heat load by source · screening estimate</span>
        <span className="text-xs text-ink-500">[BTU/hr]</span>
      </div>
      <div className="card-body" style={{ height: 320 }}>
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
            <XAxis dataKey="month" stroke="#5b6573" />
            <YAxis stroke="#5b6573" />
            <Tooltip />
            <Legend />
            <Bar dataKey="Lighting BTU/hr" fill="#e8b04a" stackId="a" />
            <Bar dataKey="Under-canopy BTU/hr" fill="#c0573a" stackId="a" />
            <Bar dataKey="Total cooling BTU/hr" fill="#1f6c50" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
