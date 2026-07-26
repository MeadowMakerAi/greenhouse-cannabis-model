import { describe, it, expect } from "vitest";
import { computeDerived } from "../context/useDerived";
import { defaultScenario } from "../context/ScenarioContext";
import { fixtureLibrary } from "../data/fixtureLibrary";
import { fallbackMontgomeryClimate } from "../data/fallbackMontgomeryClimate";
import { supplementalDim } from "../models/dimmingControl";

/**
 * The real-time dimming control law is the SAME pure function the live sim uses
 * (models/dimmingControl.supplementalDim — imported here, not re-implemented, so
 * the test can't silently pass while production drifts). It's a pure function of
 * the target canopy PPFD, the instantaneous natural PPFD (the "light meter"),
 * and the installed full-power output (derived.installedFullCanopyPPFD). These
 * tests pin the fix that motivated it — the canopy sagging below target in
 * partial sun because the dim was applied twice.
 *
 * Old (buggy) law: supplemental = deficit × (deficit/target) = deficit²/target.
 * Correct law:     dim = min(1, deficit/installedFull); supplemental = dim×full.
 */
const climate = { data: fallbackMontgomeryClimate } as never;

/** Thin adapter over the production law (fixtures on) for the algebra cases. */
function dim(targetPPFD: number, naturalPPFD: number, installedFull: number) {
  const { dimLevel, supplementalPPFD } = supplementalDim({
    targetPPFD,
    naturalPPFD,
    installedFullPPFD: installedFull,
    on: true,
  });
  return { dimLevel, supplemental: supplementalPPFD };
}

describe("real-time dimming control law", () => {
  it("is off (dim 0) whenever the fixtures are not commanded on", () => {
    const off = supplementalDim({ targetPPFD: 925, naturalPPFD: 0, installedFullPPFD: 900, on: false });
    expect(off.dimLevel).toBe(0);
    expect(off.supplementalPPFD).toBe(0);
  });

  it("derives a positive installed full-output PPFD for a lit greenhouse design", () => {
    const d = computeDerived(
      { ...defaultScenario, fixtureId: "gavitaPro1700eLED" },
      climate,
      fixtureLibrary,
    );
    expect(d.installedFullCanopyPPFD).toBeGreaterThan(0);
    // Installed capacity must cover the worst-month supplemental requirement.
    const peakReq = Math.max(...d.months.map((m) => m.supplementalPPFDRequired));
    expect(d.installedFullCanopyPPFD).toBeGreaterThanOrEqual(peakReq - 1e-6);
    // Nameplate kW (the live-heat basis) must equal peak fixtures × rated watts,
    // and be ≥ the exact-watts peakInstalledKW (whole-fixture rounding slack).
    expect(d.installedNameplateKW).toBeCloseTo(
      (d.peakFixtureCount * d.fixture.wattsPerFixture) / 1000,
      6,
    );
    expect(d.installedNameplateKW).toBeGreaterThanOrEqual(d.peakInstalledKW - 1e-6);
  });

  it("holds the canopy at target in partial sun — no midday sag (the bug)", () => {
    const target = 925;
    const full = 900; // installed ≈ target
    // Half the canopy target arriving as sunlight: fixtures should fill the
    // OTHER half exactly, landing the canopy back on target.
    const { supplemental } = dim(target, target / 2, full);
    const canopyTotal = target / 2 + supplemental;
    expect(canopyTotal).toBeCloseTo(target, 0);
    // The old law would have delivered deficit²/target = (462.5²/925) ≈ 231,
    // sagging the canopy to ≈694 (25% under target). Guard against that.
    expect(canopyTotal).toBeGreaterThan(target * 0.98);
  });

  it("runs the fixtures at 100% in full dark and fades them as the sun rises", () => {
    const target = 925;
    const full = 900;
    expect(dim(target, 0, full).dimLevel).toBe(1); // night: capped at full
    const midMorning = dim(target, 300, full).dimLevel;
    const brightNoon = dim(target, 700, full).dimLevel;
    expect(midMorning).toBeLessThan(1);
    expect(brightNoon).toBeLessThan(midMorning); // more sun → lower dim
    expect(brightNoon).toBeGreaterThan(0);
  });

  it("never commands more than 100% of installed power", () => {
    const target = 1150;
    const full = 400; // undersized install
    expect(dim(target, 0, full).dimLevel).toBe(1);
    expect(dim(target, 0, full).supplemental).toBe(full);
  });
});
