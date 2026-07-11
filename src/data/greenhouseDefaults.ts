import type { GreenhouseEnvelope } from "../models/solarModel";

export const defaultEnvelope: GreenhouseEnvelope = {
  baseTransmissionPct: 80, // glazing typical (poly or glass)
  roofTransmissionPct: 90, // additional roof factor
  structureShadeLossPct: 8, // trusses, gutters, mullions
  dirtAgingLossPct: 5, // glazing aging / soiling
  internalObstructionLossPct: 5, // hangers, pipes, equipment
};

export const defaultSite = {
  siteAddress: "Montgomery, NY",
  nearestWeatherAnchor: "Orange County Airport / KMGJ",
  latitude: 41.475384,
  longitude: -74.244553,
  elevationFt: 380,
  timezone: "America/New_York",
  coordinateStatus: "Verified site coordinates",
};

/**
 * Default electrical service: single-phase 120/240V (typical residential
 * agricultural service in the U.S. — most cannabis greenhouses upgrade to
 * 277/480V three-phase for commercial-grade fixtures). Override at runtime.
 */
export const defaultElectricalService = {
  serviceVoltages: [120, 240] as number[],
  branchCircuitAmps: 20, // 20A typical for general-purpose; 30A for dedicated 240V
  branchCircuitContinuousFactor: 0.8, // NEC 80% rule for continuous loads
  powerFactor: 0.95, // typical for modern horticultural LED drivers
};

export const defaultGreenhouseGeometry = {
  // Explicit exterior dimensions (architectural primary inputs). Default is a
  // 120 × 90 ft gutter-connect house (12 ft gutters / 16 ft peak) — a real
  // commercial rolling-bench layout so the app boots into a representative
  // benched scene rather than a bare toy box.
  greenhouseLengthFt: 120,
  greenhouseWidthFt: 90,
  eaveHeightFt: 12,
  peakHeightFt: 16,
  // Active flowering canopy (typically smaller than floor). With benches
  // enabled by default, canopy is DERIVED from the bench packing and this
  // literal is only the open-floor fallback. ~78% of a 120×90 floor.
  // Auto-scales with length × width changes (ScenarioContext.setInputs).
  canopyAreaSqFt: 8400,
  // Override-able derived values (auto-computed from dimensions if not set)
  greenhouseFloorAreaSqFt: 10800, // = length × width when in sync
  greenhouseEnvelopeAreaSqFt: 3500, // recomputed from dims via geometryFromDims
  greenhouseVolumeCuFt: 22500, // recomputed from dims via geometryFromDims
};

/**
 * Bench layout — ENABLED by default so the 3D scene shows real benches +
 * planted decks + identity callouts out of the box (most commercial houses
 * grow on benches). When enabled, canopy is DERIVED from the bench packing
 * (models/benchLayout.ts); toggle off for an open-floor house that sets the
 * typed canopy directly. A share-link that explicitly carries enabled:false
 * still deserializes to open-floor (clampScenarioInputs keys off === true).
 * Seed dims come from the ebb-and-flow rolling benches in equipmentLibrary.ts
 * (4 ft × 40 ft); aisle/perimeter are conventional walk clearances, editable
 * at runtime.
 */
export const defaultBenchLayout = {
  enabled: true,
  type: "rolling" as const, // single shared movable aisle for the whole block
  benchWidthFt: 5,
  benchLengthFt: 40,
  aisleWidthFt: 3,
  perimeterFt: 2,
};

export const defaultPhotoperiod = {
  cropStage: "midFlower" as const,
  flowerPhotoperiodHours: 12,
  flowerWindowStartHr: 7,
  flowerWindowEndHr: 19,
  // Blackout / light-deprivation system
  blackoutEnabled: true,
  blackoutDeployMode: "auto" as const,
  blackoutPreCloseMin: 15,
  blackoutScheduledCloseHour: 19,
  blackoutScheduledOpenHour: 7,
  // Ludvig Svensson Obscura B+W: industry-standard blackout, 0.45 BTU/hr·ft²·°F
  // when deployed (~30% U-value reduction vs single-poly glazing alone).
  // SLS Tempest combined blackout+thermal goes to 0.30 if dual-purpose. We
  // default to Obscura because it's the most common dedicated-blackout pick.
  blackoutClosedUValue: 0.45,
  blackoutFabricLabel: "Ludvig Svensson Obscura B+W (or equivalent)",
};

export const defaultEconomics = {
  electricityRatePerKwh: 0.16,
  /**
   * Utility demand charge ($/kW of peak 15-min demand, billed monthly).
   * Commercial/industrial rate schedules charge separately for energy
   * (kWh) and demand (peak kW). For high-load cannabis cultivation,
   * demand charges frequently rival or exceed energy charges — yet
   * almost no screening model surfaces them. Default $14/kW/month is
   * typical for NYSEG / ConEd / National Grid commercial tariffs.
   * Source: Cannabis Business Times — "10 Tips for Reducing Electricity
   * Usage and Cost in Cannabis Cultivation" (cannabisbusinesstimes.com).
   */
  demandChargePerKwMonth: 14.0,
};

export const defaultSolarConversion = {
  solarToPARFactor: 7.35, // mol PAR per kWh shortwave
  solarToPARFactorMin: 6.8,
  solarToPARFactorMax: 8.0,
};
