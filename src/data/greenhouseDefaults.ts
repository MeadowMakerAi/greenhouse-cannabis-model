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
  // Explicit exterior dimensions (architectural primary inputs)
  greenhouseLengthFt: 48,
  greenhouseWidthFt: 32,
  eaveHeightFt: 8,
  peakHeightFt: 14,
  // Active flowering canopy (typically smaller than floor).
  // 1200/1536 ≈ 78% — typical commercial layout with 2–3 ft aisles.
  // Auto-scales with length × width changes (ScenarioContext.setInputs).
  canopyAreaSqFt: 1200,
  // Override-able derived values (auto-computed from dimensions if not set)
  greenhouseFloorAreaSqFt: 1500, // = length × width when in sync
  greenhouseEnvelopeAreaSqFt: 3500, // = floor + 2(L×eave) + 2(W×eave) + 2 gable triangles + 2 roof slopes
  greenhouseVolumeCuFt: 22500, // = L × W × ((eave + peak)/2)
};

/**
 * Bench layout — DISABLED by default so open-floor houses keep the typed
 * canopy input and existing share-links deserialize unchanged. Seed dims come
 * from the ebb-and-flow rolling benches in equipmentLibrary.ts (4 ft × 40 ft);
 * aisle/perimeter are conventional walk clearances, editable at runtime. When
 * enabled, canopy is derived from the packing (models/benchLayout.ts).
 */
export const defaultBenchLayout = {
  enabled: false,
  type: "rolling" as const,
  benchWidthFt: 4,
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
