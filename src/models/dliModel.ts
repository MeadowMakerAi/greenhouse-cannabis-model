/**
 * DLI ↔ PPFD relationship.
 * DLI [mol/m²/day] = PPFD [µmol/m²/s] * photoperiod [hr] * 3600 s / 1e6 µmol
 *                  = PPFD * photoperiod * 0.0036
 */
export const ppfdToDLI = (ppfd: number, photoperiodHours: number): number =>
  ppfd * photoperiodHours * 0.0036;

export const dliToPPFD = (dli: number, photoperiodHours: number): number => {
  if (photoperiodHours <= 0) return 0;
  return dli / (photoperiodHours * 0.0036);
};

/**
 * Convert daily shortwave (kWh/m²/day) to PAR DLI (mol/m²/day) using a
 * conversion factor that defaults to 7.35 mol PAR per kWh broadband shortwave.
 * Range typically 6.8–8.0 depending on cloud/spectral assumptions.
 */
export const solarKwhToPARDLI = (
  kwhPerM2Day: number,
  conversionFactor: number = 7.35,
): number => kwhPerM2Day * conversionFactor;

export interface DLIBreakdown {
  outdoorDLI: number;
  greenhouseDLI: number;
  shadedDLI: number;
  flowerWindowDLI: number;
}
