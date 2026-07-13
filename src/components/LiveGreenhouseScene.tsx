import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Greenhouse3D from "./Greenhouse3DLazy";
import Greenhouse3DHud from "./Greenhouse3DHud";
import SceneThumbnailCard from "./SceneThumbnailCard";
import GreenhouseDataSheet from "./GreenhouseDataSheet";
import { useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";
import { useLiveDynamics } from "../context/useLiveDynamics";
import { useSimulation } from "../context/SimulationContext";
import { useIsDesktop } from "../hooks/useIsDesktop";
import { useLiveWeather } from "../context/useLiveWeather";
import { useDragResize } from "../hooks/useDragResize";
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
 * Responsive presentation (mobile scene UX):
 *   - Desktop (≥ md): the inline live scene + corner HUD + control rows.
 *   - Phone (< md): a lightweight tap-to-open card (no WebGL) that opens a
 *     full-screen overlay where the greenhouse owns the viewport and the
 *     environmental data lives in an on-demand "Data" bottom sheet.
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
  const isDesktop = useIsDesktop();
  const weather = useLiveWeather();
  const { handleRef: resizeHandleRef, size: sceneHeight } = useDragResize(
    760, 320, 1200, "greenhouse-model:sceneHeight",
  );

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

  // Full-screen overlay + its on-demand data sheet.
  const [fullscreen, setFullscreen] = useState(false);
  const [dataOpen, setDataOpen] = useState(false);

  // Lock body scroll + wire Esc-to-close while the overlay is open.
  useEffect(() => {
    if (!fullscreen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (dataOpen) setDataOpen(false);
        else setFullscreen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, dataOpen]);

  const thermalActive = showThermal ?? inputs.thermalScreenEnabled;
  const shadeActive = showShade ?? inputs.shadeEnabled;

  // Single source of truth for the Greenhouse3D element — reused by the
  // inline desktop scene (fill=false) and the full-screen overlay (fill=true)
  // so both render the identical scenario without duplicating ~30 props.
  const renderScene = (fill: boolean) => (
    <Greenhouse3D
      floorAreaSqFt={inputs.greenhouseFloorAreaSqFt}
      canopyAreaSqFt={inputs.canopyAreaSqFt}
      fixtureCount={fixtureCount}
      gridSpacingFt={gridSpacingFt}
      glazingPct={inputs.envelope.baseTransmissionPct}
      latitudeDeg={inputs.latitude}
      greenhouseLengthFt={inputs.greenhouseLengthFt}
      greenhouseWidthFt={inputs.greenhouseWidthFt}
      benchLayout={inputs.benchLayout}
      eaveHeightFt={inputs.eaveHeightFt}
      peakHeightFt={inputs.peakHeightFt}
      month={month}
      ridgeAzimuthDeg={ridgeAzimuth}
      resetCameraSignal={resetSignal}
      thermalScreenActive={thermalActive}
      shadeActive={shadeActive}
      shadeTransmissionPct={inputs.shadeTransmissionPct}
      roofVentFraction={
        syncToSim ? live.snapshot.ventOpen : showVentsOpen ? 1 : 0
      }
      blackoutActive={syncToSim ? live.snapshot.blackoutActive : false}
      thermalScreenElevation={inputs.thermalScreenElevationFt}
      shadeElevation={inputs.shadeElevationFt}
      blackoutElevation={inputs.blackoutElevationFt}
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
      plantDensity={inputs.plantDensity}
      bleed={fill ? true : bleed}
      fill={fill}
      weather={weather}
      heightOverride={!fill && isDesktop ? sceneHeight : undefined}
      equipment={inputs.equipment ?? []}
      showEnvelope={inputs.mode === "greenhouse"}
    />
  );

  // Simulation play / range controls — reused inline (desktop) and in the
  // full-screen bottom bar.
  const simControls = syncToSim ? (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-leaf-500/30 bg-leaf-50 p-2 text-xs text-ink-700">
      <button
        type="button"
        onClick={sim.togglePlay}
        disabled={sim.rangePlaying}
        className={
          sim.playing ? "btn-danger px-3 py-1 text-xs" : "btn-primary px-3 py-1 text-xs"
        }
      >
        {sim.playing ? "❚❚ Pause" : "▶ Play"}
      </button>
      {sim.rangePlaying ? (
        <button type="button" onClick={sim.stopRangePlay} className="btn-danger px-3 py-1 text-xs">
          ❚❚ Stop range
        </button>
      ) : (
        <button type="button" onClick={sim.startRangePlay} className="btn-primary px-3 py-1 text-xs">
          ▶ Play range
        </button>
      )}
      <button
        type="button"
        onClick={() => { sim.setRangeStart(sim.dayOfYear, 4); sim.setRangeEnd(sim.dayOfYear, 22); }}
        className="btn px-2 py-0.5 text-[11px]"
        title="Set range to 4am-10pm of current day"
      >
        Day
      </button>
      <button
        type="button"
        onClick={() => { sim.setRangeStart(sim.dayOfYear, 0); sim.setRangeEnd(sim.dayOfYear + 7, 0); }}
        className="btn px-2 py-0.5 text-[11px]"
        title="1 week from current day"
      >
        Week
      </button>
      <button
        type="button"
        onClick={() => { const end = Math.min(365, sim.dayOfYear + 56); sim.setRangeStart(sim.dayOfYear, 0); sim.setRangeEnd(end, 0); }}
        className="btn px-2 py-0.5 text-[11px]"
        title="8-week flower cycle from current"
      >
        8-wk cycle
      </button>
      <button
        type="button"
        onClick={() => { const end = Math.min(365, sim.dayOfYear + 90); sim.setRangeStart(sim.dayOfYear, 0); sim.setRangeEnd(end, 0); }}
        className="btn px-2 py-0.5 text-[11px]"
        title="3-month season from current"
      >
        Season
      </button>
      <button
        type="button"
        onClick={() => { sim.setRangeStart(1, 0); sim.setRangeEnd(365, 24); }}
        className="btn px-2 py-0.5 text-[11px]"
        title="Full year"
      >
        Year
      </button>
      <span className="ml-1 font-mono tabular-nums text-ink-900">
        {formatDOY(sim.dayOfYear)} · {formatHour(sim.hourOfDay)}
      </span>
      <span className="text-[11px] text-ink-500">
        sun {fmt1(live.snapshot.sun.elevationDeg)}°
        {/* No supplemental fixtures open-air — drop the lights readout. */}
        {inputs.mode === "greenhouse" && (
          <>
            {" "}
            · lights{" "}
            {live.snapshot.lights.on
              ? `${(live.snapshot.lights.dimLevel * 100).toFixed(0)}%`
              : "off"}
          </>
        )}
      </span>
    </div>
  ) : null;

  // View options (sun month for static mode, ridge azimuth, screen toggles).
  const viewOptions = (
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
      {/* Envelope controls — only meaningful under a greenhouse roof. */}
      {inputs.mode === "greenhouse" && (
        <>
          {!syncToSim && (
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={showVentsOpen} onChange={(e) => setShowVentsOpen(e.target.checked)} />
              <span>Roof vents open</span>
            </label>
          )}
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={thermalActive} onChange={(e) => setShowThermal(e.target.checked)} />
            <span>Thermal screen</span>
          </label>
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={shadeActive} onChange={(e) => setShowShade(e.target.checked)} />
            <span>Shade cloth</span>
          </label>
        </>
      )}
      <button
        type="button"
        className="btn px-2 py-0.5 text-[11px]"
        onClick={() => setResetSignal((s) => s + 1)}
      >
        Reset view
      </button>
      <span className="text-[11px] text-ink-500">Drag · scroll · right-drag to pan</span>
    </div>
  );

  // ── Full-screen overlay (portal to body so no ancestor overflow clips it).
  const overlay =
    fullscreen &&
    createPortal(
      <div
        className="fixed inset-0 z-[60] flex flex-col bg-ink-900"
        style={{ height: "100dvh" }}
        role="dialog"
        aria-modal="true"
        aria-label="Greenhouse 3D model — full screen"
      >
        {/* Scene fills the available space; chrome floats over it. */}
        <div className="relative min-h-0 flex-1">
          {renderScene(true)}

          {/* Top bar */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 p-3"
            style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
          >
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              aria-label="Close full screen"
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/40 text-white backdrop-blur-md active:bg-black/60"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
            <span className="pointer-events-auto rounded-full border border-white/15 bg-black/40 px-3 py-1.5 font-mono text-xs tabular-nums text-white/90 backdrop-blur-md">
              {formatDOY(sim.dayOfYear)} · {formatHour(sim.hourOfDay)}
            </span>
            <button
              type="button"
              onClick={() => setDataOpen((v) => !v)}
              aria-pressed={dataOpen}
              className={`pointer-events-auto flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold backdrop-blur-md active:scale-95 ${
                dataOpen
                  ? "border-leaf-500/40 bg-leaf-500/80 text-white"
                  : "border-white/20 bg-black/40 text-white"
              }`}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-leaf-400" />
              Data
            </button>
          </div>
        </div>

        {/* Bottom control bar */}
        <div
          className="border-t border-white/10 bg-ink-900/95 px-3 pt-2"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 0.5rem)" }}
        >
          <div className="overflow-x-auto pb-1">{simControls}</div>
        </div>

        {/* Data bottom sheet — slides up over the scene on demand. */}
        {dataOpen && (
          <>
            <button
              type="button"
              aria-label="Dismiss data sheet"
              className="absolute inset-0 z-[1] cursor-default bg-black/30"
              onClick={() => setDataOpen(false)}
            />
            <div
              className="absolute inset-x-0 bottom-0 z-[2] max-h-[72dvh] overflow-y-auto rounded-t-2xl border-t border-ink-200 bg-white p-4 shadow-2xl"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)" }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-300" />
              <div className="mb-3 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-900">Environment &amp; systems</span>
                <button
                  type="button"
                  onClick={() => setDataOpen(false)}
                  className="rounded-full px-2 py-1 text-xs text-ink-500 active:bg-ink-100"
                >
                  Close
                </button>
              </div>
              <GreenhouseDataSheet />
              <div className="mt-4 border-t border-ink-200/70 pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">
                  View options
                </div>
                {viewOptions}
              </div>
            </div>
          </>
        )}
      </div>,
      document.body,
    );

  // ── Inline presentation: desktop renders the live scene, phones render the
  //    tap-to-open card (no WebGL until the overlay opens).
  return (
    <>
      {isDesktop ? (
        <div className="space-y-2">
          {simControls}
          {viewOptions}
          <div className="relative">
            {renderScene(false)}
            {syncToSim && <Greenhouse3DHud ridgeAzimuthDeg={ridgeAzimuth} />}
            {/* Drag handle — lets growers resize the scene vertically.
                Desktop only; persists to localStorage. */}
            <div
              ref={resizeHandleRef}
              role="separator"
              aria-label="Drag to resize scene"
              title="Drag to resize scene"
              className="absolute inset-x-0 -bottom-2 z-30 flex h-4 cursor-row-resize items-center justify-center select-none"
            >
              <div className="h-1 w-14 rounded-full bg-ink-300/70 transition hover:bg-leaf-500/60 hover:w-20" />
            </div>
            <button
              type="button"
              onClick={() => setFullscreen(true)}
              aria-label="Open full screen"
              title="Full screen"
              className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-lg border border-white/30 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md transition hover:bg-black/60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path
                  d="M9 3H5a2 2 0 0 0-2 2v4m18 0V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4m12-6v4a2 2 0 0 1-2 2h-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Full screen
            </button>
          </div>
        </div>
      ) : (
        <SceneThumbnailCard onOpen={() => setFullscreen(true)} />
      )}
      {overlay}
    </>
  );
}
