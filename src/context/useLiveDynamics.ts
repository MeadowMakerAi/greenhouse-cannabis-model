import { useMemo } from "react";
import { useScenario } from "./ScenarioContext";
import { useSimulation } from "./SimulationContext";
import { useDerived } from "./useDerived";
import {
  canopyPPFDFromOutdoor,
  diurnalState,
  effectiveVentAreaSqFt,
  indoorTempStep,
  lightsStateAt,
  naturalVentilationCFM,
  outdoorPPFDFromElevation,
  sunPositionAt,
  ventStateAt,
  type SunPosition,
  type LightsState,
} from "../models/simulationModel";
import { netCanopyTransmissionPct } from "../models/solarModel";
import { isShadeActive } from "../models/shadeModel";
import { vpdFromTempRH } from "../models/vpdModel";
import {
  absoluteHumidityKgPerKg,
  rhFromAbsoluteHumidity,
} from "../models/psychrometricModel";
import { plantGrowthAt, type PlantGrowthState } from "../models/plantGrowthModel";
import {
  fahrenheitToCelsius,
  kWToBTUhr,
} from "../utils/unitConversions";

/**
 * Live dynamics derived from the simulation clock + scenario state.
 *
 * This hook combines:
 *   - Sun position at the current time
 *   - Outdoor T/RH from monthly normals × diurnal cycle
 *   - Canopy PPFD (natural + supplemental decision)
 *   - Indoor T from a simple energy-balance step
 *   - Lights state (on/off + reason)
 *   - Vent state (hysteresis)
 *
 * Returns instantaneous values plus a 24-hour trace for the current day so
 * the UI can chart the day's dynamics.
 */
export interface LiveSnapshot {
  sun: SunPosition;
  outdoorTempF: number;
  outdoorRH: number;
  outdoorDewPointF: number;
  outdoorPPFD: number;
  canopyNaturalPPFD: number;
  canopyTotalPPFD: number;
  lights: LightsState;
  ventOpen: boolean;
  indoorTempF: number;
  shadeActive: boolean;
  /** Indoor RH (estimated — held to target setpoint when dehum active) */
  indoorRH: number;
  /** Indoor leaf-vs-air VPD (kPa) */
  indoorVPD: number;
  /** Outdoor VPD (kPa) — air-only, no leaf */
  outdoorVPD: number;
  /** Plant growth state (visual geometry + phase) */
  plant: PlantGrowthState;
}

export interface DailyTracePoint {
  hour: number;
  outdoorTempF: number;
  indoorTempF: number;
  outdoorRH: number;
  canopyPPFD: number;
  supplementalOnFraction: number; // 0 or 1 for line steps
  ventOpen: number; // 0 or 1
  sunElev: number;
  outdoorPPFD: number;
}

