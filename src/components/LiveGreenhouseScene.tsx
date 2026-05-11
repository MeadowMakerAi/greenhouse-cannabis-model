import { useState } from "react";
import Greenhouse3D from "./Greenhouse3D";
import Greenhouse3DHud from "./Greenhouse3DHud";
import { useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";
import { useLiveDynamics } from "../context/useLiveDynamics";
import { useSimulation } from "../context/SimulationContext";
import { dayOfYearToMonth } from "../models/simulationModel";
import {
  getFixtureFormFactor,
  getFixtureKelvin,
} from "../models/fixtureModel";
import { fmt1 } from "../utils/formatting";

function formatHour(h: number) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function formatDOY(doy: number) {
  const cumStart = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const m = dayOfYearToMonth(doy);
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m]} ${doy - cumStart[m]}`;
}

/**
 * Live 3D greenhouse scene with HUD overlay + simulation play controls.
 * Reusable across tabs (BuildSheet, Live simulation, Cultivation science).
 *
 * Props let the host tab control which fixture to render and how big the
 * canopy is — but the structural exterior dims, sun position, lights/vents
 * state come from the scenario + simulation contexts.
 */
export interface LiveGreenhouseSceneProps {
  fixtureCount: number;
  gridSpacingFt: number;
  /** When true (default), sun + lights + vents follow the simulation clock. */
  syncToSim?: boolean;
  /** Render the 3D canvas as the page substrate — no card chrome, edge
   *  vignette blends into surrounding plane. Used on the marquee tabs
   *  (Live, Cultivation Science) where the scene is the focus. */
  bleed?: boolean;
}

export default function LiveGreenhouseScene({
  fixtureCount,
  gridSpacingFt,
  syncToSim = true,
  bleed = false,
}: LiveGreenhouseSceneProps) {
  const { inputs } = useScenario();
  const derived = useDerived();
  const live = useLiveDynamics();
  const sim = useSimulation();

  // Active fixture identity drives the 3D scene's lamp geometry, emissive
  // color, and footprint tint. Resolved here so the scene reacts whenever
  // the user picks a different fixture in the assumption panel.
  const activeFixture = derived.fixture;
  const fixtureFormFactor = getFixtureFormFactor(activeFixture);
  const fixtureKelvin = getFixtureKelvin(activeFixture);

  const [month, setMonth] = useState(5);
  const [ridgeAzimuth, setRidgeAzimuth] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [showVentsOpen, setShowVentsOpen] = useState(false);
  const [showThermal, setShowThermal] = useState<boolean | null>(null);
  const [showShade, setShowShade] = useState<boolean | null>(null);

  const thermalActive = showThermal ?? inputs.thermalScreenEnabled;
  const shadeActive = showShade ?? inputs.shadeEnabled;

  return (
    <div className="space-y-2">
      {syncToSim && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-leaf-500/30 bg-leaf-50 p-2 text-xs text-ink-700">
          <button
            type="button"
            onClick={sim.togglePlay}
            disabled={sim.rangePlaying}
            className={
              sim.playing
                ? "btn-danger px-3 py-1 text-xs"
                : "btn-primary px-3 py-1 text-xs"
            }
          >
            {sim.playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          {sim.rangePlaying ? (
            <button
              type="button"
              onClick={sim.stopRangePlay}
              className="btn-danger px-3 py-1 text-xs"
            >
              ❚❚ Stop range
            </button>
          ) : (
            <button
              type="button"
              onClick={sim.startRangePlay}
              className="btn-primary px-3 py-1 text-xs"
            >
              ▶ Play range
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              sim.setRangeStart(sim.dayOfYear, 4);
              sim.setRangeEnd(sim.dayOfYear, 22);
            }}
            className="btn px-2 py-0.5 text-[11px]"
            title="Set range to 4am-10pm of current day"
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => {
              sim.setRangeStart(sim.dayOfYear, 0);
              sim.setRangeEnd(sim.dayOfYear + 7, 0);
            }}
            className="btn px-2 py-0.5 text-[11px]"
            title="1 week from current day"
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => {
              const end = Math.min(365, sim.dayOfYear + 56);
              sim.setRangeStart(sim.dayOfYear, 0);
              sim.setRangeEnd(end, 0);
            }}
            className="btn px-2 py-0.5 text-[11px]"
            title="8-week flower cycle from current"
          >
            8-wk cycle
          </button>
          <button
            type="button"
            onClick={() => {
              const end = Math.min(365, sim.dayOfYear + 90);
              sim.setRangeStart(sim.dayOfYear, 0);
              sim.setRangeEnd(end, 0);
            }}
            className="btn px-2 py-0.5 text-[11px]"
            title="3-month season from current"
          >
            Season
          </button>
          <button
            type="button"
            onClick={() => {
              sim.setRangeStart(1, 0);
              sim.setRangeEnd(365, 24);
            }}
            className="btn px-2 py-0.5 text-[11px]"
            title="Full year"
          >
            Year
          </button>
          <span className="ml-1 font-mono tabular-nums text-ink-900">
            {formatDOY(sim.dayOfYear)} · {formatHour(sim.hourOfDay)}
          </span>
          <span className="text-[11px] text-ink-500">
            sun {fmt1(live.snapshot.sun.elevationDeg)}° · lights{" "}
            {live.snapshot.lights.on
              ? `${(live.snapshot.lights.dimLevel * 100).toFixed(0)}%`
              : "off"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-700">
        {!syncToSim && (
          <label className="flex items-center gap-2">
            <span className="font-medium">Sun: month</span>
            <input
              type="range"
              min={0}
              max={11}
              step={1}
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-32"
            />
            <span className="font-mono text-ink-900">
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]}
            </span>
          </label>
        )}
        <label className="flex items-center gap-2">
          <span className="font-medium">Ridge azimuth</span>
          <input
            type="range"
            min={-90}
            max={90}
            step={5}
            value={ridgeAzimuth}
            onChange={(e) => setRidgeAzimuth(parseInt(e.target.value, 10))}
            className="w-32"
          />
          <span className="font-mono text-ink-900">{ridgeAzimuth}°</span>
        </label>
        {!syncToSim && (
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showVentsOpen}
              onChange={(e) => setShowVentsOpen(e.target.checked)}
            />
            <span>Roof vents open</span>
          </label>
        )}
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={thermalActive}
            onChange={(e) => setShowThermal(e.target.checked)}
          />
          <span>Thermal screen</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={shadeActive}
            onChange={(e) => setShowShade(e.target.checked)}
          />
          <span>Shade cloth</span>
        </label>
        <button
          type="button"
          className="btn px-2 py-0.5 text-[11px]"
          onClick={() => setResetSignal((s) => s + 1)}
        >
          Reset view
        </button>
        <span className="text-[11px] text-ink-500">Drag · scroll · right-drag to pan</span>
      </div>

      <div className="relative">
        <Greenhouse3D
          floorAreaSqFt={inputs.greenhouseFloorAreaSqFt}
          canopyAreaSqFt={inputs.canopyAreaSqFt}
          fixtureCount={fixtureCount}
          gridSpacingFt={gridSpacingFt}
          glazingPct={inputs.envelope.baseTransmissionPct}
          latitudeDeg={inputs.latitude}
          greenhouseLengthFt={inputs.greenhouseLengthFt}
          greenhouseWidthFt={inputs.greenhouseWidthFt}
          eaveHeightFt={inputs.eaveHeightFt}
          peakHeightFt={inputs.peakHeightFt}
          month={month}
          ridgeAzimuthDeg={ridgeAzimuth}
          resetCameraSignal={resetSignal}
          thermalScreenActive={thermalActive}
          shadeActive={shadeActive}
          shadeTransmissionPct={inputs.shadeTransmissionPct}
          roofVentsOpen={syncToSim ? live.snapshot.ventOpen : showVentsOpen}
          blackoutActive={syncToSim ? live.snapshot.blackoutActive : false}
          liveSunAzimuthDeg={syncToSim ? live.snapshot.sun.azimuthDeg : undefined}
          liveSunElevationDeg={syncToSim ? live.snapshot.sun.elevationDeg : undefined}
          lightsDimLevel={
            syncToSim
              ? live.snapshot.lights.on
                ? live.snapshot.lights.dimLevel
                : 0
              : 1
          }
          fixtureFormFactor={fixtureFormFactor}
          fixtureKelvin={fixtureKelvin}
          fixtureWatts={activeFixture.wattsPerFixture}
          fixtureType={activeFixture.type}
          fixtureLabel={activeFixture.label}
          plantGrowth={syncToSim ? live.snapshot.plant : undefined}
          bleed={bleed}
        />
        {syncToSim && <Greenhouse3DHud ridgeAzimuthDeg={ridgeAzimuth} />}
      </div>
    </div>
  );
}
