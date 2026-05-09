import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { DAYS_IN_MONTH } from "../utils/formatting";

const PALETTE = ["#1f6c50", "#2f8f6c", "#c0573a", "#e8b04a", "#5b6573", "#aa3bff", "#0d6efd", "#08323b"];

export default function FixtureKWByMonth() {
  const { inputs } = useScenario();
  const all = useAllFixtures();
  const d = useDerived();
  const ids = Object.keys(all);

  const data = d.months.map((m, idx) => {
    const row: Record<string, number | string> = { month: m.monthLabel };
    ids.forEach((fid) => {
      const sized = fixtureKWFromPPFD({
        supplementalPPFDRequired: m.supplementalPPFDRequired,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        fixture: all[fid],
        photoperiodHours: inputs.flowerPhotoperiodHours,
        electricityRatePerKwh: inputs.electricityRatePerKwh,
        daysInMonth: DAYS_IN_MONTH[idx],
      });
      row[all[fid].label] = +sized.installedKW.toFixed(1);
    });
    return row;
  });

  return (
    <div className="card">
      <div className="card-header">
        <span>kW required by fixture · same canopy & target, different efficacy</span>
        <span className="text-xs text-ink-500">[kW]</span>
      </div>
      <div className="card-body" style={{ height: 360 }}>
        <ResponsiveContainer>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
            <XAxis dataKey="month" stroke="#5b6573" />
            <YAxis stroke="#5b6573" label={{ value: "Installed kW", angle: -90, position: "insideLeft", fill: "#5b6573" }} />
            <Tooltip />
            <Legend />
            {ids.map((fid, i) => {
              const isSelected = fid === inputs.fixtureId;
              return (
                <Line
                  key={fid}
                  type="monotone"
                  dataKey={all[fid].label}
                  stroke={PALETTE[i % PALETTE.length]}
                  strokeWidth={isSelected ? 3 : 1.5}
                  strokeDasharray={isSelected ? "0" : "0"}
                  dot={isSelected}
                  activeDot={{ r: 4 }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="card-body pt-0 text-[11px] text-ink-500">
        Each line is the same monthly PPFD requirement converted to electrical kW through a different fixture's PPE × optical utilization. Higher PPE pushes the line down. The currently-selected fixture is drawn with a thicker line.
      </p>
    </div>
  );
}
