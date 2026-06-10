import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Bar,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";

export default function AnnualDLIChart() {
  const { inputs } = useScenario();
  const d = useDerived();
  // Outdoor = no glass: greenhouse-transmitted and shaded series are identical to
  // outdoor DLI (transmission 1.0, shade off), so we drop them and show only the
  // open-air light + its flower-window slice. Keeps the chart honest, not redundant.
  const outdoor = inputs.mode === "outdoor";
  const data = d.months.map((m) => ({
    month: m.monthLabel,
    "Outdoor DLI": +m.outdoorDLI.toFixed(1),
    "Greenhouse DLI": +m.greenhouseDLI.toFixed(1),
    "Shaded GH DLI": +m.shadedGreenhouseDLI.toFixed(1),
    "Flower-window DLI": +m.flowerWindowDLI.toFixed(1),
  }));
  return (
    <div className="card">
      <div className="card-header">
        <span>
          Annual canopy DLI ·{" "}
          {outdoor
            ? "open-air sunlight"
            : `${inputs.flowerPhotoperiodHours}h flower window · target ${d.target.targetDLI} DLI`}
        </span>
        <span className="text-xs text-ink-500">[mol/m²/day]</span>
      </div>
      {outdoor && (
        <div className="px-4 pt-2 text-[11px] text-ink-500">
          Open-air sunlight reaching the canopy — no greenhouse glazing loss. The
          greenhouse-transmitted and shaded series don't apply outdoors.
        </div>
      )}
      <div className="card-body" style={{ height: 360 }}>
        <ResponsiveContainer>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
            <XAxis dataKey="month" stroke="#5b6573" />
            <YAxis stroke="#5b6573" label={{ value: "DLI (mol/m²/day)", angle: -90, position: "insideLeft", fill: "#5b6573" }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Outdoor DLI" fill="#e8b04a" />
            {!outdoor && <Bar dataKey="Greenhouse DLI" fill="#a8b0bb" />}
            {!outdoor && (
              <Line type="monotone" dataKey="Shaded GH DLI" stroke="#1f6c50" strokeWidth={2} dot={false} />
            )}
            <Line type="monotone" dataKey="Flower-window DLI" stroke="#c0573a" strokeWidth={2} dot={{ r: 3 }} />
            <ReferenceLine y={30} stroke="#1f6c50" strokeDasharray="4 3" label={{ value: "30 (min)", fill: "#1f6c50", fontSize: 11 }} />
            <ReferenceLine y={40} stroke="#2f8f6c" strokeDasharray="4 3" label={{ value: "40 (premium)", fill: "#2f8f6c", fontSize: 11 }} />
            <ReferenceLine y={50} stroke="#c0573a" strokeDasharray="4 3" label={{ value: "50 (CO₂)", fill: "#c0573a", fontSize: 11 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
