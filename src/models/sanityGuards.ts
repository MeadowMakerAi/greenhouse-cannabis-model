/**
 * Sanity guards for derived values. Guards do not block computation — they
 * surface a flag that the UI shows so units bugs and unrealistic inputs
 * become visible instead of silently propagating.
 */
export interface SanityFlag {
  level: "info" | "warn" | "error";
  category: "units" | "input" | "derived";
  message: string;
}

const EARTH_OUTDOOR_DLI_CEILING = 60; // mol/m²/day at equator on equinox
const TYPICAL_GH_TRANSMISSION_MAX = 0.85;
const TYPICAL_LIGHT_DENSITY_W_PER_SQFT = 50;

export function checkOutdoorDLI(monthlyOutdoorDLI: number[]): SanityFlag[] {
  const flags: SanityFlag[] = [];
  const peak = Math.max(...monthlyOutdoorDLI);
  if (peak > EARTH_OUTDOOR_DLI_CEILING) {
    flags.push({
      level: "error",
      category: "units",
      message: `Outdoor DLI peak ${peak.toFixed(0)} mol/m²/d exceeds the natural ceiling (~60 at equator). Likely a units bug — check whether the shortwave source returns kWh/m²/day or MJ/m²/day.`,
    });
  }
  return flags;
}

export function checkNetTransmission(transmissionFraction: number): SanityFlag[] {
  if (transmissionFraction > TYPICAL_GH_TRANSMISSION_MAX) {
    return [
      {
        level: "warn",
        category: "input",
        message: `Net canopy transmission ${(transmissionFraction * 100).toFixed(0)}% is above the typical greenhouse ceiling (~85%). Re-check structure shade, soiling, and obstruction inputs.`,
      },
    ];
  }
  if (transmissionFraction < 0.25) {
    return [
      {
        level: "warn",
        category: "input",
        message: `Net canopy transmission ${(transmissionFraction * 100).toFixed(0)}% is unusually low. Re-check envelope loss inputs.`,
      },
    ];
  }
  return [];
}

export function checkLightingDensity(
  peakElectricalWatts: number,
  canopyAreaSqFt: number,
): SanityFlag[] {
  if (canopyAreaSqFt <= 0) return [];
  const wPerFt2 = peakElectricalWatts / canopyAreaSqFt;
  if (wPerFt2 > TYPICAL_LIGHT_DENSITY_W_PER_SQFT) {
    return [
      {
        level: "warn",
        category: "derived",
        message: `Peak supplemental lighting density ${wPerFt2.toFixed(1)} W/ft² exceeds typical commercial greenhouse design (~30–50 W/ft²). DLI target may be infeasible without shade or trans. assumptions adjusted.`,
      },
    ];
  }
  return [];
}
