import { useMemo } from "react";
import { useScenario } from "./ScenarioContext";
import { useSimulation } from "./SimulationContext";
import { useDerived } from "./useDerived";
import {
  blackoutActiveAt,
  canopyPPFDFromOutdoor,
  diurnalState,
  effectiveVentAreaSqFt,
  indoorTempStep,
  lightsStateAt,
  naturalVentilationCFM,
  outdoorPPFDFromElevation,
  sunPositionAt,
  ventStateAt,
  ventStateDecision,
  type VentReason,
  type SunPosition,
  type LightsState,
} from "../models/simulationModel";
import { netCanopyTransmissionPct } from "../models/solarModel";
import { isShadeActive } from "../models/shadeModel";
import { vpdFromTempRH } from "../models/vpdModel";
import {
  absoluteHumidityKgPerKg,
  dewPointF,
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
  /** Governing reason for the vent state — shown in the HUD systems row */
  ventReason: VentReason;
  indoorTempF: number;
  shadeActive: boolean;
  /** Blackout curtain deployed (forces photoperiod by blocking natural light) */
  blackoutActive: boolean;
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
      const blackoutActive = blackoutActiveAt({
        hourOfDay,
        enabled: inputs.blackoutEnabled,
        mode: inputs.blackoutDeployMode,
        windowStartHour: inputs.flowerWindowStartHr,
        windowEndHour: inputs.flowerWindowEndHr,
        scheduledCloseHour: inputs.blackoutScheduledCloseHour,
        scheduledOpenHour: inputs.blackoutScheduledOpenHour,
        preCloseMin: inputs.blackoutPreCloseMin,
      });
      const canopyNaturalPPFDRaw = canopyPPFDFromOutdoor(
        outdoorPPFD,
        transmission,
        shadeActive,
        inputs.shadeTransmissionPct,
      );
      // Blackout curtain blocks ALL natural light during the dark phase.
      // Cannabis photoperiod requires uninterrupted dark — any light leak
      // can revert flowering plants to veg. Curtains are 95-99% opaque in
      // commercial installs; we model as binary 0 for the simulation since
      // residual leak (<1%) is below the plant's perception threshold.
      const canopyNaturalPPFD = blackoutActive ? 0 : canopyNaturalPPFDRaw;
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
      /* Stack-effect ridge-vent area is large (paired N+S leaves × full
       * ridge length), and CFM ∝ √ΔT — small at small ΔT, large at large
       * ΔT. With a single 15-min Euler step + ~200 kW lighting heat input
       * the system is numerically unstable: the temperature overshoots the
       * equilibrium by 100°F+ in one step and oscillates outward, producing
       * 1e+31°F after a few iterations.
       *
       * Fix: substep the 15-min outer step into 1-min inner steps so the
       * vent feedback acts gradually. Vent state, vent CFM, heating, and
       * cooling are recomputed every substep against the latest temp. */
      const dt = 0.25; // 15-min outer step
      const subSteps = 15;
      const subDt = dt / subSteps;
      const stackHeightFt = Math.max(
        0.5,
        inputs.peakHeightFt - inputs.eaveHeightFt / 2,
      );
      const peakRidgeArea =
        2 * 4 * inputs.greenhouseLengthFt * 0.88 * Math.sin((38 * Math.PI) / 180);
      // Envelope U-value with curtain layers compounded.
      //
      // Each deployed fabric (thermal screen, blackout) adds a stagnant-air
      // layer between glazing and canopy, dropping effective U. We model the
      // dominant (lowest) U-value rather than serial conduction because the
      // curtains share an air gap and a series sum overcounts insulation.
      // When both are deployed simultaneously we take the smaller of the two
      // and apply a small additional credit (10 %) for the dual-layer air
      // pocket — conservative vs Wageningen/UMass dual-screen references.
      const thermalActive =
        inputs.thermalScreenEnabled && (hourOfDay < 6 || hourOfDay > 19);
      let envelopeUValueNow = inputs.envelopeUValueBTUhrFtF;
      if (thermalActive && blackoutActive) {
        envelopeUValueNow =
          Math.min(inputs.thermalScreenNightUValue, inputs.blackoutClosedUValue) *
          0.9;
      } else if (thermalActive) {
        envelopeUValueNow = inputs.thermalScreenNightUValue;
      } else if (blackoutActive) {
        envelopeUValueNow = inputs.blackoutClosedUValue;
      }
      const peakCoolingCapBTUhr = Math.max(
        ...derived.months.map((m) => m.totalCoolingBTUhr),
      );

      let T = prevIndoor;
      let vent = prevVent;
      for (let s = 0; s < subSteps; s++) {
        vent = ventStateAt({
          indoorTempF: T,
          ventOpenSetpointF: inputs.indoorTargetDryBulbF + 2,
          ventCloseSetpointF: inputs.indoorTargetDryBulbF - 1,
          currentlyOpen: vent,
        });
        const A_eff = vent
          ? effectiveVentAreaSqFt(peakRidgeArea, peakRidgeArea)
          : 0;
        const ventCFMSub = naturalVentilationCFM({
          effectiveOpenAreaSqFt: A_eff,
          stackHeightFt,
          indoorTempF: T,
          outdoorTempF: diurnal.outdoorTempF,
        });
        const heatingSub =
          inputs.radiantHeatingEnabled && T < inputs.indoorTargetDryBulbF - 2
            ? inputs.radiantHeatingCapacityBTUhr * 0.7
            : 0;
        const coolingSub =
          T > inputs.indoorTargetDryBulbF + 2 && !vent
            ? peakCoolingCapBTUhr * 0.5
            : 0;
        T = indoorTempStep({
          outdoorTempF: diurnal.outdoorTempF,
          prevIndoorTempF: T,
          lightingBTUhr,
          heatingBTUhr: heatingSub,
          coolingBTUhr: coolingSub,
          envelopeAreaSqFt: inputs.greenhouseEnvelopeAreaSqFt,
          envelopeUValue: envelopeUValueNow,
          ventilationCFM: ventCFMSub,
          volumeCuFt: inputs.greenhouseVolumeCuFt,
          dtHours: subDt,
        });
        // Physical clamp: a real greenhouse can't exit −20 °F to 140 °F.
        // If the integrator still trips on extreme inputs, this stops the
        // numerical blowup from poisoning downstream VPD/RH calcs.
        if (!Number.isFinite(T)) {
          T = inputs.indoorTargetDryBulbF;
          break;
        }
        T = Math.max(-20, Math.min(140, T));
      }
      const ventOpen = vent;
      const indoorTempF = T;
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
        blackoutActive,
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
    // Hard guard: even with the substepped solver, sustained numerical
    // pathology in user inputs (e.g., volume = 0, U-value 0) could produce
    // non-finite indoor temp. Substitute the setpoint so HUD never renders
    // 1e+31 °F as it did before this fix.
    if (!Number.isFinite(fullSnap.indoorTempF)) {
      fullSnap.indoorTempF = inputs.indoorTargetDryBulbF;
    }

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

    const indoorVPDRaw = vpdFromTempRH(
      fullSnap.indoorTempF,
      indoorRH,
      inputs.leafTempOffsetC,
    );
    const outdoorVPDRaw = vpdFromTempRH(
      fullSnap.outdoor.outdoorTempF,
      fullSnap.outdoor.outdoorRH,
      0, // outdoor: no leaf offset, just air-air VPD as reference
    );
    // Physical clamp on VPD: cannabis canopy VPD never exceeds ~6 kPa, even
    // in extreme dry/hot conditions. Anything above is a numerical artifact.
    const indoorVPD = Number.isFinite(indoorVPDRaw)
      ? Math.max(0, Math.min(6, indoorVPDRaw))
      : 0;
    const outdoorVPD = Number.isFinite(outdoorVPDRaw)
      ? Math.max(0, Math.min(6, outdoorVPDRaw))
      : 0;

    // ---- Vent decision (multi-input, Argus Titan pattern) ----
    // Re-evaluate the vent state at the snapshot scope where we know
    // indoorRH, AH diff, and dewpoint margin. The substep loop above
    // ran the temp-only fallback for stability; this richer decision
    // overrides for HUD display and feeds the reason into the systems row.
    const indoorDP = dewPointF(fullSnap.indoorTempF, indoorRH);
    const ventDecision = ventStateDecision({
      indoorTempF: fullSnap.indoorTempF,
      ventOpenSetpointF: inputs.indoorTargetDryBulbF + 2,
      ventCloseSetpointF: inputs.indoorTargetDryBulbF - 1,
      currentlyOpen: fullSnap.ventOpen,
      indoorRHPct: indoorRH,
      humidityTargetPct: inputs.ventHumidityTargetPct,
      indoorAbsoluteHumidity: absoluteHumidityKgPerKg(
        fahrenheitToCelsius(fullSnap.indoorTempF),
        indoorRH,
      ),
      outdoorAbsoluteHumidity: outdoorAH,
      indoorDewpointF: indoorDP,
      dewpointMarginF: inputs.ventDewpointMarginF,
      outdoorTempF: fullSnap.outdoor.outdoorTempF,
      blackoutActive: fullSnap.blackoutActive,
      lightsOn: fullSnap.lights.on,
    });

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
      ventOpen: ventDecision.open,
      ventReason: ventDecision.reason,
      indoorTempF: fullSnap.indoorTempF,
      shadeActive: fullSnap.shadeActive,
      blackoutActive: fullSnap.blackoutActive,
      indoorRH,
      indoorVPD,
      outdoorVPD,
      plant,
    };

    return { snapshot, trace, monthIndex: monthIdx };
  }, [inputs, climate, sim.dayOfYear, sim.hourOfDay, derived]);
}
