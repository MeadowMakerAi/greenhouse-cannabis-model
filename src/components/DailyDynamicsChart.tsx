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
import { useLiveDynamics } from "../context/useLiveDynamics";
import { useSimulation } from "../context/SimulationContext";
import { useScenario } from "../context/ScenarioContext";
import { fmt1, fmtInt } from "../utils/formatting";
import { btuhrToKW } from "../utils/unitConversions";

export default function DailyDynamicsChart() {
  const { inputs } = useScenario();
  const sim = useSimulation();
  const { snapshot, trace } = useLiveDynamics();
  const data = trace.map((p) => ({
    hour: p.hour,
    "Outdoor T (°F)": +p.outdoorTempF.toFixed(1),
    "Indoor T (°F)": +p.indoorTempF.toFixed(1),
    "Outdoor RH (%)": +p.outdoorRH.toFixed(0),
    "Canopy PPFD ÷10": +(p.canopyPPFD / 10).toFixed(0),
    // Solar heat gain in kW, scaled ÷10 to share the axis with T / PPFD.
    "Solar gain kW÷10": +(btuhrToKW(p.solarGainBTUhr) / 10).toFixed(1),
    "Lights on": p.supplementalOnFraction * 100,
    "Vent open": p.ventOpen * 100,
  }));
  const coolingKW = btuhrToKW(snapshot.padCoolingBTUhr + snapshot.fogCoolingBTUhr);

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="card-header">
          <span>Live snapshot · {snapshot.lights.reason.replace("-", " ")}</span>
          <span className={`tag ${snapshot.lights.on ? "tag-info" : "tag-muted"}`}>
            {snapshot.lights.on ? `Lights ON @ ${(snapshot.lights.dimLevel * 100).toFixed(0)}%` : "Lights OFF"}
          </span>
        </div>
        <div className="card-body grid grid-cols-2 gap-3 md:grid-cols-6">
          <Stat label="Sun elevation" value={`${fmt1(snapshot.sun.elevationDeg)}°`} hint={snapshot.sun.isDaytime ? "above horizon" : "below horizon"} />
          <Stat label="Sun azimuth" value={`${fmt1(snapshot.sun.azimuthDeg)}° from N`} />
          <Stat label="Outdoor T" value={`${fmt1(snapshot.outdoorTempF)}°F`} />
          <Stat label="Outdoor RH" value={`${fmtInt(snapshot.outdoorRH)}%`} />
          <Stat label="Indoor T" value={`${fmt1(snapshot.indoorTempF)}°F`} hint={snapshot.ventOpen ? "vents open" : "vents closed"} />
          <Stat label="Canopy PPFD" value={`${fmtInt(snapshot.canopyTotalPPFD)} µmol/m²/s`} hint={`${fmtInt(snapshot.canopyNaturalPPFD)} natural`} />
          <Stat label="Solar gain" value={`${fmtInt(btuhrToKW(snapshot.solarGainBTUhr))} kW`} hint="greenhouse effect" />
          <Stat label="Evap cooling" value={`${fmtInt(coolingKW)} kW`} hint="wet wall + fog" />
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>24-hour dynamics · current day</span>
          <span className="text-xs text-ink-500">PPFD scaled ÷10 to fit shared axis · Lights/Vent shown 0–100</span>
        </div>
        <div className="card-body" style={{ height: 360 }}>
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="hour" type="number" domain={[0, 24]} ticks={[0,3,6,9,12,15,18,21,24]} tickFormatter={(v) => `${v}:00`} stroke="#5b6573" />
              <YAxis stroke="#5b6573" />
              <Tooltip />
              <Legend />
              <Area dataKey="Lights on" fill="#e8b04a44" stroke="#e8b04a" type="step" />
              <Area dataKey="Vent open" fill="#5b657344" stroke="#5b6573" type="step" />
              <Line dataKey="Canopy PPFD ÷10" stroke="#1f6c50" strokeWidth={2} dot={false} />
              <Line dataKey="Outdoor T (°F)" stroke="#c0573a" strokeWidth={2} dot={false} />
              <Line dataKey="Indoor T (°F)" stroke="#0d1117" strokeWidth={2} dot={false} />
              <Line dataKey="Solar gain kW÷10" stroke="#e8843a" strokeWidth={1.5} dot={false} strokeDasharray="5 2" />
              <Line dataKey="Outdoor RH (%)" stroke="#aa3bff" strokeWidth={1.5} dot={false} strokeDasharray="3 3" />
              <ReferenceLine x={sim.hourOfDay} stroke="#0d1117" strokeWidth={1.5} label={{ value: "now", fontSize: 10, fill: "#0d1117" }} />
              <ReferenceLine y={inputs.indoorTargetDryBulbF} stroke="#5b6573" strokeDasharray="2 2" label={{ value: `${inputs.indoorTargetDryBulbF}°F target`, fontSize: 10, position: "left", fill: "#5b6573" }} />
              <ReferenceLine y={inputs.flowerWindowStartHr * 0} stroke="transparent" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="card-body pt-0 text-[11px] text-ink-500">
          Yellow band = lights on · gray band = vents open · green = canopy PPFD ÷10 · red = outdoor air T · black = indoor air T · orange dashed = solar heat gain (kW ÷10) · purple dashed = outdoor RH. The "now" line follows the simulation clock — press play and watch the day unfold.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div className="font-mono text-base font-semibold text-ink-900">{value}</div>
      {hint && <div className="text-[11px] text-ink-500">{hint}</div>}
    </div>
  );
}