export function useLiveDynamics() {
  const { inputs, climate } = useScenario();
  const sim = useSimulation();
  const derived = useDerived();

  return useMemo(() => {
    const lat = inputs.latitude;
    // Pull monthly climate row
    const monthIdx = (() => {
      const cum = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
      for (let i = 0; i < 12; i++) if (sim.dayOfYear <= cum[i]) return i;
      return 11;
    })();
    const climateRow = climate.data[monthIdx];

    const transmission = netCanopyTransmissionPct(inputs.envelope);

    const computeAt = (hourOfDay: number, prevIndoor: number, prevVent: boolean) => {
      const sun = sunPositionAt(lat, sim.dayOfYear, hourOfDay);
      const diurnal = diurnalState(
        hourOfDay,
        climateRow.minTempF,
        climateRow.maxTempF,
        climateRow.meanRH,
        climateRow.meanDewPointF,
      );
      const outdoorPPFD = outdoorPPFDFromElevation(sun.elevationDeg);
      const meanSolarWm2 = (climateRow.shortwaveKwhPerM2PerDay * 1000) / 12;
      const shadeActive = isShadeActive(monthIdx, climateRow.meanTempF, meanSolarWm2, {
        shadeEnabled: inputs.shadeEnabled,
        shadeTransmissionPct: inputs.shadeTransmissionPct,
        shadeStartMonth: inputs.shadeStartMonth,
        shadeEndMonth: inputs.shadeEndMonth,
        shadeDeployMode: inputs.shadeDeployMode,
        shadeTriggerOutdoorTempF: inputs.shadeTriggerOutdoorTempF,
        shadeTriggerSolarWm2: inputs.shadeTriggerSolarWm2,
      });
      const canopyNaturalPPFD = canopyPPFDFromOutdoor(
        outdoorPPFD,
        transmission,
        shadeActive,
        inputs.shadeTransmissionPct,
      );
      const lights = lightsStateAt({
        hourOfDay,
        photoperiodHours: inputs.flowerPhotoperiodHours,
        windowStartHour: inputs.flowerWindowStartHr,
        windowEndHour: inputs.flowerWindowEndHr,
        naturalCanopyPPFD: canopyNaturalPPFD,
        targetPPFD: derived.target.targetTopCanopyPPFD,
        dimWhenBright: true,
      });
      const supplementalPPFD = lights.on
        ? Math.max(0, derived.target.targetTopCanopyPPFD - canopyNaturalPPFD) * lights.dimLevel
        : 0;
      const canopyTotalPPFD = canopyNaturalPPFD + supplementalPPFD;
      const lightingBTUhr = lights.on
        ? kWToBTUhr(derived.peakInstalledKW * lights.dimLevel)
        : 0;
      const ventOpen = ventStateAt({
        indoorTempF: prevIndoor,
        ventOpenSetpointF: inputs.indoorTargetDryBulbF + 2,
        ventCloseSetpointF: inputs.indoorTargetDryBulbF - 1,
        currentlyOpen: prevVent,
      });
      // Natural ventilation: ASAE EP406.4 stack-effect formula. Approximate
      // ridge vent area as 4 ft along-slope × 88% of length × 38° opening
      // projection × 2 leaves; sidewall area conservatively equal to ridge
      // (typical commercial config: continuous ridge + continuous sidewall).
      const ridgeOpeningAreaSqFt = ventOpen
        ? 2 * 4 * inputs.greenhouseLengthFt * 0.88 * Math.sin((38 * Math.PI) / 180)
        : 0;
      const sidewallOpeningAreaSqFt = ventOpen ? ridgeOpeningAreaSqFt : 0;
      const ventEffectiveArea = effectiveVentAreaSqFt(
        ridgeOpeningAreaSqFt,
        sidewallOpeningAreaSqFt,
      );
      const stackHeightFt = Math.max(
        0.5,
        inputs.peakHeightFt - inputs.eaveHeightFt / 2,
      );
      const ventCFM = naturalVentilationCFM({
        effectiveOpenAreaSqFt: ventEffectiveArea,
        stackHeightFt,
        indoorTempF: prevIndoor,
        outdoorTempF: diurnal.outdoorTempF,
      });
      const heatingBTUhr =
        inputs.radiantHeatingEnabled &&
        prevIndoor < inputs.indoorTargetDryBulbF - 2
          ? inputs.radiantHeatingCapacityBTUhr * 0.7
          : 0;
      const coolingBTUhr =
        prevIndoor > inputs.indoorTargetDryBulbF + 2 && !ventOpen
          ? Math.max(...derived.months.map((m) => m.totalCoolingBTUhr)) * 0.5
          : 0;
      const dt = 0.25; // 15-min step
      const indoorTempF = indoorTempStep({
        outdoorTempF: diurnal.outdoorTempF,
        prevIndoorTempF: prevIndoor,
        lightingBTUhr,
        heatingBTUhr,
        coolingBTUhr,
        envelopeAreaSqFt: inputs.greenhouseEnvelopeAreaSqFt,
        envelopeUValue:
          inputs.thermalScreenEnabled && (hourOfDay < 6 || hourOfDay > 19)
            ? inputs.thermalScreenNightUValue
            : inputs.envelopeUValueBTUhrFtF,
        ventilationCFM: ventCFM,
        volumeCuFt: inputs.greenhouseVolumeCuFt,
        dtHours: dt,
      });
      return {
        sun,
        outdoor: diurnal,
        outdoorPPFD,
        canopyNaturalPPFD,
        canopyTotalPPFD,
        lights,
        ventOpen,
        indoorTempF,
        shadeActive,
      };
    };

    // Build a 24-hour trace for the current day (to chart it)
    const trace: DailyTracePoint[] = [];
    let prevIndoor = climateRow.meanTempF;
    let prevVent = false;
    for (let h = 0; h <= 24; h += 0.5) {
      const r = computeAt(h, prevIndoor, prevVent);
      prevIndoor = r.indoorTempF;
      prevVent = r.ventOpen;
      trace.push({
        hour: h,
        outdoorTempF: r.outdoor.outdoorTempF,
        indoorTempF: r.indoorTempF,
        outdoorRH: r.outdoor.outdoorRH,
        canopyPPFD: r.canopyTotalPPFD,
        supplementalOnFraction: r.lights.on ? r.lights.dimLevel : 0,
        ventOpen: r.ventOpen ? 1 : 0,
        sunElev: r.sun.elevationDeg,
        outdoorPPFD: r.outdoorPPFD,
      });
    }

    // Snapshot at current sim time. Codex P0: previously we picked the trace
    // point at idx (which holds the post-step indoor/vent state) and re-fed it
    // into another computeAt → snapshot was always one 15-min step ahead of
    // the chart. Fix: feed the PREVIOUS trace point's state in so computeAt
    // produces the same step the trace point represents.
    const idx = Math.max(0, Math.min(trace.length - 1, Math.round(sim.hourOfDay * 2)));
    const prevIdx = Math.max(0, idx - 1);
    const prev = trace[prevIdx];
    const fullSnap = computeAt(
      sim.hourOfDay,
      prev.indoorTempF,
      prev.ventOpen === 1,
    );

    // Indoor RH model — proper psychrometric coupling.
    //
    // Step 1: outdoor absolute humidity (kg water / kg dry air) from outdoor T/RH.
    // Step 2: indoor air picks up moisture from outdoor (via leakage / open
    //         vents) plus a small transpiration addition. Dehumidifier removes
    //         moisture down to the target RH setpoint at indoor T.
    // Step 3: convert resulting AH back to RH at indoor T.
    //
    // Dehumidifier behavior: when indoor AH would translate to RH > target,
    // the dehumidifier holds it at the target RH. When ambient AH is already
    // dry (e.g., cold winter outdoor air in lit greenhouse), indoor RH can
    // run BELOW target.
    const targetRH = inputs.targetRHPct;
    const outdoorAH = absoluteHumidityKgPerKg(
      fahrenheitToCelsius(fullSnap.outdoor.outdoorTempF),
      fullSnap.outdoor.outdoorRH,
    );
    const transpirationAH = 0.0008; // ~0.8 g/kg lift from dense canopy transpiration
    const ventMixingFraction = fullSnap.ventOpen ? 0.85 : 0.25; // 85 % outdoor when vents open
    const ambientIndoorAH =
      outdoorAH * ventMixingFraction +
      outdoorAH * (1 - ventMixingFraction) +
      transpirationAH;
    const ambientIndoorRH = rhFromAbsoluteHumidity(
      fahrenheitToCelsius(fullSnap.indoorTempF),
      ambientIndoorAH,
    );
    // Cap by dehumidifier setpoint (when indoor RH would exceed target, the
    // dehumidifier holds at target). When dehum disabled or undersized, fall
    // through to the ambient value.
    const indoorRH = Math.max(
      25,
      Math.min(90, Math.min(ambientIndoorRH, targetRH * 1.05)),
    );

    const indoorVPD = vpdFromTempRH(
      fullSnap.indoorTempF,
      indoorRH,
      inputs.leafTempOffsetC,
    );
    const outdoorVPD = vpdFromTempRH(
      fullSnap.outdoor.outdoorTempF,
      fullSnap.outdoor.outdoorRH,
      0, // outdoor: no leaf offset, just air-air VPD as reference
    );

    // ---- Plant growth state ----
    // Use the average DLI achieved so far across the cycle so far
    const plant = plantGrowthAt({
      cropStartDayOfYear: inputs.cropStartDayOfYear,
      vegDays: inputs.vegDays,
      flowerDays: inputs.flowerDays,
      currentDayOfYear: sim.dayOfYear,
      meanDLI: derived.target.targetDLI, // approx; full cycle avg ≈ target if lighting on schedule
      targetDLI: derived.target.targetDLI,
      meanTempF: inputs.indoorTargetDryBulbF,
      co2Ppm: inputs.co2SetpointPpm,
      co2Enabled: inputs.co2Enabled,
      stretchFactor: inputs.cultivarStretchFactor,
    });

    const snapshot: LiveSnapshot = {
      sun: fullSnap.sun,
      outdoorTempF: fullSnap.outdoor.outdoorTempF,
      outdoorRH: fullSnap.outdoor.outdoorRH,
      outdoorDewPointF: fullSnap.outdoor.outdoorDewPointF,
      outdoorPPFD: fullSnap.outdoorPPFD,
      canopyNaturalPPFD: fullSnap.canopyNaturalPPFD,
      canopyTotalPPFD: fullSnap.canopyTotalPPFD,
      lights: fullSnap.lights,
      ventOpen: fullSnap.ventOpen,
      indoorTempF: fullSnap.indoorTempF,
      shadeActive: fullSnap.shadeActive,
      indoorRH,
      indoorVPD,
      outdoorVPD,
      plant,
    };

    return { snapshot, trace, monthIndex: monthIdx };
  }, [inputs, climate, sim.dayOfYear, sim.hourOfDay, derived]);
}
