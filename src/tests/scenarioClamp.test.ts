import { describe, expect, it } from "vitest";
import {
  clampScenarioInputs,
  defaultScenario,
  type ScenarioInputs,
} from "../context/ScenarioContext";

/**
 * Regression tests for the share-URL hydration bypass found in
 * `/codex challenge` round 2: a malicious or stale share link wrote
 * decoded patches straight into state via setInputsState, bypassing
 * the setInputs clamp logic. The fix extracts the clamp into
 * `clampScenarioInputs` and calls it on every mutation path. These
 * tests pin that contract.
 */
describe("clampScenarioInputs", () => {
  it("clamps out-of-range co2SetpointPpm down (high)", () => {
    const r = clampScenarioInputs({
      ...defaultScenario,
      co2SetpointPpm: 10000,
    });
    expect(r.co2SetpointPpm).toBe(2000);
  });

  it("clamps out-of-range co2SetpointPpm up (low / negative)", () => {
    const lowR = clampScenarioInputs({
      ...defaultScenario,
      co2SetpointPpm: -50,
    });
    expect(lowR.co2SetpointPpm).toBe(350);

    const nanR = clampScenarioInputs({
      ...defaultScenario,
      co2SetpointPpm: NaN as unknown as number,
    });
    expect(nanR.co2SetpointPpm).toBe(350);
  });

  it("passes through valid co2SetpointPpm unchanged", () => {
    const r = clampScenarioInputs({
      ...defaultScenario,
      co2SetpointPpm: 1200,
    });
    expect(r.co2SetpointPpm).toBe(1200);
  });

  it("clamps greenhouse geometry to sane ranges", () => {
    const r = clampScenarioInputs({
      ...defaultScenario,
      greenhouseLengthFt: 5000, // way over 300
      greenhouseWidthFt: 2, // way under 8
      eaveHeightFt: 100, // way over 18
    });
    expect(r.greenhouseLengthFt).toBe(300);
    expect(r.greenhouseWidthFt).toBe(8);
    expect(r.eaveHeightFt).toBe(18);
  });

  it("returns a new object, does not mutate input (pure function)", () => {
    const original: ScenarioInputs = {
      ...defaultScenario,
      co2SetpointPpm: 10000,
    };
    const snapshot = { ...original };
    clampScenarioInputs(original);
    expect(original.co2SetpointPpm).toBe(snapshot.co2SetpointPpm);
  });

  it("handles NaN in dimensions without producing NaN output (3D scene safety)", () => {
    const r = clampScenarioInputs({
      ...defaultScenario,
      greenhouseLengthFt: NaN as unknown as number,
      canopyAreaSqFt: NaN as unknown as number,
    });
    expect(Number.isFinite(r.greenhouseLengthFt)).toBe(true);
    expect(Number.isFinite(r.canopyAreaSqFt)).toBe(true);
  });

  it("clamps flowerPhotoperiodHours to [1, 24] (DLI tile divide-by-zero safety)", () => {
    expect(
      clampScenarioInputs({ ...defaultScenario, flowerPhotoperiodHours: 0 })
        .flowerPhotoperiodHours,
    ).toBe(1);
    expect(
      clampScenarioInputs({ ...defaultScenario, flowerPhotoperiodHours: -5 })
        .flowerPhotoperiodHours,
    ).toBe(1);
    expect(
      clampScenarioInputs({ ...defaultScenario, flowerPhotoperiodHours: 36 })
        .flowerPhotoperiodHours,
    ).toBe(24);
    expect(
      clampScenarioInputs({ ...defaultScenario, flowerPhotoperiodHours: 12 })
        .flowerPhotoperiodHours,
    ).toBe(12);
  });
});
