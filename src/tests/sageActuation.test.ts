import { describe, it, expect } from "vitest";
import { expandDottedKeys } from "../utils/expandDottedKeys";
import {
  clampScenarioInputs,
  defaultScenario,
} from "../context/ScenarioContext";

// Regression tests for the 2026-07-13 Sage actuation fixes. Each guards a
// confirmed root cause from the tune-up diagnosis.

describe("expandDottedKeys — set_scenario dotted-path handling", () => {
  it("expands a dotted key into a nested object", () => {
    expect(expandDottedKeys({ "envelope.baseTransmissionPct": 70 })).toEqual({
      envelope: { baseTransmissionPct: 70 },
    });
  });

  it("merges multiple dotted keys under one parent", () => {
    expect(
      expandDottedKeys({
        "envelope.baseTransmissionPct": 70,
        "envelope.structureShadeLossPct": 8,
      }),
    ).toEqual({ envelope: { baseTransmissionPct: 70, structureShadeLossPct: 8 } });
  });

  it("passes non-dotted keys through unchanged", () => {
    expect(expandDottedKeys({ greenhouseLengthFt: 120, co2Enabled: true })).toEqual({
      greenhouseLengthFt: 120,
      co2Enabled: true,
    });
  });

  it("accepts an already-nested object (idempotent shape)", () => {
    expect(expandDottedKeys({ envelope: { baseTransmissionPct: 70 } })).toEqual({
      envelope: { baseTransmissionPct: 70 },
    });
  });

  it("drops __proto__ / prototype path segments (no prototype pollution)", () => {
    const out = expandDottedKeys({ "__proto__.polluted": true, "a.constructor.x": 1 });
    expect(out).toEqual({});
    // Object.prototype is untouched.
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("clampScenarioInputs — greenhouse width bound", () => {
  it("preserves the shipped 90 ft default width (no silent snap to 60)", () => {
    // The default house is 120×90; a 60 ft cap used to snap it to 60 on the
    // first write of any session, corrupting all geometry + energy math.
    const clamped = clampScenarioInputs({ ...defaultScenario });
    expect(clamped.greenhouseWidthFt).toBe(90);
  });

  it("still clamps an out-of-range width to the multi-bay max", () => {
    const clamped = clampScenarioInputs({ ...defaultScenario, greenhouseWidthFt: 5000 });
    expect(clamped.greenhouseWidthFt).toBe(300);
  });
});

describe("defaultScenario — assess_completeness source of truth", () => {
  it("has a real fixture id that resolves (not the stale 'ledHighEfficiency' literal)", () => {
    // The assess_completeness handler compares against defaultScenario.fixtureId;
    // a drifted literal made a fresh scenario report its default fixture as
    // user-established, inverting the lighting completeness answer.
    expect(defaultScenario.fixtureId).toBe("gavitaPro1700eLED");
    expect(defaultScenario.fixtureId).not.toBe("ledHighEfficiency");
  });
});
