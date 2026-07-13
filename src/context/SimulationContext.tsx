import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface SimulationState {
  /** 1..365 */
  dayOfYear: number;
  /** 0..24 (solar local time, fractional) */
  hourOfDay: number;
  /** Currently animating? */
  playing: boolean;
  /**
   * Sim hours advanced per real second when playing (used in continuous mode).
   */
  speed: number;
  // ---- Range player ----
  rangeStartDOY: number;
  rangeEndDOY: number;
  rangeStartHour: number;
  rangeEndHour: number;
  /** Total real-time seconds to play the full range */
  rangeDurationSec: number;
  /** Loop range when finished */
  rangeLoop: boolean;
  /** Currently in range-play mode (vs continuous mode) */
  rangePlaying: boolean;
}

interface SimulationContextValue extends SimulationState {
  setDayOfYear: (d: number) => void;
  setHourOfDay: (h: number) => void;
  setPlaying: (b: boolean) => void;
  setSpeed: (s: number) => void;
  togglePlay: () => void;
  jumpTo: (preset: "dawn" | "noon" | "dusk" | "midnight" | "today") => void;
  setRangeStart: (doy: number, hour: number) => void;
  setRangeEnd: (doy: number, hour: number) => void;
  setRangeDuration: (s: number) => void;
  setRangeLoop: (b: boolean) => void;
  startRangePlay: () => void;
  stopRangePlay: () => void;
}

const Ctx = createContext<SimulationContextValue | null>(null);

const SPEED_PRESETS = [
  { label: "1×", value: 1 },
  { label: "1 hr/s", value: 60 * 60 / 60 },
  { label: "1 day/s", value: 24 },
  { label: "1 wk/s", value: 168 },
  { label: "1 mo/s", value: 720 },
];

export { SPEED_PRESETS };

