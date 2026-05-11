import { describe, expect, it } from "vitest";
import {
  sunPositionAt,
  diurnalState,
  outdoorPPFDFromElevation,
  lightsStateAt,
  ventStateAt,
  ventStateDecision,
  indoorTempStep,
  naturalVentilationCFM,
  effectiveVentAreaSqFt,
  blackoutActiveAt,
} from "../models/simulationModel";

describe("sunPositionAt", () => {
  it("equator at equinox at solar noon → ~90° elevation", () => {
    const s = sunPositionAt(0, 80, 12); // ~Mar 20
    expect(s.elevationDeg).toBeGreaterThan(85);
  });

  it("41.5°N at summer solstice noon → ~72° elevation", () => {
    const s = sunPositionAt(41.5, 172, 12); // Jun 21
    // Expected ≈ 90 - 41.5 + 23.45 = 71.95°
    expect(s.elevationDeg).toBeCloseTo(71.95, 0);
  });

  it("41.5°N at winter solstice noon → ~25° elevation", () => {
    const s = sunPositionAt(41.5, 355, 12); // Dec 21
    // Expected ≈ 90 - 41.5 - 23.45 = 25.05°
    expect(s.elevationDeg).toBeCloseTo(25.05, 0);
  });

  it("sun is below horizon at midnight in winter", () => {
    const s = sunPositionAt(41.5, 355, 0);
    expect(s.elevationDeg).toBeLessThan(0);
    expect(s.isDaytime).toBe(false);
  });

  it("hour angle is 0 at solar noon", () => {
    const s = sunPositionAt(41.5, 172, 12);
    expect(s.hourAngleDeg).toBe(0);
  });

  it("at solar noon in N hemisphere, sun is due south (azimuth ≈ 180°)", () => {
    const s = sunPositionAt(41.5, 172, 12);
    expect(s.azimuthDeg).toBeCloseTo(180, 0);
  });

  it("at sunrise (east horizon) azimuth ≈ 90° in summer", () => {
    // June, find approx sunrise time
    const s = sunPositionAt(41.5, 172, 6);
    // Sun should be in eastern half (azimuth between 45 and 135)
    expect(s.azimuthDeg).toBeGreaterThan(45);
    expect(s.azimuthDeg).toBeLessThan(135);
  });

  it("at sunset (west horizon) azimuth > 180° (western half)", () => {
    const s = sunPositionAt(41.5, 172, 18);
    expect(s.azimuthDeg).toBeGreaterThan(225);
    expect(s.azimuthDeg).toBeLessThan(315);
  });
});

describe("diurnalState", () => {
  it("temperature peaks ~3pm and troughs ~6am", () => {
    const min = 50;
    const max = 80;
    const dawn = diurnalState(6, min, max, 70, 50);
    const peakish = diurnalState(15, min, max, 70, 50);
    expect(dawn.outdoorTempF).toBeLessThan(peakish.outdoorTempF);
    expect(peakish.outdoorTempF).toBeCloseTo(80, 0);
  });

  it("RH inverse of temp at midday", () => {
    const dawn = diurnalState(6, 50, 80, 70, 50);
    const noon = diurnalState(15, 50, 80, 70, 50);
    expect(dawn.outdoorRH).toBeGreaterThan(noon.outdoorRH);
  });
});

describe("outdoorPPFDFromElevation", () => {
  it("zero at horizon and below", () => {
    expect(outdoorPPFDFromElevation(0)).toBe(0);
    expect(outdoorPPFDFromElevation(-10)).toBe(0);
  });
  it("near max at zenith", () => {
    expect(outdoorPPFDFromElevation(90)).toBeGreaterThan(1300);
  });
  it("monotonically increases with elevation 0-90", () => {
    const a = outdoorPPFDFromElevation(20);
    const b = outdoorPPFDFromElevation(45);
    const c = outdoorPPFDFromElevation(70);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
  });
});

