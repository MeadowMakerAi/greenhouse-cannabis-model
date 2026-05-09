import { solarDeclinationDeg } from "./photoperiodModel";

/**
 * Time-resolved simulation of greenhouse dynamics.
 *
 * Pure functions for the running clock:
 *   - Sun position (azimuth + elevation) at any (lat, dayOfYear, hour)
 *   - Outdoor T/RH diurnal cycle (sinusoidal interpolation)
 *   - Canopy PPFD from solar elevation × greenhouse transmission × shade
 *   - Lights on/off schedule (flower photoperiod + dim-when-bright)
 *   - Vent state (rule-based on indoor T)
 *
 * All inputs/outputs use plain numbers; no React, no DOM. Tested separately.
 */

// ---- Sun position ----
export interface SunPosition {
  azimuthDeg: number; // measured from north, clockwise (0 = N, 90 = E, 180 = S, 270 = W)
  elevationDeg: number; // 0 = horizon, 90 = zenith
  hourAngleDeg: number;
  declinationDeg: number;
  isDaytime: boolean;
}

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export function sunPositionAt(
  latitudeDeg: number,
  dayOfYear: number,
  solarHour: number, // 0-24 local solar time
): SunPosition {
  const decl = solarDeclinationDeg(dayOfYear);
  // Hour angle: 0 at solar noon, +15°/hr after, -15°/hr before
  const H = (solarHour - 12) * 15;
  const lat = latitudeDeg * DEG;
  const declRad = decl * DEG;
  const Hrad = H * DEG;

  const sinElev =
    Math.sin(lat) * Math.sin(declRad) +
    Math.cos(lat) * Math.cos(declRad) * Math.cos(Hrad);
  const elevRad = Math.asin(Math.max(-1, Math.min(1, sinElev)));
  const elevDeg = elevRad * RAD;

  // Azimuth (measured from north, clockwise) using atan2 for stability at noon.
  // sin(Az) = -cos(decl) sin(H) / cos(elev)
  // cos(Az) = (sin(decl) − sin(elev) sin(lat)) / (cos(elev) cos(lat))
  const cosE = Math.max(1e-6, Math.cos(elevRad));
  const sinAz = (-Math.cos(declRad) * Math.sin(Hrad)) / cosE;
  const cosAz =
    (Math.sin(declRad) - Math.sin(elevRad) * Math.sin(lat)) /
    Math.max(1e-6, cosE * Math.cos(lat));
  let azDeg = Math.atan2(sinAz, cosAz) * RAD;
  if (azDeg < 0) azDeg += 360;

  return {
    azimuthDeg: azDeg,
    elevationDeg: elevDeg,
    hourAngleDeg: H,
    declinationDeg: decl,
    isDaytime: elevDeg > 0,
  };
}

// ---- Outdoor T/RH diurnal cycle ----
// Standard sinusoidal model: minimum at sunrise (~6am proxy), maximum 2-3 hours after solar noon.
// Real-world uses a more complex parag model, but this is the screening-level shape.

export interface DiurnalState {
  outdoorTempF: number;
  outdoorRH: number;
  outdoorDewPointF: number;
}

export function diurnalState(
  hourOfDay: number, // 0..24
  monthlyMinTempF: number,
  monthlyMaxTempF: number,
  monthlyMeanRH: number,
  monthlyMeanDewF: number,
): DiurnalState {
  // Temp peaks ~3pm, troughs ~6am
  const tempPhase = (hourOfDay - 9) * (Math.PI / 12); // shift so peak at hour 15
  const ampT = (monthlyMaxTempF - monthlyMinTempF) / 2;
  const meanT = (monthlyMaxTempF + monthlyMinTempF) / 2;
  const outdoorTempF = meanT + ampT * Math.sin(tempPhase);

  // RH inversely correlated with T — high at dawn, low at noon
  // Anchor: monthlyMeanRH at mean temp; swing of ~30% over the day in summer, less in winter
  const rhSwing = 25;
  const rhPhase = (hourOfDay - 9) * (Math.PI / 12);
  const outdoorRH = Math.max(20, Math.min(100, monthlyMeanRH - rhSwing * Math.sin(rhPhase)));
  // Dew point is much more stable through the day — shift slightly with T but mostly hold
  const outdoorDewPointF = monthlyMeanDewF + (outdoorTempF - meanT) * 0.05;

  return { outdoorTempF, outdoorRH, outdoorDewPointF };
}

