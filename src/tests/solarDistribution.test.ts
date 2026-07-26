import { describe, it, expect } from "vitest";
import { distributeDailyIrradiance } from "../models/solarModel";

/**
 * distributeDailyIrradiance turns a MEASURED daily shortwave total into an
 * instantaneous W/m² curve with a solar-noon peak. The load-bearing property is
 * conservation: re-integrating the instantaneous curve must return the daily
 * total it was given (magnitude stays real; only the shape is modeled).
 */
const MONTGOMERY_LAT = 41.475384;

describe("distributeDailyIrradiance", () => {
  it("conserves the measured daily total when re-integrated", () => {
    const dailyKwh = 6.2; // measured kWh/m²/day
    const irr = distributeDailyIrradiance(MONTGOMERY_LAT, 172, dailyKwh); // summer solstice
    // Integrate W/m² over the day → Wh/m² → kWh/m².
    let wh = 0;
    const dt = 0.1;
    for (let h = 0; h < 24; h += dt) {
      wh += ((irr(h) + irr(h + dt)) / 2) * dt;
    }
    expect(wh / 1000).toBeCloseTo(dailyKwh, 1);
  });

  it("is zero at night and positive/peaked near solar noon", () => {
    const irr = distributeDailyIrradiance(MONTGOMERY_LAT, 172, 6.2);
    expect(irr(0)).toBe(0); // midnight
    expect(irr(3)).toBe(0); // pre-dawn
    const noon = irr(12);
    expect(noon).toBeGreaterThan(0);
    expect(noon).toBeGreaterThan(irr(8)); // higher sun at noon than mid-morning
    expect(noon).toBeGreaterThan(irr(16));
    // Summer-noon clear-sky peak is a few hundred W/m²; sanity-bound it.
    expect(noon).toBeLessThan(1200);
  });

  it("returns zero everywhere when the daily total is zero", () => {
    const irr = distributeDailyIrradiance(MONTGOMERY_LAT, 172, 0);
    expect(irr(12)).toBe(0);
  });

  it("scales linearly with the daily total", () => {
    const a = distributeDailyIrradiance(MONTGOMERY_LAT, 80, 3)(12);
    const b = distributeDailyIrradiance(MONTGOMERY_LAT, 80, 6)(12);
    expect(b).toBeCloseTo(a * 2, 3);
  });
});
