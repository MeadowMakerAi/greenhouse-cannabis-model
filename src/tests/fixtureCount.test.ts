import { describe, expect, it } from "vitest";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { fixtureLibrary } from "../data/fixtureLibrary";

describe("fixtureKWFromPPFD — fixture count", () => {
  const baseArgs = {
    canopyAreaSqFt: 1000,
    photoperiodHours: 12,
    electricityRatePerKwh: 0.16,
    daysInMonth: 30,
  };

  it("ceil(electricalWatts / wattsPerFixture)", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      supplementalPPFDRequired: 700,
      fixture: fixtureLibrary.ledHighEfficiency,
    });
    const expected = Math.ceil(r.electricalWatts / fixtureLibrary.ledHighEfficiency.wattsPerFixture);
    expect(r.fixtureCount).toBe(expected);
    expect(r.fixtureCount).toBeGreaterThan(0);
  });

  it("HPS installs more total kW than LED for same PPFD (lower PPE)", () => {
    const led = fixtureKWFromPPFD({
      ...baseArgs,
      supplementalPPFDRequired: 700,
      fixture: fixtureLibrary.ledHighEfficiency,
    });
    const hps = fixtureKWFromPPFD({
      ...baseArgs,
      supplementalPPFDRequired: 700,
      fixture: fixtureLibrary.doubleEndedHPS,
    });
    expect(hps.installedKW).toBeGreaterThan(led.installedKW);
    // Fixture count ordering depends on the ratio of PPE × util to wattsPerFixture
    // — assert the count formula, not an ordering.
    expect(hps.fixtureCount).toBe(
      Math.ceil(hps.electricalWatts / fixtureLibrary.doubleEndedHPS.wattsPerFixture),
    );
    expect(led.fixtureCount).toBe(
      Math.ceil(led.electricalWatts / fixtureLibrary.ledHighEfficiency.wattsPerFixture),
    );
  });

  it("wattsPerSqFt = electricalWatts / canopyAreaSqFt", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      supplementalPPFDRequired: 700,
      fixture: fixtureLibrary.ledHighEfficiency,
    });
    expect(r.wattsPerSqFt).toBeCloseTo(r.electricalWatts / 1000, 4);
  });

  it("zero PPFD yields zero fixtures", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      supplementalPPFDRequired: 0,
      fixture: fixtureLibrary.ledHighEfficiency,
    });
    expect(r.fixtureCount).toBe(0);
  });
});