// ---- Outdoor PPFD from solar elevation ----
export function outdoorPPFDFromElevation(elevationDeg: number, clearSkyMaxPPFD = 2000): number {
  // Simple cosine-weighted with atmospheric absorption near horizon
  if (elevationDeg <= 0) return 0;
  const elevRad = elevationDeg * DEG;
  // Air mass approximation (Kasten-Young simplification): higher at low elevation
  const airMass = 1 / (Math.sin(elevRad) + 0.50572 * Math.pow(elevationDeg + 6.07995, -1.6364));
  // Atmospheric transmittance per air mass ~0.7
  const transmittance = Math.pow(0.7, airMass);
  return clearSkyMaxPPFD * Math.sin(elevRad) * transmittance;
}

// ---- Canopy PPFD ----
export function canopyPPFDFromOutdoor(
  outdoorPPFD: number,
  netGreenhouseTransmission: number, // 0..1
  shadeActive: boolean,
  shadeTransmissionPct: number, // 0..100
): number {
  const shadeFactor = shadeActive ? shadeTransmissionPct / 100 : 1;
  return outdoorPPFD * netGreenhouseTransmission * shadeFactor;
}

// ---- Lights schedule ----
export interface LightsState {
  /** Are overhead fixtures running? */
  on: boolean;
  /** Reason for current state */
  reason: "outside-photoperiod" | "natural-sufficient" | "supplementing" | "off";
  /** Dim level 0..1 */
  dimLevel: number;
}

export interface LightsScheduleInput {
  hourOfDay: number; // 0..24
  photoperiodHours: number; // 12 typical for flower
  windowStartHour: number; // 7 typical
  windowEndHour: number; // 19 typical
  /** Current natural canopy PPFD */
  naturalCanopyPPFD: number;
  /** Target top-canopy PPFD */
  targetPPFD: number;
  /** Whether dim-when-bright control is enabled */
  dimWhenBright: boolean;
}

export function lightsStateAt(input: LightsScheduleInput): LightsState {
  // Outside photoperiod window → off (dark phase)
  const inWindow =
    input.hourOfDay >= input.windowStartHour &&
    input.hourOfDay < input.windowEndHour;
  if (!inWindow) {
    return { on: false, reason: "outside-photoperiod", dimLevel: 0 };
  }
  // Inside window: dim/skip when natural is sufficient
  if (input.naturalCanopyPPFD >= input.targetPPFD) {
    return {
      on: input.dimWhenBright ? false : true,
      reason: "natural-sufficient",
      dimLevel: input.dimWhenBright ? 0 : 1,
    };
  }
  // Supplementing
  const deficit = input.targetPPFD - input.naturalCanopyPPFD;
  const dimLevel = input.dimWhenBright
    ? Math.max(0, Math.min(1, deficit / input.targetPPFD))
    : 1;
  return { on: true, reason: "supplementing", dimLevel };
}

// ---- Vent state (rule-based) ----
export interface VentInput {
  indoorTempF: number;
  ventOpenSetpointF: number;
  ventCloseSetpointF: number;
  /** Currently open? (hysteresis) */
  currentlyOpen: boolean;
}

export function ventStateAt(input: VentInput): boolean {
  // Hysteresis: open above setpoint, close below the lower setpoint
  if (input.indoorTempF >= input.ventOpenSetpointF) return true;
  if (input.indoorTempF <= input.ventCloseSetpointF) return false;
  return input.currentlyOpen;
}

// ---- Natural (stack-effect) ventilation ----
//
// Buoyancy-driven flow through paired ridge + sidewall vents follows ASAE
// EP406.4 / ASHRAE Handbook (Fundamentals, Ch. 16):
//
//   Q = Cd × A_eff × √(2 · g · ΔH · ΔT / T_avg)
//
// where Cd ≈ 0.65 for greenhouse vents, A_eff is the harmonic mean of inlet
// and outlet areas (paired vents), ΔH is the vertical distance between vent
// centers, ΔT is indoor−outdoor temperature, T_avg is in absolute units.
// In US customary units (ft, °R, ft³/min), the formula reduces to:
//
//   Q_cfm ≈ 60 · Cd · A_eff · √(2 · 32.2 · ΔH · ΔT_°F / (T_°F + 460))
//
// Wind-driven flow adds linearly: Q_wind ≈ Cv · A_eff · windSpeed_fpm × 0.5.
// We omit wind here because the live sim doesn't model outdoor wind speed.
//
// Reference: ANSI/ASAE EP406.4 §6.2; Bot (1983) "Greenhouse climate: from
// physical processes to a dynamic model" (Wageningen).
export interface NaturalVentInput {
  /** Effective open area combining ridge + sidewall vents (ft²) */
  effectiveOpenAreaSqFt: number;
  /** Vertical separation between vent centers (ft) — peak − eave/2 typical */
  stackHeightFt: number;
  /** Indoor air temp (°F) */
  indoorTempF: number;
  /** Outdoor air temp (°F) */
  outdoorTempF: number;
}

