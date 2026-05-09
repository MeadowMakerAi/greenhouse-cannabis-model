import { useSimulation, SPEED_PRESETS } from "../context/SimulationContext";
import { dayOfYearToMonth } from "../models/simulationModel";

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatHour(h: number) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function RangeEndpoint({
  label,
  accent,
  doy,
  hour,
  onDoyChange,
  onHourChange,
}: {
  label: string;
  accent: "leaf" | "warn";
  doy: number;
  hour: number;
  onDoyChange: (d: number) => void;
  onHourChange: (h: number) => void;
}) {
  const accentClass =
    accent === "leaf"
      ? "border-leaf-500/40 bg-leaf-50"
      : "border-warn-500/40 bg-warn-50";
  const accentLabel = accent === "leaf" ? "text-leaf-700" : "text-warn-600";
  return (
    <div className={`rounded-lg border ${accentClass} p-3`}>
      <div className={`text-xs font-bold uppercase tracking-wider ${accentLabel}`}>
        {label}
      </div>
      <div className="mt-1 mb-2 font-mono text-base font-semibold tabular-nums text-ink-900">
        {formatDayOfYear(doy)} · {formatHour(hour)}
      </div>
      <div className="space-y-2">
        <div>
          <div className="mb-0.5 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-ink-500">
            <span>Day of year</span>
            <span className="font-mono normal-case text-ink-700">{doy}</span>
          </div>
          <input
            type="range"
            min={1}
            max={365}
            step={1}
            value={doy}
            onChange={(e) => onDoyChange(parseInt(e.target.value, 10))}
            className="w-full"
          />
        </div>
        <div>
          <div className="mb-0.5 flex items-baseline justify-between text-[10px] uppercase tracking-wider text-ink-500">
            <span>Hour</span>
            <span className="font-mono normal-case text-ink-700">{formatHour(hour)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={24}
            step={0.5}
            value={hour}
            onChange={(e) => onHourChange(parseFloat(e.target.value))}
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}

function formatDayOfYear(doy: number) {
  const cumStart = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const m = dayOfYearToMonth(doy);
  const day = doy - cumStart[m];
  return `${MONTH_LABELS[m]} ${day}`;
}

export default function TimeControls() {
  const sim = useSimulation();
  return (
    <div className="card">
      <div className="card-header">
        <span>Time controls · live simulation clock</span>
        <span className="font-mono text-xs text-ink-500">
          {formatDayOfYear(sim.dayOfYear)} · {formatHour(sim.hourOfDay)} solar
        </span>
      </div>
      <div className="card-body space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={sim.togglePlay}
            className={`rounded px-3 py-1 text-sm font-semibold ${
              sim.playing ? "bg-warn-500 text-white" : "bg-leaf-500 text-white hover:bg-leaf-600"
            }`}
          >
            {sim.playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          {SPEED_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => sim.setSpeed(p.value)}
              className={`rounded border px-2 py-0.5 text-xs ${
                sim.speed === p.value
                  ? "border-leaf-500 bg-leaf-500/10 font-semibold text-leaf-600"
                  : "border-ink-300 hover:bg-leaf-500/5"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="ml-2 text-xs text-ink-500">
            speed: <span className="font-mono">{sim.speed.toFixed(0)}</span> sim-hr/sec
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="field-label flex items-baseline justify-between">
              <span>Day of year</span>
              <span className="font-mono text-ink-900 normal-case">
                {formatDayOfYear(sim.dayOfYear)} (DOY {sim.dayOfYear})
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={365}
              step={1}
              value={sim.dayOfYear}
              onChange={(e) => sim.setDayOfYear(parseInt(e.target.value, 10))}
              className="w-full"
            />
          </div>
          <div>
            <label className="field-label flex items-baseline justify-between">
              <span>Hour of day</span>
              <span className="font-mono text-ink-900 normal-case">{formatHour(sim.hourOfDay)} solar</span>
            </label>
            <input
              type="range"
              min={0}
              max={24}
              step={0.25}
              value={sim.hourOfDay}
              onChange={(e) => sim.setHourOfDay(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(["midnight", "dawn", "noon", "dusk", "today"] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => sim.jumpTo(preset)}
              className="rounded border border-ink-300 px-2 py-0.5 text-xs hover:bg-leaf-500/5"
            >
              Jump to {preset}
            </button>
          ))}
        </div>

        <div className="rounded border border-leaf-500/30 bg-leaf-500/[0.04] p-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-leaf-600">
              Date-range player
            </span>
            <button
              type="button"
              onClick={() => sim.setRangeStart(sim.dayOfYear, sim.hourOfDay)}
              className="rounded border border-ink-300 px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            >
              Use current as start
            </button>
            <button
              type="button"
              onClick={() => sim.setRangeEnd(sim.dayOfYear, sim.hourOfDay)}
              className="rounded border border-ink-300 px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            >
              Use current as end
            </button>
            <button
              type="button"
              onClick={() => {
                sim.setRangeStart(sim.dayOfYear, 4);
                sim.setRangeEnd(sim.dayOfYear, 22);
              }}
              className="rounded border border-ink-300 px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            >
              1 day (4am–10pm)
            </button>
            <button
              type="button"
              onClick={() => {
                sim.setRangeStart(sim.dayOfYear, 0);
                sim.setRangeEnd(sim.dayOfYear + 7, 0);
              }}
              className="rounded border border-ink-300 px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            >
              1 week
            </button>
            <button
              type="button"
              onClick={() => {
                sim.setRangeStart(1, 0);
                sim.setRangeEnd(365, 24);
              }}
              className="rounded border border-ink-300 px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            >
              Full year
            </button>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="text-xs">
              <span className="text-ink-500">Start: </span>
              <span className="font-mono text-ink-900">
                {formatDayOfYear(sim.rangeStartDOY)} · {formatHour(sim.rangeStartHour)}
              </span>
            </div>
            <div className="text-xs">
              <span className="text-ink-500">End: </span>
              <span className="font-mono text-ink-900">
                {formatDayOfYear(sim.rangeEndDOY)} · {formatHour(sim.rangeEndHour)}
              </span>
            </div>
            <RangeEndpoint
              label="START"
              accent="leaf"
              doy={sim.rangeStartDOY}
              hour={sim.rangeStartHour}
              onDoyChange={(d) => sim.setRangeStart(d, sim.rangeStartHour)}
              onHourChange={(h) => sim.setRangeStart(sim.rangeStartDOY, h)}
            />
            <RangeEndpoint
              label="END"
              accent="warn"
              doy={sim.rangeEndDOY}
              hour={sim.rangeEndHour}
              onDoyChange={(d) => sim.setRangeEnd(d, sim.rangeEndHour)}
              onHourChange={(h) => sim.setRangeEnd(sim.rangeEndDOY, h)}
            />
            <div className="md:col-span-2 flex flex-wrap items-center gap-3">
              <label className="text-xs">
                <span className="text-ink-500">Duration: </span>
                <input
                  type="number"
                  value={sim.rangeDurationSec}
                  onChange={(e) =>
                    sim.setRangeDuration(parseFloat(e.target.value) || 1)
                  }
                  step={1}
                  min={2}
                  max={600}
                  className="ml-1 w-16 rounded border border-ink-300 px-1 text-sm"
                />
                <span className="text-ink-500"> s</span>
              </label>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: "5s", v: 5 },
                  { label: "10s", v: 10 },
                  { label: "30s", v: 30 },
                  { label: "1 min", v: 60 },
                  { label: "5 min", v: 300 },
                  { label: "10 min", v: 600 },
                ].map((p) => (
                  <button
                    key={p.v}
                    type="button"
                    onClick={() => sim.setRangeDuration(p.v)}
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      sim.rangeDurationSec === p.v
                        ? "border-leaf-500 bg-leaf-500/10 font-semibold text-leaf-600"
                        : "border-ink-300 hover:bg-leaf-500/5"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={sim.rangeLoop}
                  onChange={(e) => sim.setRangeLoop(e.target.checked)}
                />
                <span>Loop</span>
              </label>
              {sim.rangePlaying ? (
                <button
                  type="button"
                  onClick={sim.stopRangePlay}
                  className="rounded bg-warn-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
                >
                  ❚❚ Stop range
                </button>
              ) : (
                <button
                  type="button"
                  onClick={sim.startRangePlay}
                  className="rounded bg-leaf-500 px-3 py-1 text-xs font-semibold text-white hover:bg-leaf-600"
                >
                  ▶ Play range
                </button>
              )}
              <span className="text-[11px] text-ink-500">
                Plays the start→end span over {sim.rangeDurationSec}s. Loop or one-shot.
              </span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-ink-500">
          Sun position, sky color, atmosphere, fixture brightness, and vent state all follow this clock. Press <strong>Play range</strong> to watch a chosen span (a day, week, season) play out in 5–60 seconds. The 3D scene's sky shifts through dawn → noon → twilight → night colors, fixtures dim/glow with the photoperiod schedule + natural-light deficit, and vents open when indoor T crosses the setpoint.
        </p>
      </div>
    </div>
  );
}
