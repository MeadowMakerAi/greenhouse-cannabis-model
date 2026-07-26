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
    // Lower bounds were relaxed to 1 (from 8/6/7) to stop fighting
    // live typing — clearing "100" to type "120" used to snap the
    // intermediate "1" up to 8, jamming the input. NaN / negative
    // still get caught.
    const r = clampScenarioInputs({
      ...defaultScenario,
      greenhouseLengthFt: 5000, // way over 300 → clamped
      greenhouseWidthFt: 0, // not finite for our purposes (treated as <1)
      eaveHeightFt: 100, // way over 18 → clamped
    });
    expect(r.greenhouseLengthFt).toBe(300);
    expect(r.greenhouseWidthFt).toBe(1);
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

describe("registry-keyed id validation (live GPT-5 white-screen regression)", () => {
  // Found live TWICE in one spec-ingest session: the model invented a
  // cropTargetId, then a cultivationPhase. Any unguarded registry[id].field
  // dereference in the derived layer crashes the whole app.
  it("snaps unknown ids to defaults", () => {
    const r = clampScenarioInputs({
      ...defaultScenario,
      cropTargetId: "top-shelf-indoor" as ScenarioInputs["cropTargetId"],
      yieldRealismCase: "optimistic!!" as ScenarioInputs["yieldRealismCase"],
      cultivationPhase: "flowering" as ScenarioInputs["cultivationPhase"],
      ventilationMode: "open" as ScenarioInputs["ventilationMode"],
      // "sealed" is a valid ventilationMode but NOT a co2ControlMode — a
      // plausible LLM patch typo for "sealed_or_semi_sealed".
      co2ControlMode: "sealed" as ScenarioInputs["co2ControlMode"],
    });
    expect(r.cropTargetId).toBe(defaultScenario.cropTargetId);
    expect(r.yieldRealismCase).toBe(defaultScenario.yieldRealismCase);
    expect(r.cultivationPhase).toBe(defaultScenario.cultivationPhase);
    expect(r.ventilationMode).toBe(defaultScenario.ventilationMode);
    expect(r.co2ControlMode).toBe(defaultScenario.co2ControlMode);
  });

  it("passes valid ids through untouched", () => {
    const r = clampScenarioInputs({
      ...defaultScenario,
      cultivationPhase: "vegetative",
      ventilationMode: "sealed",
      co2ControlMode: "sealed_or_semi_sealed",
    });
    expect(r.cultivationPhase).toBe("vegetative");
    expect(r.ventilationMode).toBe("sealed");
    expect(r.co2ControlMode).toBe("sealed_or_semi_sealed");
  });
});
