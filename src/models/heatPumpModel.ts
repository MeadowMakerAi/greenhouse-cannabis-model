/**
 * Heat pump / integrated cooling+dehumidification model.
 *
 * Hot-gas-reheat DX heat-pump systems condense moisture and re-warm the
 * supply air in a single pass — the same kWh covers cooling AND
 * dehumidification, vs separate AC + condensing dehumidifier.
 *
 * Verified 2026-05-09 against Cannabis Science & Technology life-cycle
 * cost analysis ([source](https://www.cannabissciencetech.com/view/integrated-hvac-systems-for-cannabis-cultivation-have-the-lowest-life-cycle-cost)).
 *
 * Typical performance:
 *   - Combined COP (cooling + dehumid): 3.0 – 4.0
 *   - Heat-pump dehumidifier alone: 4.5 – 7.0 pints/kWh equivalent
 *   - Lifecycle cost: 30–50% lower than separate condensing units in cannabis facility studies
 *
 * Inputs the existing dehumidification + cooling load math; returns
 * combined kWh/day.
 */
export interface HeatPumpInput {
  /** Cooling demand BTU/hr peak */
  peakCoolingBTUhr: number;
  /** Dehumidification demand pints/day peak */
  peakDehumidPintsDay: number;
  /** Ratio of peak to average load (higher = more cycling) */
  peakToAverageRatio: number;
  /** Combined COP at integrated operation */
  combinedCOP: number;
  /** Months/yr of operation */
  monthsOfOperation: number;
}

export interface HeatPumpOutput {
  /** Daily kWh combined cooling + dehum */
  combinedKwhPerDay: number;
  /** Annual kWh */
  annualKwh: number;
  /** Equivalent dehumid efficiency in pints/kWh */
  effectivePintsPerKwh: number;
  /** Tons of cooling at peak */
  peakTons: number;
}

const BTU_PER_KWH = 3412.142;
const LATENT_BTU_PER_PINT = 1054 / 8.34 / 8; // BTU latent per pint of water removed
// (1054 BTU/lb water × ~1/8.34 lb/gal → BTU/gal, then /8 pints/gal)

export function evaluateHeatPump(input: HeatPumpInput): HeatPumpOutput {
  // Convert dehumid load to BTU/hr equivalent (latent)
  const dehumidLatentBTUperHr = (input.peakDehumidPintsDay / 24) * (1054 / 8.34 / 8 * 1); // pints/hr × BTU/pint
  // Total integrated load
  const peakCombinedBTUhr = input.peakCoolingBTUhr + dehumidLatentBTUperHr;
  // Convert to kW input via COP (BTU/hr → kW = /3412)
  const peakInputKW = peakCombinedBTUhr / BTU_PER_KWH / Math.max(1, input.combinedCOP);
  // Average input ≈ peak / peak-to-average ratio
  const avgInputKW = peakInputKW / Math.max(1, input.peakToAverageRatio);
  const combinedKwhPerDay = avgInputKW * 24;
  const annualKwh = combinedKwhPerDay * (input.monthsOfOperation / 12) * 365;
  const peakTons = input.peakCoolingBTUhr / 12000;
  const effectivePintsPerKwh =
    avgInputKW > 0
      ? (input.peakDehumidPintsDay / Math.max(1, input.peakToAverageRatio)) / 24 / avgInputKW
      : 0;
  void LATENT_BTU_PER_PINT;
  return {
    combinedKwhPerDay,
    annualKwh,
    effectivePintsPerKwh,
    peakTons,
  };
}