export function SimulationProvider({ children }: { children: ReactNode }) {
  const [dayOfYear, setDayOfYear] = useState<number>(() => {
    const today = new Date();
    const start = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  });
  const [hourOfDay, setHourOfDay] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(168);
  // Range defaults: full summer day
  const [rangeStartDOY, setRangeStartDOY] = useState(172); // Jun 21
  const [rangeEndDOY, setRangeEndDOY] = useState(172);
  const [rangeStartHour, setRangeStartHour] = useState(4);
  const [rangeEndHour, setRangeEndHour] = useState(22);
  const [rangeDurationSec, setRangeDurationSec] = useState(10);
  const [rangeLoop, setRangeLoop] = useState(true);
  const [rangePlaying, setRangePlaying] = useState(false);

  const lastTickRef = useRef<number>(0);
  const rangeStartTimeRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  const togglePlay = useCallback(() => setPlaying((p) => !p), []);

  const jumpTo = useCallback(
    (preset: "dawn" | "noon" | "dusk" | "midnight" | "today") => {
      switch (preset) {
        case "dawn":
          setHourOfDay(6);
          break;
        case "noon":
          setHourOfDay(12);
          break;
        case "dusk":
          setHourOfDay(18);
          break;
        case "midnight":
          setHourOfDay(0);
          break;
        case "today": {
          const today = new Date();
          const start = new Date(today.getFullYear(), 0, 0);
          const diff = today.getTime() - start.getTime();
          setDayOfYear(Math.floor(diff / (1000 * 60 * 60 * 24)));
          setHourOfDay(today.getHours() + today.getMinutes() / 60);
          break;
        }
      }
    },
    [],
  );

  // Continuous-mode ticker
  useEffect(() => {
    if (!playing || rangePlaying) {
      lastTickRef.current = 0;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }
    const tick = (now: number) => {
      if (lastTickRef.current === 0) {
        lastTickRef.current = now;
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      // Throttle state commits to ≤10 Hz. Each setHourOfDay re-renders every
      // clock consumer (the whole 3D scene, HUD, charts); committing at the
      // full ~60 Hz rAF rate was ~6× the render work for motion the eye can't
      // resolve. dtSec still spans the full gap since last commit, so no
      // simulated time is dropped — the clock advances the same amount, just
      // in coarser steps. ponytail: 100ms fixed; expose if users want smoother.
      if (now - lastTickRef.current < 100) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      const dtSec = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      const dtSimHr = speed * dtSec;
      setHourOfDay((h) => {
        let nextH = h + dtSimHr;
        let dayInc = 0;
        while (nextH >= 24) {
          nextH -= 24;
          dayInc += 1;
        }
        if (dayInc > 0) {
          setDayOfYear((d) => {
            // Modulo wrap so a backgrounded tab producing dayInc >> 365 still
            // lands on a valid DOY (1..365). Codex P0: prior code only
            // subtracted one year.
            const nd = ((d - 1 + dayInc) % 365 + 365) % 365 + 1;
            return nd;
          });
        }
        return nextH;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, rangePlaying]);

  // Range-play ticker: interpolate across [start, end] over rangeDurationSec
  useEffect(() => {
    if (!rangePlaying) {
      rangeStartTimeRef.current = 0;
      return;
    }
    let raf: number | null = null;
    const startSimTime = rangeStartDOY * 24 + rangeStartHour;
    const endSimTime = rangeEndDOY * 24 + rangeEndHour;
    const totalSimHours = endSimTime - startSimTime;
    if (totalSimHours <= 0) {
      setRangePlaying(false);
      return;
    }
    const tick = (now: number) => {
      if (rangeStartTimeRef.current === 0) {
        rangeStartTimeRef.current = now;
      }
      const elapsedSec = (now - rangeStartTimeRef.current) / 1000;
      let progress = elapsedSec / rangeDurationSec;
      if (progress >= 1) {
        if (rangeLoop) {
          progress = 0;
          rangeStartTimeRef.current = now;
        } else {
          progress = 1;
          setRangePlaying(false);
        }
      }
      const t = startSimTime + totalSimHours * progress;
      // Wrap rather than clamp so a range that crosses Dec 31 plays through
      // Jan 1 instead of getting stuck at 365.
      const rawDOY = Math.floor(t / 24);
      const newDOY = ((rawDOY - 1) % 365 + 365) % 365 + 1;
      const newHour = ((t % 24) + 24) % 24;
      setDayOfYear(newDOY);
      setHourOfDay(newHour);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, [rangePlaying, rangeStartDOY, rangeEndDOY, rangeStartHour, rangeEndHour, rangeDurationSec, rangeLoop]);

  const setRangeStart = useCallback(
    (doy: number, hour: number) => {
      setRangeStartDOY(doy);
      setRangeStartHour(hour);
    },
    [],
  );
  const setRangeEnd = useCallback(
    (doy: number, hour: number) => {
      setRangeEndDOY(doy);
      setRangeEndHour(hour);
    },
    [],
  );
  const setRangeDuration = useCallback((s: number) => setRangeDurationSec(s), []);
  const startRangePlay = useCallback(() => {
    setPlaying(false); // stop continuous mode
    setRangePlaying(true);
  }, []);
  const stopRangePlay = useCallback(() => setRangePlaying(false), []);

  const value = useMemo(
    () => ({
      dayOfYear,
      hourOfDay,
      playing,
      speed,
      rangeStartDOY,
      rangeEndDOY,
      rangeStartHour,
      rangeEndHour,
      rangeDurationSec,
      rangeLoop,
      rangePlaying,
      setDayOfYear,
      setHourOfDay,
      setPlaying,
      setSpeed,
      togglePlay,
      jumpTo,
      setRangeStart,
      setRangeEnd,
      setRangeDuration,
      setRangeLoop,
      startRangePlay,
      stopRangePlay,
    }),
    [
      dayOfYear,
      hourOfDay,
      playing,
      speed,
      rangeStartDOY,
      rangeEndDOY,
      rangeStartHour,
      rangeEndHour,
      rangeDurationSec,
      rangeLoop,
      rangePlaying,
      togglePlay,
      jumpTo,
      setRangeStart,
      setRangeEnd,
      setRangeDuration,
      startRangePlay,
      stopRangePlay,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSimulation() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSimulation must be used within SimulationProvider");
  return v;
}
