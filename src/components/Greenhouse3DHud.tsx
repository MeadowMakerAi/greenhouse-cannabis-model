import { useScenario } from "../context/ScenarioContext";
import { useSimulation } from "../context/SimulationContext";
import { useLiveDynamics } from "../context/useLiveDynamics";
import { dayOfYearToMonth } from "../models/simulationModel";

const MONTH_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function formatDate(doy: number) {
  const cumStart = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const m = dayOfYearToMonth(doy);
  const day = doy - cumStart[m];
  return `${MONTH_LONG[m]} ${day}`;
}
function formatTime(h: number) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const ampm = hr >= 12 ? "PM" : "AM";
  const dispHr = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${dispHr}:${String(min).padStart(2, "0")} ${ampm}`;
}

/**
 * Glassmorphic heads-up display laid over the 3D scene.
 *
 * Layout (per HUD design references — NASA Eyes, OrbitView, Death Stranding):
 *   - Top-left:    Site identity (date, time, coords, day-of-year, sun pos)
 *   - Top-right:   Compass rose with sun-azimuth pointer
 *   - Bottom-left: Outdoor sensors (T, RH, VPD)
 *   - Bottom-right:Indoor sensors (T, RH, VPD, lights, vents)
 */
export default function Greenhouse3DHud({
  ridgeAzimuthDeg = 0,
}: {
  ridgeAzimuthDeg?: number;
}) {
  const { inputs } = useScenario();
  const sim = useSimulation();
  const { snapshot } = useLiveDynamics();

  const sunArrowAngle = (snapshot.sun.azimuthDeg - ridgeAzimuthDeg) % 360;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 select-none">
      {/* Top-left: identity */}
      <div className="pointer-events-auto absolute left-3 top-3 w-56 rounded-lg border border-white/30 bg-white/55 p-3 shadow-md backdrop-blur-md">
        <div className="text-[10px] uppercase tracking-wider text-ink-500">Cottage Grove farm</div>
        <div className="font-mono text-base font-semibold text-ink-900">{formatDate(sim.dayOfYear)}</div>
        <div className="font-mono text-2xl font-semibold tabular-nums text-ink-900">
          {formatTime(sim.hourOfDay)}
        </div>
        <div className="mt-1 grid grid-cols-2 gap-x-3 text-[10px] text-ink-700">
          <div>
            <div className="text-ink-500">Lat</div>
            <div className="font-mono">{inputs.latitude.toFixed(4)}°</div>
          </div>
          <div>
            <div className="text-ink-500">Lon</div>
            <div className="font-mono">{inputs.longitude.toFixed(4)}°</div>
          </div>
          <div>
            <div className="text-ink-500">DOY</div>
            <div className="font-mono">{sim.dayOfYear}</div>
          </div>
          <div>
            <div className="text-ink-500">Sun</div>
            <div className="font-mono tabular-nums">
              {snapshot.sun.elevationDeg.toFixed(0)}° / {snapshot.sun.azimuthDeg.toFixed(0)}°
            </div>
          </div>
        </div>
        <div className="mt-2 border-t border-ink-300/30 pt-1.5">
          <div className="text-[10px] uppercase tracking-wider text-ink-500">Crop</div>
          <div className="font-mono text-xs text-ink-900">
            day {snapshot.plant.daysElapsed} ·{" "}
            <span className="text-leaf-700">{snapshot.plant.phase.replace("-", " ")}</span>
          </div>
          <div className="font-mono text-[10px] text-ink-500 tabular-nums">
            ht {snapshot.plant.heightFt.toFixed(1)} ft · {snapshot.plant.colaCount} colas ·{" "}
            env {(snapshot.plant.combinedFactor * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* Top-right: compass with sun pointer */}
      <div className="pointer-events-auto absolute right-3 top-3 rounded-lg border border-white/30 bg-white/55 p-2 shadow-md backdrop-blur-md">
        <CompassRose
          sunAzimuthDeg={sunArrowAngle}
          sunElevationDeg={snapshot.sun.elevationDeg}
          ridgeAzimuthDeg={ridgeAzimuthDeg}
        />
      </div>

      {/* Bottom-left: outdoor */}
      <div className="pointer-events-auto absolute bottom-3 left-3 w-72 rounded-lg border border-white/30 bg-white/55 p-3 shadow-md backdrop-blur-md">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-500">Outdoor</span>
          <span className="text-[9px] text-ink-500">canopy 4 ft AGL approx</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Temp" value={snapshot.outdoorTempF.toFixed(1)} unit="°F" />
          <Stat label="RH" value={snapshot.outdoorRH.toFixed(0)} unit="%" />
          <Stat label="VPD" value={snapshot.outdoorVPD.toFixed(2)} unit="kPa" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-ink-300/30 pt-2">
          <Stat label="Outdoor PPFD" value={snapshot.outdoorPPFD.toFixed(0)} unit="µmol/m²/s" small />
          <Stat label="Dew point" value={snapshot.outdoorDewPointF.toFixed(0)} unit="°F" small />
        </div>
      </div>

      {/* Bottom-right: indoor */}
      <div className="pointer-events-auto absolute bottom-3 right-3 w-80 rounded-lg border border-white/30 bg-white/55 p-3 shadow-md backdrop-blur-md">
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <span className="text-[10px] uppercase tracking-wider text-ink-500">Indoor (canopy)</span>
          <span className="text-[9px] text-ink-500">leaf offset {inputs.leafTempOffsetC.toFixed(1)}°C</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Temp" value={snapshot.indoorTempF.toFixed(1)} unit="°F" />
          <Stat label="RH" value={snapshot.indoorRH.toFixed(0)} unit="%" />
          <Stat label="VPD" value={snapshot.indoorVPD.toFixed(2)} unit="kPa" highlight />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-ink-300/30 pt-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500">Lights</div>
            <div className="text-xs">
              <span
                className={`inline-block h-2 w-2 rounded-full ${snapshot.lights.on ? "bg-sun-500" : "bg-ink-300"}`}
              />
              {" "}
              <span className="font-mono">
                {snapshot.lights.on ? `${(snapshot.lights.dimLevel * 100).toFixed(0)}%` : "off"}
              </span>
              <span className="ml-1 text-[10px] text-ink-500">
                ({snapshot.lights.reason.replace("-", " ")})
              </span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-ink-500">Vents</div>
            <div className="text-xs">
              <span
                className={`inline-block h-2 w-2 rounded-full ${snapshot.ventOpen ? "bg-leaf-500" : "bg-ink-300"}`}
              />
              {" "}
              <span className="font-mono">{snapshot.ventOpen ? "open" : "closed"}</span>
            </div>
          </div>
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-wider text-ink-500">Canopy PPFD</div>
            <div className="font-mono text-sm">
              {snapshot.canopyTotalPPFD.toFixed(0)}
              <span className="text-[10px] text-ink-500"> µmol/m²/s</span>
              <span className="ml-2 text-[10px] text-ink-500">
                ({snapshot.canopyNaturalPPFD.toFixed(0)} natural, {Math.max(0, snapshot.canopyTotalPPFD - snapshot.canopyNaturalPPFD).toFixed(0)} supp.)
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  small,
  highlight,
}: {
  label: string;
  value: string;
  unit: string;
  small?: boolean;
  highlight?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-ink-500">{label}</div>
      <div className={`${small ? "text-xs" : "text-base"} font-mono font-semibold tabular-nums ${highlight ? "text-leaf-600" : "text-ink-900"}`}>
        {value}
        <span className="ml-0.5 text-[9px] font-normal text-ink-500">{unit}</span>
      </div>
    </div>
  );
}

function CompassRose({
  sunAzimuthDeg,
  sunElevationDeg,
  ridgeAzimuthDeg,
}: {
  sunAzimuthDeg: number;
  sunElevationDeg: number;
  ridgeAzimuthDeg: number;
}) {
  const size = 80;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;
  // Sun marker position: distance from center scales with elevation (90° = center, 0° = edge)
  const sunR = r * (1 - Math.max(0, sunElevationDeg) / 90);
  const sunRad = (sunAzimuthDeg * Math.PI) / 180;
  const sunX = cx + sunR * Math.sin(sunRad);
  const sunY = cy - sunR * Math.cos(sunRad);
  const ridgeRad = (ridgeAzimuthDeg * Math.PI) / 180;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#5b6573" strokeWidth="0.7" />
        <circle cx={cx} cy={cy} r={r * 0.5} fill="none" stroke="#5b6573" strokeWidth="0.4" strokeDasharray="2 2" />
        {/* Cardinal labels */}
        <text x={cx} y="9" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0d1117">N</text>
        <text x={size - 4} y={cy + 3} textAnchor="end" fontSize="8" fill="#5b6573">E</text>
        <text x={cx} y={size - 2} textAnchor="middle" fontSize="8" fill="#5b6573">S</text>
        <text x="4" y={cy + 3} textAnchor="start" fontSize="8" fill="#5b6573">W</text>
        {/* Greenhouse ridge orientation */}
        <line
          x1={cx + Math.sin(ridgeRad) * r * 0.85}
          y1={cy - Math.cos(ridgeRad) * r * 0.85}
          x2={cx - Math.sin(ridgeRad) * r * 0.85}
          y2={cy + Math.cos(ridgeRad) * r * 0.85}
          stroke="#1f6c50"
          strokeWidth="2"
        />
        {/* Sun marker */}
        {sunElevationDeg > -3 && (
          <g>
            {/* Sun ray */}
            <line x1={cx} y1={cy} x2={sunX} y2={sunY} stroke="#e8b04a" strokeWidth="1" opacity={0.7} />
            <circle cx={sunX} cy={sunY} r={sunElevationDeg > 0 ? 3.5 : 2.5} fill="#e8b04a" stroke="#0d1117" strokeWidth="0.5" />
          </g>
        )}
        {sunElevationDeg <= -3 && (
          <text x={cx} y={cy + 3} textAnchor="middle" fontSize="9" fill="#5b6573">
            night
          </text>
        )}
      </svg>
      <div className="text-[9px] text-ink-500">
        ridge <span className="font-mono">{ridgeAzimuthDeg}°</span> · sun{" "}
        <span className="font-mono">
          {sunAzimuthDeg.toFixed(0)}° / {sunElevationDeg.toFixed(0)}°
        </span>
      </div>
    </div>
  );
}
