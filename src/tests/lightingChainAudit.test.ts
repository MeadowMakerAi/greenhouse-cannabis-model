import { describe, expect, it } from "vitest";
import { ppfdToDLI, dliToPPFD, solarKwhToPARDLI } from "../models/dliModel";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { fixtureLibrary } from "../data/fixtureLibrary";
import { netCanopyTransmissionPct } from "../models/solarModel";
import { defaultEnvelope } from "../data/greenhouseDefaults";
import { sqftToSqm } from "../utils/unitConversions";

/**
 * End-to-end audit of the supplemental-light math chain. If any of these
 * fail it means a step in the model has drifted from physics.
 *
 * Test scenario (Jan in Montgomery NY, fallback climate):
 *   shortwave: 1.7 kWh/m²/d (fallback Jan)
 *   transmission: defaultEnvelope = 60%
 *   no shade in winter
 *   flower window 7-19 captures full short winter day → fraction ≈ 1.0
 *   target 40 DLI, 12h photoperiod
 *   canopy 1000 ft²
 *   fixture: ledHighEfficiency (PPE 2.7, util 0.85, 720W/fixture)
 */
describe("supplemental lighting math audit", () => {
  it("step 1: 1.7 kWh × 7.35 = 12.495 mol/m²/d outdoor DLI", () => {
    expect(solarKwhToPARDLI(1.7, 7.35)).toBeCloseTo(12.495, 3);
  });

  it("step 2: greenhouse DLI = outdoor × 60% = 7.497 mol/m²/d", () => {
    const tx = netCanopyTransmissionPct(defaultEnvelope);
    expect(tx).toBeGreaterThan(0.59);
    expect(tx).toBeLessThan(0.61);
    expect(12.495 * tx).toBeCloseTo(12.495 * 0.60, 1);
  });

  it("step 5: supplemental DLI = 40 − 7.5 = 32.5 mol/m²/d", () => {
    const supplementalDLI = 40 - 7.5;
    expect(supplementalDLI).toBe(32.5);
  });

  it("step 6: supplemental PPFD = 32.5 / (12 × 0.0036) ≈ 752 µmol/m²/s", () => {
    expect(dliToPPFD(32.5, 12)).toBeCloseTo(752.31, 1);
  });

  it("step 7-8: 752 PPFD × 92.9 m² / (2.7 × 0.85) = 30,463 W = 30.5 kW for LED HE", () => {
    const sized = fixtureKWFromPPFD({
      supplementalPPFDRequired: 752.31,
      canopyAreaSqFt: 1000,
      fixture: fixtureLibrary.ledHighEfficiency,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 31,
    });
    const expectedWatts = (752.31 * sqftToSqm(1000)) / (2.7 * 0.85);
    expect(sized.electricalWatts).toBeCloseTo(expectedWatts, 0);
    expect(sized.installedKW).toBeCloseTo(expectedWatts / 1000, 1);
  });

  it("HPS at same PPFD draws ~1.7× the watts of high-eff LED", () => {
    const led = fixtureKWFromPPFD({
      supplementalPPFDRequired: 752,
      canopyAreaSqFt: 1000,
      fixture: fixtureLibrary.ledHighEfficiency,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 31,
    });
    const hps = fixtureKWFromPPFD({
      supplementalPPFDRequired: 752,
      canopyAreaSqFt: 1000,
      fixture: fixtureLibrary.doubleEndedHPS,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 31,
    });
    const ratio = hps.installedKW / led.installedKW;
    // (2.7 × 0.85) / (1.7 × 0.80) = 2.295 / 1.36 = 1.687
    expect(ratio).toBeCloseTo(1.687, 1);
  });

  it("premium LED at PPE 3.1 needs ~13% less wattage than 2.7 LED", () => {
    const std = fixtureKWFromPPFD({
      supplementalPPFDRequired: 752,
      canopyAreaSqFt: 1000,
      fixture: fixtureLibrary.ledHighEfficiency,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 31,
    });
    const premium = fixtureKWFromPPFD({
      supplementalPPFDRequired: 752,
      canopyAreaSqFt: 1000,
      fixture: fixtureLibrary.ledPremium,
      photoperiodHours: 12,
      electricityRatePerKwh: 0.16,
      daysInMonth: 31,
    });
    // (2.7 × 0.85) / (3.1 × 0.88) = 2.295 / 2.728 = 0.841 → premium uses 84% of std
    expect(premium.installedKW / std.installedKW).toBeCloseTo(0.841, 2);
  });

  it("round trip: PPFD→DLI→PPFD recovers original", () => {
    const ppfd = 752.31;
    const dli = ppfdToDLI(ppfd, 12);
    expect(dliToPPFD(dli, 12)).toBeCloseTo(ppfd, 6);
  });
});
