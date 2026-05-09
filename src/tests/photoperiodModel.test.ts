import { describe, expect, it } from "vitest";
import {
  flowerWindowDailyFraction,
  solarSunriseHour,
  solarDeclinationDeg,
} from "../models/photoperiodModel";

describe("photoperiodModel", () => {
  it("declination is near 0 at equinoxes", () => {
    expect(Math.abs(solarDeclinationDeg(80))).toBeLessThan(1.5); // ~ Mar 20
    expect(Math.abs(solarDeclinationDeg(266))).toBeLessThan(1.5); // ~ Sep 23
  });

  it("declination is near +23.45 at summer solstice", () => {
    expect(solarDeclinationDeg(172)).toBeCloseTo(23.45, 0);
  });

  it("sunrise earlier in summer than winter at 41° N", () => {
    const sunriseSummer = solarSunriseHour(41, 23.45);
    const sunriseWinter = solarSunriseHour(41, -23.45);
    expect(sunriseSummer).toBeLessThan(sunriseWinter);
  });

  it("flower window 7-19 captures most of the day in winter", () => {
    const f = flowerWindowDailyFraction(0, 41, 7, 19); // January
    expect(f).toBeGreaterThan(0.95);
  });

  it("flower window 7-19 captures less of summer day", () => {
    const f = flowerWindowDailyFraction(5, 41, 7, 19); // June
    expect(f).toBeLessThan(0.95);
    expect(f).toBeGreaterThan(0.7);
  });
});