export function naturalVentilationCFM(input: NaturalVentInput): number {
  const Cd = 0.65;
  const g = 32.2; // ft/s²
  const dT = input.indoorTempF - input.outdoorTempF;
  if (dT <= 0 || input.effectiveOpenAreaSqFt <= 0 || input.stackHeightFt <= 0) {
    // No buoyancy drive (indoor cooler than outdoor) or no opening
    return 0;
  }
  const T_R = (input.indoorTempF + input.outdoorTempF) / 2 + 459.67;
  const velocity_fps = Math.sqrt((2 * g * input.stackHeightFt * dT) / T_R);
  return 60 * Cd * input.effectiveOpenAreaSqFt * velocity_fps;
}

/**
 * Compute the effective (harmonic-mean) open area when vents are open.
 * Paired vents in series: A_eff = (A_in × A_out) / √(A_in² + A_out²).
 * If only one is open, returns ~that area (capped to single-opening flow).
 */
export function effectiveVentAreaSqFt(
  ridgeAreaSqFt: number,
  sidewallAreaSqFt: number,
): number {
  if (ridgeAreaSqFt <= 0 && sidewallAreaSqFt <= 0) return 0;
  if (ridgeAreaSqFt <= 0) return sidewallAreaSqFt * 0.5; // single-opening, less efficient
  if (sidewallAreaSqFt <= 0) return ridgeAreaSqFt * 0.5;
  return (
    (ridgeAreaSqFt * sidewallAreaSqFt) /
    Math.sqrt(ridgeAreaSqFt * ridgeAreaSqFt + sidewallAreaSqFt * sidewallAreaSqFt)
  );
}

// ---- Indoor temp simulation (very simple energy balance step) ----
export interface IndoorStepInput {
  outdoorTempF: number;
  prevIndoorTempF: number;
  /** Lighting heat input (BTU/hr) */
  lightingBTUhr: number;
  /** Heating system output (BTU/hr) — nonzero only when heating active */
  heatingBTUhr: number;
  /** Cooling system removal (BTU/hr) — nonzero only when cooling active */
  coolingBTUhr: number;
  envelopeAreaSqFt: number;
  envelopeUValue: number;
  /** Ventilation CFM (high when vents open) */
  ventilationCFM: number;
  /** Greenhouse air volume in ft³ */
  volumeCuFt: number;
  /** Time step in hours */
  dtHours: number;
}

export function indoorTempStep(input: IndoorStepInput): number {
  // Heat fluxes
  const transmissionLoss =
    input.envelopeUValue *
    input.envelopeAreaSqFt *
    (input.prevIndoorTempF - input.outdoorTempF);
  // Ventilation: 1.08 BTU/hr·CFM·°F sensible
  const ventLoss = 1.08 * input.ventilationCFM * (input.prevIndoorTempF - input.outdoorTempF);
  const netBTUhr =
    input.lightingBTUhr +
    input.heatingBTUhr -
    input.coolingBTUhr -
    transmissionLoss -
    ventLoss;
  // Air mass thermal capacity: 0.018 BTU/ft³/°F (dry air)
  const thermalCapacity = input.volumeCuFt * 0.018;
  const dT = (netBTUhr * input.dtHours) / Math.max(1, thermalCapacity);
  return input.prevIndoorTempF + dT;
}

// ---- Day-of-year helpers ----
export const daysInMonth = (m: number) =>
  [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m] ?? 30;

export function dayOfYearToMonth(doy: number): number {
  const cum = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
  for (let i = 0; i < 12; i++) {
    if (doy <= cum[i]) return i;
  }
  return 11;
}

export function monthAndDayToDayOfYear(month: number, day: number): number {
  const cumStart = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  return cumStart[month] + day;
}
