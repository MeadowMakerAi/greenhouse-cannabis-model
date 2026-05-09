import { describe, expect, it } from "vitest";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { fixtureLibrary } from "../data/fixtureLibrary";

const baseArgs = {
  canopyAreaSqFt: 1000,
  photoperiodHours: 12,
  electricityRatePerKwh: 0.16,
  daysInMonth: 30,
  supplementalPPFDRequired: 700,
};

describe("fixture amperage", () => {
  it("Gavita 1700e LED at 120V: 645W / 120V / 0.95 PF ≈ 5.66 A per fixture", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      fixture: fixtureLibrary.gavitaPro1700eLED,
    });
    expect(r.supports120V).toBe(true);
    expect(r.ampsPerFixture120V).toBeCloseTo(645 / (120 * 0.95), 2);
  });

  it("Gavita 1700e LED at 240V: 645W / 240V / 0.95 PF ≈ 2.83 A per fixture", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      fixture: fixtureLibrary.gavitaPro1700eLED,
    });
    expect(r.supports240V).toBe(true);
    expect(r.ampsPerFixture240V).toBeCloseTo(645 / (240 * 0.95), 2);
  });

  it("Gavita RS 2400e V2 does NOT support 120V (driver min 208V)", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      fixture: fixtureLibrary.gavitaRS2400eLED,
    });
    expect(r.supports120V).toBe(false);
    expect(Number.isNaN(r.ampsPerFixture120V)).toBe(true);
    expect(r.circuits20A_120V).toBe(0);
  });

  it("Gavita RS 2400e V2 supports 240V: 750W / 240 / 0.95 ≈ 3.29 A per fixture", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      fixture: fixtureLibrary.gavitaRS2400eLED,
    });
    expect(r.supports240V).toBe(true);
    expect(r.ampsPerFixture240V).toBeCloseTo(750 / (240 * 0.95), 2);
  });

  it("Generic DE HPS does NOT support 120V (driver min 208V)", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      fixture: fixtureLibrary.doubleEndedHPS,
    });
    expect(r.supports120V).toBe(false);
    expect(r.supports240V).toBe(true);
  });

  it("circuit count uses NEC 80% derating: 20A circuit = 16A usable", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      fixture: fixtureLibrary.gavitaPro1700eLED,
    });
    // ceil(totalAmps120V / 16) should equal circuits20A_120V
    expect(r.circuits20A_120V).toBe(Math.ceil(r.totalAmps120V / 16));
    expect(r.circuits20A_240V).toBe(Math.ceil(r.totalAmps240V / 16));
    expect(r.circuits30A_240V).toBe(Math.ceil(r.totalAmps240V / 24));
  });

  it("higher voltage = lower amps for same wattage", () => {
    const r = fixtureKWFromPPFD({
      ...baseArgs,
      fixture: fixtureLibrary.gavitaPro1700eLED,
    });
    expect(r.ampsPerFixture240V).toBeLessThan(r.ampsPerFixture120V);
    // Specifically the ratio should be 120/240 = 0.5
    expect(r.ampsPerFixture240V / r.ampsPerFixture120V).toBeCloseTo(0.5, 4);
  });
});
