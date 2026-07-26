import { describe, it, expect } from "vitest";
import {
  climateSubstep,
  type ClimateSubstepInput,
  DRY_AIR_DENSITY_LB_PER_FT3,
} from "../models/greenhouseClimateStep";
import { absoluteHumidityKgPerKg } from "../models/psychrometricModel";
import { fahrenheitToCelsius } from "../utils/unitConversions";

/** A neutral base substep: no drivers, no cooling — used to isolate one effect. */
function base(overrides: Partial<ClimateSubstepInput> = {}): ClimateSubstepInput {
  return {
    indoorTempF: 78,
    indoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(78), 60),
    outdoorTempF: 78,
    outdoorRHPct: 60,
    outdoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(78), 60),
    ventCFM: 0,
    solarGainBTUhr: 0,
    lightingBTUhr: 0,
    heatingBTUhr: 0,
    mechCoolingBTUhr: 0,
    envelopeAreaSqFt: 8000,
    envelopeUValue: 1.1,
    volumeCuFt: 100000,
    transpirationLbPerHr: 0,
    padEnabled: false,
    padEfficiencyPct: 85,
    fogEnabled: false,
    fogEfficiencyPct: 85,
    fogAirflowCFM: 0,
    dehumEnabled: false,
    targetRHPct: 60,
    dtHours: 1 / 60,
    ...overrides,
  };
}

describe("climateSubstep", () => {
  it("solar gain heats the interior (the greenhouse effect)", () => {
    const r = climateSubstep(base({ solarGainBTUhr: 500_000 }));
    expect(r.indoorTempF).toBeGreaterThan(78);
  });

  it("conserves moisture when there are no sources or sinks", () => {
    const b = base();
    const r = climateSubstep(b);
    expect(r.indoorAH).toBeCloseTo(b.indoorAH, 9);
  });

  it("wet wall cools on a hot dry day and adds humidity (adiabatic)", () => {
    // Hot dry outdoor air, vents moving air through the pad.
    const b = base({
      indoorTempF: 95,
      outdoorTempF: 95,
      outdoorRHPct: 25,
      outdoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(95), 25),
      indoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(95), 25),
      ventCFM: 20000,
      padEnabled: true,
    });
    const withPad = climateSubstep(b);
    const noPad = climateSubstep({ ...b, padEnabled: false });
    expect(withPad.padCoolingBTUhr).toBeGreaterThan(0);
    expect(withPad.indoorTempF).toBeLessThan(noPad.indoorTempF); // pad cools
    expect(withPad.indoorAH).toBeGreaterThan(noPad.indoorAH); // and humidifies
  });

  it("fog cools toward wet-bulb, raises humidity, and fades to zero as RH → 100", () => {
    const dry = climateSubstep(
      base({
        indoorTempF: 90,
        indoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(90), 40),
        fogEnabled: true,
        fogAirflowCFM: 15000,
      }),
    );
    expect(dry.fogCoolingBTUhr).toBeGreaterThan(0);
    expect(dry.indoorTempF).toBeLessThan(90);
    expect(dry.indoorAH).toBeGreaterThan(absoluteHumidityKgPerKg(fahrenheitToCelsius(90), 40));

    // Near-saturated air: fog has almost no headroom, so it barely cools.
    const wet = climateSubstep(
      base({
        indoorTempF: 90,
        indoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(90), 99),
        fogEnabled: true,
        fogAirflowCFM: 15000,
      }),
    );
    expect(wet.fogCoolingBTUhr).toBeLessThan(dry.fogCoolingBTUhr * 0.2);
  });

  it("ventilation dries the interior when it is wetter than outside", () => {
    const b = base({
      indoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(78), 80), // humid inside
      outdoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(78), 30), // dry outside
      ventCFM: 15000,
    });
    const r = climateSubstep(b);
    expect(r.indoorAH).toBeLessThan(b.indoorAH);
  });

  it("dehumidifier pulls RH down toward target", () => {
    const b = base({
      indoorAH: absoluteHumidityKgPerKg(fahrenheitToCelsius(78), 85),
      dehumEnabled: true,
      targetRHPct: 60,
    });
    const r = climateSubstep(b);
    expect(r.indoorRHPct).toBeLessThan(85);
    expect(r.indoorRHPct).toBeGreaterThanOrEqual(59); // not below target
  });

  it("never produces non-finite state", () => {
    const r = climateSubstep(base({ solarGainBTUhr: 1e7, volumeCuFt: 1 }));
    expect(Number.isFinite(r.indoorTempF)).toBe(true);
    expect(Number.isFinite(r.indoorAH)).toBe(true);
    expect(DRY_AIR_DENSITY_LB_PER_FT3).toBeGreaterThan(0);
  });
});
