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
  // Active flowering canopy (typically smaller than floor)
  canopyAreaSqFt: 1000,
  // Override-able derived values (auto-computed from dimensions if not set)
  greenhouseFloorAreaSqFt: 1500, // = length × width when in sync
  greenhouseEnvelopeAreaSqFt: 3500, // = floor + 2(L×eave) + 2(W×eave) + 2 gable triangles + 2 roof slopes
  greenhouseVolumeCuFt: 22500, // = L × W × ((eave + peak)/2)
};

export const defaultPhotoperiod = {
  cropStage: "midFlower" as const,
  flowerPhotoperiodHours: 12,
  flowerWindowStartHr: 7,
  flowerWindowEndHr: 19,
  blackoutEnabled: true,
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
