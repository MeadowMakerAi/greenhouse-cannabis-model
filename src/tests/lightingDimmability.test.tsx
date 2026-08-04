import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { ReactNode } from "react";
import { renderHook, act } from "@testing-library/react";
import { ScenarioProvider, useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";

// Stub the mount climate fetch → deterministic fallback Montgomery normals.
beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("no network in test"))),
  );
});
afterAll(() => vi.unstubAllGlobals());

const wrapper = ({ children }: { children: ReactNode }) => (
  <ScenarioProvider>{children}</ScenarioProvider>
);

const renderModel = () =>
  renderHook(() => ({ scenario: useScenario(), derived: useDerived() }), {
    wrapper,
  });

describe("dynamic-lighting dimmability governs annual overhead energy", () => {
  it("default dimmable LED + controller trims below full-power year-round", () => {
    const { result } = renderModel();
    const d = result.current.derived;
    expect(d.canDimLights).toBe(true);
    const fullPower = d.peakInstalledKW * 12 * 365; // photoperiod 12 h
    // Seasonal solar means summer months de-rate → strictly below full power.
    expect(d.overheadAnnualKwh).toBeGreaterThan(0);
    expect(d.overheadAnnualKwh).toBeLessThan(fullPower);
  });

  it("removing the controller makes the SAME LED run full power year-round", () => {
    const { result } = renderModel();
    const trimmed = result.current.derived.overheadAnnualKwh;
    const peak = result.current.derived.peakInstalledKW;

    act(() => result.current.scenario.setInputs({ lightingControllerCapable: false }));

    const d = result.current.derived;
    expect(d.canDimLights).toBe(false);
    // Full power for the whole photoperiod, every day of the year.
    expect(d.overheadAnnualKwh).toBeCloseTo(peak * 12 * 365, 0);
    // And that's strictly more energy than the dimmed case.
    expect(d.overheadAnnualKwh).toBeGreaterThan(trimmed);
  });

  it("a non-dimmable fixture can't trim even with a controller, and Sage is warned", () => {
    const { result } = renderModel();
    act(() =>
      result.current.scenario.setInputs({
        fixtureId: "doubleEndedHPS",
        lightingControllerCapable: true,
      }),
    );
    const d = result.current.derived;
    expect(d.canDimLights).toBe(false);
    expect(
      d.warnings.global.some((w) => /aren.t dimmable|dimmable LEDs/.test(w)),
    ).toBe(true);
  });

  it("both DLI and PPFD targets are first-class (drive sizing + live setpoint)", () => {
    const { result } = renderModel();
    const t = result.current.derived.target;
    expect(t.targetDLI).toBeGreaterThan(0);
    expect(t.targetTopCanopyPPFD).toBeGreaterThan(0);
  });
});