describe("lightsStateAt", () => {
  const base = {
    photoperiodHours: 12,
    windowStartHour: 7,
    windowEndHour: 19,
    targetPPFD: 925,
    dimWhenBright: true,
  };

  it("off outside the photoperiod window", () => {
    const s = lightsStateAt({ ...base, hourOfDay: 4, naturalCanopyPPFD: 0 });
    expect(s.on).toBe(false);
    expect(s.reason).toBe("outside-photoperiod");
  });

  it("supplementing when natural is below target", () => {
    const s = lightsStateAt({ ...base, hourOfDay: 8, naturalCanopyPPFD: 200 });
    expect(s.on).toBe(true);
    expect(s.reason).toBe("supplementing");
    expect(s.dimLevel).toBeGreaterThan(0.7);
  });

  it("dim-when-bright off when natural sufficient", () => {
    const s = lightsStateAt({ ...base, hourOfDay: 12, naturalCanopyPPFD: 1100 });
    expect(s.on).toBe(false);
    expect(s.reason).toBe("natural-sufficient");
  });
});

describe("ventStateAt", () => {
  it("opens above setpoint", () => {
    expect(ventStateAt({ indoorTempF: 81, ventOpenSetpointF: 80, ventCloseSetpointF: 76, currentlyOpen: false })).toBe(true);
  });
  it("closes below close-setpoint", () => {
    expect(ventStateAt({ indoorTempF: 75, ventOpenSetpointF: 80, ventCloseSetpointF: 76, currentlyOpen: true })).toBe(false);
  });
  it("hysteresis holds state in between", () => {
    expect(ventStateAt({ indoorTempF: 78, ventOpenSetpointF: 80, ventCloseSetpointF: 76, currentlyOpen: true })).toBe(true);
    expect(ventStateAt({ indoorTempF: 78, ventOpenSetpointF: 80, ventCloseSetpointF: 76, currentlyOpen: false })).toBe(false);
  });
});

describe("indoorTempStep", () => {
  it("warming: lighting heat with no cooling and no envelope loss → temp rises", () => {
    const out = indoorTempStep({
      outdoorTempF: 70,
      prevIndoorTempF: 70,
      lightingBTUhr: 100000,
      heatingBTUhr: 0,
      coolingBTUhr: 0,
      envelopeAreaSqFt: 0,
      envelopeUValue: 0,
      ventilationCFM: 0,
      volumeCuFt: 22500,
      dtHours: 0.25,
    });
    expect(out).toBeGreaterThan(70);
  });

  it("cooling overrides lighting at small ΔT", () => {
    const warm = indoorTempStep({
      outdoorTempF: 70,
      prevIndoorTempF: 70,
      lightingBTUhr: 100000,
      heatingBTUhr: 0,
      coolingBTUhr: 0,
      envelopeAreaSqFt: 0,
      envelopeUValue: 0,
      ventilationCFM: 0,
      volumeCuFt: 22500,
      dtHours: 0.25,
    });
    const cooled = indoorTempStep({
      outdoorTempF: 70,
      prevIndoorTempF: 70,
      lightingBTUhr: 100000,
      heatingBTUhr: 0,
      coolingBTUhr: 200000,
      envelopeAreaSqFt: 0,
      envelopeUValue: 0,
      ventilationCFM: 0,
      volumeCuFt: 22500,
      dtHours: 0.25,
    });
    expect(cooled).toBeLessThan(warm);
  });
});

describe("naturalVentilationCFM (stack-effect)", () => {
  it("returns 0 when indoor ≤ outdoor (no buoyancy)", () => {
    const q = naturalVentilationCFM({
      effectiveOpenAreaSqFt: 100,
      stackHeightFt: 6,
      indoorTempF: 70,
      outdoorTempF: 75,
    });
    expect(q).toBe(0);
  });

  it("returns 0 when no opening", () => {
    const q = naturalVentilationCFM({
      effectiveOpenAreaSqFt: 0,
      stackHeightFt: 6,
      indoorTempF: 90,
      outdoorTempF: 70,
    });
    expect(q).toBe(0);
  });

  it("CFM scales with √ΔT for fixed area + stack height", () => {
    const q5 = naturalVentilationCFM({
      effectiveOpenAreaSqFt: 100,
      stackHeightFt: 6,
      indoorTempF: 75,
      outdoorTempF: 70,
    });
    const q20 = naturalVentilationCFM({
      effectiveOpenAreaSqFt: 100,
      stackHeightFt: 6,
      indoorTempF: 90,
      outdoorTempF: 70,
    });
    // Q ∝ √ΔT → q20/q5 ≈ √4 = 2
    expect(q20 / q5).toBeCloseTo(2, 1);
  });

  it("typical commercial greenhouse magnitude is plausible", () => {
    // 100 ft × 30 ft × 6 ft stack, ΔT = 15 °F, ridge + sidewall both open.
    // Effective area for paired vents ≈ 100 ft² (ridge) ≈ 100 ft² (side) → ~70 ft²
    const A = effectiveVentAreaSqFt(100, 100);
    const q = naturalVentilationCFM({
      effectiveOpenAreaSqFt: A,
      stackHeightFt: 6,
      indoorTempF: 90,
      outdoorTempF: 75,
    });
    // ASAE EP406.4: typical 30–60 ACH for well-vented gutter-connected greenhouse.
    // 100×30×12 = 36,000 ft³ → 30 ACH = 18,000 CFM. Allow a wide band.
    expect(q).toBeGreaterThan(5000);
    expect(q).toBeLessThan(80000);
  });
});

