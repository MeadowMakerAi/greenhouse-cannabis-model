import { describe, expect, it } from "vitest";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { fixtureLibrary } from "../data/fixtureLibrary";
import { kWToBTUhr, sqftToSqm } from "../utils/unitConversions";

describe("fixtureModel", () => {
  it("kWToBTUhr(1) ≈ 3412", () => {
    expect(kWToBTUhr(1)).toBeCloseTo(3412.142, 1);
  });

  it("sqftToSqm(1000) ≈ 92.903", () => {
    expect(sqftToSqm(1000)).toBeCloseTo(92.903, 2);
  });

  it("LED requires fewer watts than HPS for same PPFD", () => {
    const args = {
      supplementalPPFDRequired: 600,
      canopyAreaSqFt: 1000,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 30,
    };
    const led = fixtureKWFromPPFD({ ...args, fixture: fixtureLibrary.ledHighEfficiency });
    const hps = fixtureKWFromPPFD({ ...args, fixture: fixtureLibrary.doubleEndedHPS });
    expect(led.electricalWatts).toBeLessThan(hps.electricalWatts);
  });

  it("PPFD=0 yields zero kW", () => {
    const r = fixtureKWFromPPFD({
      supplementalPPFDRequired: 0,
      canopyAreaSqFt: 1000,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 30,
      fixture: fixtureLibrary.ledHighEfficiency,
    });
    expect(r.installedKW).toBe(0);
    expect(r.monthlyKwh).toBe(0);
  });

  it("monthly kWh scales with photoperiod", () => {
    const base = {
      supplementalPPFDRequired: 500,
      canopyAreaSqFt: 1000,
      electricityRatePerKwh: 0.16,
      daysInMonth: 30,
      fixture: fixtureLibrary.ledHighEfficiency,
    };
    const a = fixtureKWFromPPFD({ ...base, photoperiodHours: 12 });
    const b = fixtureKWFromPPFD({ ...base, photoperiodHours: 18 });
    expect(b.monthlyKwh / a.monthlyKwh).toBeCloseTo(18 / 12, 2);
  });

  it("required photon flux equals PPFD * canopy m²", () => {
    const r = fixtureKWFromPPFD({
      supplementalPPFDRequired: 700,
      canopyAreaSqFt: 1000,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 30,
      fixture: fixtureLibrary.ledHighEfficiency,
    });
    expect(r.requiredPhotonFlux_umol_s).toBeCloseTo(700 * sqftToSqm(1000), 2);
  });
});
