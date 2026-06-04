import { evaluatePathogenPressure } from "./pathogenModel";
import type { DiseaseWeatherHour } from "../services/openMeteoDiseaseClient";

/**
 * Aggregate hourly ambient weather into a REGIONAL pathogen-pressure summary
 * for cannabis (botrytis + powdery mildew). Each hour is scored with the
 * project pathogen model; we then count high-pressure hours, find the peak,
 * and compare the last 24 h (observed) against the next 48 h (forecast) to
 * give a rising/falling outlook.
 *
 * "Regional" because it's the OUTDOOR ambient — the spore load and humidity
 * the greenhouse has to defend against, independent of indoor setpoints.
 */

export interface RegionalDiseaseRisk {
  /** 0–100 peak botrytis pressure across the window. */
  peakBotrytis: number;
  /** 0–100 peak powdery-mildew pressure. */
  peakPM: number;
  /** Hours (of ~144) at elevated botrytis pressure (>50). */
  botrytisHighHours: number;
  /** Hours at elevated PM pressure (>50). */
  pmHighHours: number;
  /** Mean botrytis over the last 24 observed hours. */
  recentBotrytis: number;
  /** Mean botrytis over the next 48 forecast hours. */
  forecastBotrytis: number;
  /** Outlook from recent → forecast. */
  trend: "rising" | "falling" | "steady";
  /** Dominant risk for the headline. */
  dominant: "botrytis" | "powdery-mildew" | "low";
  /** 0–100 overall pressure (max of the two peaks). */
  overall: number;
}

const HIGH = 50;

export function regionalDiseaseRisk(
  hours: DiseaseWeatherHour[],
): RegionalDiseaseRisk | null {
  if (hours.length === 0) return null;

  let peakBotrytis = 0;
  let peakPM = 0;
  let botrytisHighHours = 0;
  let pmHighHours = 0;
  let recentSum = 0;
  let recentN = 0;
  let forecastSum = 0;
  let forecastN = 0;

  hours.forEach((h) => {
    const scores = evaluatePathogenPressure({
      meanTempF: h.tempF,
      meanRH: h.rhPct,
      dewPointF: h.dewPointF,
      // Ambient pressure is evaluated at the most-vulnerable stage so the
      // grower sees the worst-case the season can throw at a flowering crop.
      cropStage: "midFlower",
      isFlowering: true,
    });
    peakBotrytis = Math.max(peakBotrytis, scores.botrytisScore);
    peakPM = Math.max(peakPM, scores.powderyMildewScore);
    if (scores.botrytisScore > HIGH) botrytisHighHours += 1;
    if (scores.powderyMildewScore > HIGH) pmHighHours += 1;

    if (!h.forecast) {
      recentSum += scores.botrytisScore;
      recentN += 1;
    } else {
      forecastSum += scores.botrytisScore;
      forecastN += 1;
    }
  });

  const recentBotrytis = recentN > 0 ? recentSum / recentN : 0;
  const forecastBotrytis = forecastN > 0 ? forecastSum / forecastN : 0;
  const delta = forecastBotrytis - recentBotrytis;
  const trend = delta > 8 ? "rising" : delta < -8 ? "falling" : "steady";

  const overall = Math.max(peakBotrytis, peakPM);
  const dominant =
    overall < 35 ? "low" : peakBotrytis >= peakPM ? "botrytis" : "powdery-mildew";

  return {
    peakBotrytis,
    peakPM,
    botrytisHighHours,
    pmHighHours,
    recentBotrytis,
    forecastBotrytis,
    trend,
    dominant,
    overall,
  };
}