describe("effectiveVentAreaSqFt (paired-vent harmonic mean)", () => {
  it("two equal areas → A/√2", () => {
    expect(effectiveVentAreaSqFt(100, 100)).toBeCloseTo(100 / Math.sqrt(2), 4);
  });
  it("one side missing → halves the open side (single-opening penalty)", () => {
    expect(effectiveVentAreaSqFt(100, 0)).toBe(50);
    expect(effectiveVentAreaSqFt(0, 80)).toBe(40);
  });
  it("zero in both → zero", () => {
    expect(effectiveVentAreaSqFt(0, 0)).toBe(0);
  });
});

describe("blackoutActiveAt (photoperiod control)", () => {
  const base = {
    windowStartHour: 7,
    windowEndHour: 19,
    scheduledCloseHour: 19,
    scheduledOpenHour: 7,
    preCloseMin: 0,
  };
  it("returns false when blackout is disabled regardless of hour", () => {
    for (const h of [2, 12, 23]) {
      expect(blackoutActiveAt({ ...base, hourOfDay: h, enabled: false, mode: "auto" })).toBe(false);
    }
  });
  it("returns false when mode='off' regardless of enabled flag", () => {
    expect(blackoutActiveAt({ ...base, hourOfDay: 2, enabled: true, mode: "off" })).toBe(false);
    expect(blackoutActiveAt({ ...base, hourOfDay: 22, enabled: true, mode: "off" })).toBe(false);
  });
  it("returns true at every hour when mode='always'", () => {
    for (const h of [0, 7, 12, 19, 23]) {
      expect(blackoutActiveAt({ ...base, hourOfDay: h, enabled: true, mode: "always" })).toBe(true);
    }
  });
  it("auto mode: false during lights-on window", () => {
    for (const h of [7, 12, 18.99]) {
      expect(blackoutActiveAt({ ...base, hourOfDay: h, enabled: true, mode: "auto" })).toBe(false);
    }
  });
  it("auto mode: true outside lights-on window", () => {
    for (const h of [0, 5, 19, 22]) {
      expect(blackoutActiveAt({ ...base, hourOfDay: h, enabled: true, mode: "auto" })).toBe(true);
    }
  });
  it("auto mode: pre-close lead shifts the closing edge earlier", () => {
    // 30-min pre-close → curtain closes at 18:30 instead of 19:00
    const args = { ...base, enabled: true, mode: "auto" as const, preCloseMin: 30 };
    expect(blackoutActiveAt({ ...args, hourOfDay: 18.25 })).toBe(false);
    expect(blackoutActiveAt({ ...args, hourOfDay: 18.5 })).toBe(true);
    expect(blackoutActiveAt({ ...args, hourOfDay: 18.75 })).toBe(true);
  });
  it("scheduled mode: uses explicit close/open hours regardless of lights window", () => {
    // Lights window 6-22, but blackout scheduled 20-6 (midnight wrap)
    const args = {
      windowStartHour: 6,
      windowEndHour: 22,
      scheduledCloseHour: 20,
      scheduledOpenHour: 6,
      preCloseMin: 0,
      enabled: true,
      mode: "scheduled" as const,
    };
    expect(blackoutActiveAt({ ...args, hourOfDay: 12 })).toBe(false);
    expect(blackoutActiveAt({ ...args, hourOfDay: 20 })).toBe(true);
    expect(blackoutActiveAt({ ...args, hourOfDay: 23 })).toBe(true);
    expect(blackoutActiveAt({ ...args, hourOfDay: 3 })).toBe(true);
    expect(blackoutActiveAt({ ...args, hourOfDay: 6 })).toBe(false);
  });
  it("scheduled mode: same-day close window (close < open) doesn't wrap", () => {
    // Midday light-dep flip: 11am-3pm dark, otherwise light
    const args = {
      windowStartHour: 6,
      windowEndHour: 22,
      scheduledCloseHour: 11,
      scheduledOpenHour: 15,
      preCloseMin: 0,
      enabled: true,
      mode: "scheduled" as const,
    };
    expect(blackoutActiveAt({ ...args, hourOfDay: 8 })).toBe(false);
    expect(blackoutActiveAt({ ...args, hourOfDay: 11 })).toBe(true);
    expect(blackoutActiveAt({ ...args, hourOfDay: 14.5 })).toBe(true);
    expect(blackoutActiveAt({ ...args, hourOfDay: 15 })).toBe(false);
    expect(blackoutActiveAt({ ...args, hourOfDay: 20 })).toBe(false);
  });
});

