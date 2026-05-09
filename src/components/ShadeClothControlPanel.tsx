import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";

export default function ShadeClothControlPanel() {
  const { inputs } = useScenario();
  const d = useDerived();

  const data = d.months.map((m) => {
    const noShadeDLI = m.greenhouseDLI;
    const shadedDLI = m.shadedGreenhouseDLI;
    const dliLoss = noShadeDLI - shadedDLI;
    return {
      month: m.monthLabel,
      "No-shade GH DLI": +noShadeDLI.toFixed(1),
      "Shaded GH DLI": +shadedDLI.toFixed(1),
      "DLI loss": +dliLoss.toFixed(1),
      "Supplemental PPFD": Math.round(m.supplementalPPFDRequired),
      shadeActive: m.shadeActive,
    };
  });

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="card-header">
          <span>
            Shade tradeoff · cloth transmission {inputs.shadeTransmissionPct}% · mode {inputs.shadeDeployMode}
          </span>
        </div>
        <div className="card-body" style={{ height: 320 }}>
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis yAxisId="left" stroke="#5b6573" label={{ value: "DLI (mol/m²/d)", angle: -90, position: "insideLeft", fill: "#5b6573" }} />
              <YAxis yAxisId="right" orientation="right" stroke="#5b6573" label={{ value: "Supp. PPFD", angle: 90, position: "insideRight", fill: "#5b6573" }} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="No-shade GH DLI" fill="#a8b0bb" />
              <Bar yAxisId="left" dataKey="Shaded GH DLI" fill="#1f6c50" />
              <Line yAxisId="left" dataKey="DLI loss" stroke="#c0573a" strokeWidth={2} dot={false} />
              <Line yAxisId="right" dataKey="Supplemental PPFD" stroke="#e8b04a" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Months with shade active</div>
        <div className="card-body flex flex-wrap gap-2">
          {data.map((d) => (
            <span
              key={d.month}
              className={`tag ${d.shadeActive ? "tag-info" : "tag-muted"}`}
            >
              {d.month}
            </span>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-header">Shade strategy notes</div>
        <div className="card-body space-y-1 text-sm text-ink-700">
          <p>Shade reduces both solar heat gain and natural DLI in proportion to its transmission factor.</p>
          <p>If your supplemental lighting is already near target, shade adds energy cost. If natural DLI is well above target, shade provides cooling relief at no DLI penalty.</p>
          <p>For radiation-trigger control, shade is deployed only when outdoor solar exceeds the threshold — minimizing avoidable DLI loss.</p>
        </div>
      </div>
    </div>
  );

  // Keep BarChart referenced for tree-shaking determinism
  void BarChart;
}
