import { useMemo } from "react";
import { useScenario } from "./ScenarioContext";
import { useSimulation } from "./SimulationContext";
import { useDerived } from "./useDerived";
import {
  canopyPPFDFromOutdoor,
  diurnalState,
  indoorTempStep,
  lightsStateAt,
  outdoorPPFDFromElevation,
  sunPositionAt,
  ventStateAt,
  type SunPosition,
  type LightsState,
} from "../models/simulationModel";
import { netCanopyTransmissionPct } from "../models/solarModel";
import { isShadeActive } from "../models/shadeModel";
import { vpdFromTempRH } from "../models/vpdModel";
import { plantGrowthAt, type PlantGrowthState } from "../models/plantGrowthModel";
import { kWToBTUhr } from "../utils/unitConversions";

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

  // Split: the 24-hour trace depends only on the day-of-year + scenario
  // inputs, NOT on hourOfDay. Computing it inside a hook that re-runs every
  // animation frame (hourOfDay changes ~60× / sec during continuous play)
  // burned ~49 iterations × 60 fps = 2,940 unnecessary computeAt calls per
  // second. Hoisting the trace dropped that to a single recompute per
  // simulated day. The snapshot still recomputes per frame from the trace
  // index plus a single hour-aligned recompute.
  const traceData = useMemo(() => {
    const lat = inputs.latitude;
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
      const ventCFM = ventOpen ? inputs.greenhouseVolumeCuFt * 0.5 : 0; // 30 ACH when open
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

    return { trace, monthIndex: monthIdx, computeAt };
  }, [inputs, climate, sim.dayOfYear, derived]);

  return useMemo(() => {
    const { trace, monthIndex, computeAt } = traceData;
    // Snapshot at current sim time — seed with nearest trace point's
    // indoor-temp + vent state so the per-frame recompute starts from the
    // hysteresis-correct condition for that hour rather than a cold start.
    const idx = Math.max(0, Math.min(trace.length - 1, Math.round(sim.hourOfDay * 2)));
    const snap = trace[idx];
    const fullSnap = computeAt(sim.hourOfDay, snap.indoorTempF, snap.ventOpen === 1);

    // Indoor RH approximation: dehumidification holds to target if running and
    // moisture removal exceeds transpiration. For live display we use a soft
    // floor at the target setpoint and rise above when conditions push it up.
    const targetRH = inputs.targetRHPct;
    const dehumPressureRatio = Math.min(
      1.5,
      Math.max(0.6, fullSnap.outdoor.outdoorRH / 100 / Math.max(0.1, targetRH / 100)),
    );
    const indoorRH = Math.max(35, Math.min(85, targetRH * dehumPressureRatio));

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

    return { snapshot, trace, monthIndex };
  }, [traceData, sim.dayOfYear, sim.hourOfDay, inputs, derived]);
}