describe("ventStateDecision (multi-input, Argus Titan pattern)", () => {
  const base = {
    indoorTempF: 78,
    ventOpenSetpointF: 80,
    ventCloseSetpointF: 77,
    currentlyOpen: false,
  };

  it("temperature trigger opens above setpoint", () => {
    const d = ventStateDecision({ ...base, indoorTempF: 82 });
    expect(d.open).toBe(true);
    expect(d.reason).toBe("thermal-load");
  });

  it("hysteresis: closes below close setpoint", () => {
    const d = ventStateDecision({ ...base, indoorTempF: 75, currentlyOpen: true });
    expect(d.open).toBe(false);
  });

  it("hysteresis: holds open in deadband if already open", () => {
    const d = ventStateDecision({ ...base, indoorTempF: 78, currentlyOpen: true });
    expect(d.open).toBe(true);
    expect(d.reason).toBe("hysteresis-hold");
  });

  it("humidity trigger opens when indoor RH > target+5 AND outdoor drier", () => {
    const d = ventStateDecision({
      ...base,
      indoorRHPct: 75,
      humidityTargetPct: 65,
      indoorAbsoluteHumidity: 0.012,
      outdoorAbsoluteHumidity: 0.008,
    });
    expect(d.open).toBe(true);
    expect(d.reason).toBe("humidity-dump");
  });

  it("humidity trigger does NOT fire when outdoor is wetter than indoor", () => {
    const d = ventStateDecision({
      ...base,
      indoorRHPct: 75,
      humidityTargetPct: 65,
      indoorAbsoluteHumidity: 0.008,
      outdoorAbsoluteHumidity: 0.012,
    });
    expect(d.open).toBe(false);
  });

  it("dewpoint margin trigger opens when canopy is near condensing", () => {
    const d = ventStateDecision({
      ...base,
      indoorTempF: 70,
      indoorDewpointF: 67,
      dewpointMarginF: 4,
    });
    expect(d.open).toBe(true);
    expect(d.reason).toBe("dewpoint-margin");
  });

  it("guard: outdoor hotter than indoor+5 blocks open", () => {
    const d = ventStateDecision({
      ...base,
      indoorTempF: 85,
      outdoorTempF: 95,
    });
    expect(d.open).toBe(false);
    expect(d.reason).toBe("blocked-outdoor-hot");
  });

  it("guard: blackout deployed + lights on blocks open (photoperiod)", () => {
    const d = ventStateDecision({
      ...base,
      indoorTempF: 85,
      blackoutActive: true,
      lightsOn: true,
    });
    expect(d.open).toBe(false);
    expect(d.reason).toBe("blocked-blackout-photoperiod");
  });

  it("legacy ventStateAt boolean still works (temp-only)", () => {
    expect(ventStateAt({ ...base, indoorTempF: 85 })).toBe(true);
    expect(ventStateAt({ ...base, indoorTempF: 75 })).toBe(false);
  });
});
