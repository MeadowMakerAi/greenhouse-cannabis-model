import type { ReactNode } from "react";
import { useScenario } from "../context/ScenarioContext";
import { useSimulation } from "../context/SimulationContext";
import { useLiveDynamics } from "../context/useLiveDynamics";
import { dayOfYearToMonth } from "../models/simulationModel";

const MONTH = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
function fmtDate(doy: number) {
  const m = dayOfYearToMonth(doy);
  return `${MONTH[m]} ${doy - CUM[m]}`;
}
function fmtTime(h: number) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? "PM" : "AM";
  const d = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${d}:${String(min).padStart(2, "0")} ${ampm}`;
}

/**
 * Compact environmental read-out for the full-screen overlay's "Data" bottom
 * sheet. Hidden by default so the greenhouse owns the frame; this is the
 * same telemetry the corner HUD shows, re-laid-out as a dense scrollable
 * sheet that never covers the plant. Reads the live snapshot directly.
 */
export default function GreenhouseDataSheet() {
  const { inputs } = useScenario();
  const sim = useSimulation();
  const { snapshot } = useLiveDynamics();
  const supplemental = Math.max(0, snapshot.canopyTotalPPFD - snapshot.canopyNaturalPPFD);
  // Outdoor = open-air: the live snapshot's canopy/indoor/systems fields are
  // greenhouse-attenuated (useLiveDynamics applies glazing transmission + a
  // supplemental-light solve off inputs.envelope), so they'd misrepresent
  // open-air conditions. Show only genuinely-outdoor telemetry: weather, sun,
  // location. (The DLI/economics path is already mode-correct via useDerived;
  // this sheet reads the separate live-sim snapshot, left untouched.)
  const outdoor = inputs.mode === "outdoor";

  const outdoorGroup = (
    <Group title="Outdoor">
      <Stat label="Temp" value={snapshot.outdoorTempF.toFixed(1)} unit="°F" />
      <Stat label="RH" value={snapshot.outdoorRH.toFixed(0)} unit="%" />
      <Stat label="VPD" value={snapshot.outdoorVPD.toFixed(2)} unit="kPa" />
    </Group>
  );

  return (
    <div className="space-y-3 text-ink-900">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-lg font-semibold tabular-nums">
          {fmtDate(sim.dayOfYear)} · {fmtTime(sim.hourOfDay)}
        </span>
        {/* Growth-sim crop state — not validated open-air, hidden outdoors. */}
        {!outdoor && (
          <span className="text-[11px] text-ink-500">
            day {snapshot.plant.daysElapsed} · {snapshot.plant.phase.replace(/-/g, " ")}
          </span>
        )}
      </div>

      {/* Canopy PPFD — greenhouse-transmitted + supplemental, so indoor-only. */}
      {!outdoor && (
        <div className="rounded-xl border border-leaf-500/25 bg-leaf-50 px-3 py-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] uppercase tracking-wider text-ink-500">Canopy PPFD</span>
            <span className="font-mono text-xl font-semibold tabular-nums text-ink-900">
              {snapshot.canopyTotalPPFD.toFixed(0)}
              <span className="ml-1 text-[10px] font-normal text-ink-500">µmol/m²/s</span>
            </span>
          </div>
          <div className="mt-0.5 flex justify-between text-[11px] tabular-nums text-ink-500">
            <span><span className="text-leaf-700">{snapshot.canopyNaturalPPFD.toFixed(0)}</span> natural</span>
            <span><span className="text-sun-600">{supplemental.toFixed(0)}</span> supplemental</span>
          </div>
        </div>
      )}

      {outdoor ? (
        outdoorGroup
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Group title="Indoor (canopy)">
            <Stat label="Temp" value={snapshot.indoorTempF.toFixed(1)} unit="°F" />
            <Stat label="RH" value={snapshot.indoorRH.toFixed(0)} unit="%" />
            <Stat label="VPD" value={snapshot.indoorVPD.toFixed(2)} unit="kPa" highlight />
          </Group>
          {outdoorGroup}
        </div>
      )}

      {/* Climate-system states (lights/vents/shade/blackout) only exist in a
          greenhouse — hidden outdoors. The sun + location line stays: honest
          open-air. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border border-ink-200/70 bg-white px-3 py-2 text-[12px]">
        {!outdoor && (
          <>
            <System label="Lights" on={snapshot.lights.on} text={snapshot.lights.on ? `${(snapshot.lights.dimLevel * 100).toFixed(0)}%` : "off"} tone="sun" />
            <System label="Vents" on={snapshot.ventOpen > 0} text={snapshot.ventOpen > 0 ? "open" : "closed"} tone="leaf" />
            <System label="Shade" on={snapshot.shadeActive} text={snapshot.shadeActive ? "deployed" : "retracted"} tone="sun" />
            <System label="Blackout" on={snapshot.blackoutActive} text={snapshot.blackoutActive ? "deployed" : "retracted"} tone="ink" />
          </>
        )}
        <div className={`col-span-2 flex items-center justify-between text-[11px] text-ink-500 ${outdoor ? "" : "border-t border-ink-200/60 pt-1.5"}`}>
          <span>Sun {snapshot.sun.elevationDeg.toFixed(0)}° elev · {snapshot.sun.azimuthDeg.toFixed(0)}° az</span>
          <span>{inputs.latitude.toFixed(2)}°, {inputs.longitude.toFixed(2)}°</span>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-ink-200/70 bg-white px-3 py-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink-500">{title}</div>
      <div className="grid grid-cols-3 gap-2">{children}</div>
    </div>
  );
}

function Stat({ label, value, unit, highlight }: { label: string; value: string; unit: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[9px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`font-mono text-sm font-semibold tabular-nums ${highlight ? "text-leaf-600" : "text-ink-900"}`}>
        {value}
        <span className="ml-0.5 text-[9px] font-normal text-ink-500">{unit}</span>
      </div>
    </div>
  );
}

function System({ label, on, text, tone }: { label: string; on: boolean; text: string; tone: "sun" | "leaf" | "ink" }) {
  const dot = !on ? "bg-ink-300" : tone === "sun" ? "bg-sun-500" : tone === "leaf" ? "bg-leaf-500" : "bg-ink-900";
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-wider text-ink-500">{label}</span>
      <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-ink-900">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        {text}
      </span>
    </div>
  );
}
