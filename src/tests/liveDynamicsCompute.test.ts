import { describe, it, expect } from "vitest";
import {
  computeDayDynamics,
  computeSnapshot,
} from "../context/useLiveDynamics";
import { defaultScenario, type ClimateState } from "../context/ScenarioContext";
import { fallbackMontgomeryClimate } from "../data/fallbackMontgomeryClimate";
import { computeDerived } from "../context/useDerived";

// Shared harness: default Montgomery scenario, fallback climate, real derived.
const inputs = defaultScenario;
const climate: ClimateState = {
  data: fallbackMontgomeryClimate,
  source: "fallback",
  status: "ok",
  message: "",
  retrievedAt: "",
};
const derived = computeDerived(inputs, climate, {});
const JULY = 196; // mid-July day-of-year (peak solar)
const JAN = 15;

describe("useLiveDynamics memo split — computeDayDynamics / computeSnapshot", () => {
  it("computeDayDynamics builds a 49-point day trace with physical noon values", () => {
    const day = computeDayDynamics(inputs, climate, derived, JULY);
    expect(day.trace.length).toBe(49); // hours 0..24 step 0.5
    const noon = day.trace.find((p) => p.hour === 12)!;
    expect(noon).toBeDefined();
    expect(Number.isFinite(noon.indoorTempF)).toBe(true);
    expect(noon.indoorTempF).toBeGreaterThan(-20);
    expect(noon.indoorTempF).toBeLessThan(140);
    expect(noon.solarGainBTUhr).toBeGreaterThan(0); // sun is up at noon
    // plant state is day-keyed and returned from the day memo
    expect(day.plant).toBeDefined();
    expect(day.monthIdx).toBe(6); // July
  });

  it("snapshot tracks the HOUR off a single day compute (the split's whole point)", () => {
    const day = computeDayDynamics(inputs, climate, derived, JULY);
    // Same day object, three different hours → snapshot must differ by hour.
    const night = computeSnapshot(day, 2, inputs);
    const noon = computeSnapshot(day, 12, inputs);
    const evening = computeSnapshot(day, 20, inputs);

    expect(night.solarGainBTUhr).toBeLessThan(1); // dark
    expect(noon.solarGainBTUhr).toBeGreaterThan(night.solarGainBTUhr);
    expect(evening.solarGainBTUhr).toBeLessThan(noon.solarGainBTUhr);
    expect(noon.sun.elevationDeg).toBeGreaterThan(night.sun.elevationDeg);
    // Distinct snapshots from ONE day integration proves hour-driven, not day-recomputed.
    expect(noon.indoorTempF).not.toBe(night.indoorTempF);
    // plant is identical across hours (day-keyed, passed through unchanged)
    expect(noon.plant).toBe(night.plant);
  });

  it("snapshot at an exact trace hour matches that trace point's state (consistency)", () => {
    const day = computeDayDynamics(inputs, climate, derived, JULY);
    const hour = 12;
    const snap = computeSnapshot(day, hour, inputs);
    const tp = day.trace.find((p) => p.hour === hour)!;
    // The snapshot re-runs computeAt from the prior trace point's state, so it
    // reproduces the same step the trace point represents.
    expect(snap.indoorTempF).toBeCloseTo(tp.indoorTempF, 1);
    expect(snap.canopyTotalPPFD).toBeCloseTo(tp.canopyPPFD, 0);
    expect(snap.indoorRH).toBeCloseTo(tp.indoorRH, 1);
    expect(snap.solarGainBTUhr).toBeCloseTo(tp.solarGainBTUhr, 0);
  });

  it("winter vs summer day both finite and bounded", () => {
    for (const doy of [JAN, JULY]) {
      const day = computeDayDynamics(inputs, climate, derived, doy);
      for (const p of day.trace) {
        expect(Number.isFinite(p.indoorTempF)).toBe(true);
        expect(p.indoorTempF).toBeGreaterThanOrEqual(-20);
        expect(p.indoorTempF).toBeLessThanOrEqual(140);
        expect(p.indoorRH).toBeGreaterThanOrEqual(0);
        expect(p.indoorRH).toBeLessThanOrEqual(100);
      }
    }
  });

  it("PERF: a per-hour snapshot is far cheaper than re-integrating the whole day", () => {
    const day = computeDayDynamics(inputs, climate, derived, JULY);
    const N = 300;
    // warm-up (JIT)
    for (let i = 0; i < 30; i++) {
      computeDayDynamics(inputs, climate, derived, JULY);
      computeSnapshot(day, 12, inputs);
    }
    const t0 = performance.now();
    for (let i = 0; i < N; i++) computeDayDynamics(inputs, climate, derived, JULY);
    const dayMs = performance.now() - t0;

    const t1 = performance.now();
    for (let i = 0; i < N; i++) computeSnapshot(day, (i % 48) * 0.5, inputs);
    const snapMs = performance.now() - t1;

    const ratio = dayMs / snapMs;
    console.log(
      `[perf] day=${(dayMs / N).toFixed(3)}ms/call  snap=${(snapMs / N).toFixed(3)}ms/call  ratio=${ratio.toFixed(1)}x`,
    );
    // The day integration runs 49 computeAt calls (the 24h trace); the snapshot
    // runs ONE. Before the split, every clock tick paid the full day cost.
    // A conservative floor well below the ~45x structural ratio.
    expect(ratio).toBeGreaterThan(10);
  });
});
