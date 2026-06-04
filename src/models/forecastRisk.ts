import {
  evaluatePathogenPressure,
  type PathogenScores,
  type PathogenInput,
} from "./pathogenModel";
import type { ForecastDay } from "../services/forecastClient";

export interface DayRisk {
  date: string;
  meanTempF: number;
  meanRH: number;
  dewPointF: number;
  solarKwhPerM2: number;
  pathogen: PathogenScores;
}

/**
 * Run the existing, cited pathogen-pressure model over each forecast day, using the
 * outdoor forecast as the driving climate. This is a SCREENING signal for incoming
 * disease-favorable weather — not in-canopy risk, which depends on the greenhouse's
 * climate-control response (a richer simulation, layered later).
 */
export function computeForecastRisk(
  days: ForecastDay[],
  cropStage: PathogenInput["cropStage"],
  isFlowering: boolean,
): DayRisk[] {
  return days.map((d) => ({
    date: d.date,
    meanTempF: d.meanTempF,
    meanRH: d.meanRH,
    dewPointF: d.dewPointF,
    solarKwhPerM2: d.solarKwhPerM2,
    pathogen: evaluatePathogenPressure({
      meanTempF: d.meanTempF,
      meanRH: d.meanRH,
      dewPointF: d.dewPointF,
      cropStage,
      isFlowering,
    }),
  }));
}

const peak = (d: DayRisk) =>
  Math.max(d.pathogen.botrytisScore, d.pathogen.powderyMildewScore);

export function worstDay(risk: DayRisk[]): DayRisk | null {
  if (risk.length === 0) return null;
  return risk.reduce((worst, d) => (peak(d) > peak(worst) ? d : worst));
}
