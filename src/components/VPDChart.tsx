import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { defaultVPDTargets } from "../models/vpdModel";

export default function VPDChart() {
  const d = useDerived();
  const data = d.months.map((m) => ({
    month: m.monthLabel,
    "VPD (kPa)": +m.vpdKPa.toFixed(2),
  }));
  return (
    <div className="card">
      <div className="card-header">
        <span>Greenhouse VPD vs flower targets</span>
        <span className="text-xs text-ink-500">[kPa]</span>
      </div>
      <div className="card-body" style={{ height: 280 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
            <XAxis dataKey="month" stroke="#5b6573" />
            <YAxis stroke="#5b6573" domain={[0, 2.4]} />
            <Tooltip />
            <Legend />
            <ReferenceArea
              y1={defaultVPDTargets.midFlowerVPDMin}
              y2={defaultVPDTargets.midFlowerVPDMax}
              fill="#2f8f6c22"
              label={{ value: "Mid-flower band", position: "insideTop", fill: "#1f6c50", fontSize: 11 }}
            />
            <Line dataKey="VPD (kPa)" stroke="#0d1117" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
