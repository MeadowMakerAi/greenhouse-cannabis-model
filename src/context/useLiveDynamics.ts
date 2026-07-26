import { useMemo } from "react";
import { useScenario } from "./ScenarioContext";
import { useSimulation } from "./SimulationContext";
import { useDerived } from "./useDerived";
import {
  blackoutActiveAt,
  canopyPPFDFromOutdoor,
  diurnalState,
  effectiveVentAreaSqFt,
  lightsStateAt,
  naturalVentilationCFM,
  outdoorPPFDFromElevation,
  sunPositionAt,
  ventStateDecision,
  type VentReason,
  type SunPosition,
  type LightsState,
} from "../models/simulationModel";
import { netCanopyTransmissionPct, distributeDailyIrradiance } from "../models/solarModel";
import { supplementalDim } from "../models/dimmingControl";
import {
  climateSubstep,
  AIR_THERMAL_CAPACITY_BTU_PER_FT3_F,
} from "../models/greenhouseClimateStep";
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
  /** Proportional ridge-vent opening (0..1) — driven by the P-band on
   *  indoor T vs setpoint with humidity/dewpoint dumps forcing full open. */
  ventOpen: number;
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
  /** Interior solar heat gain right now (BTU/hr) — the greenhouse effect. */
  solarGainBTUhr: number;
  /** Wet-wall (pad) evaporative cooling right now (BTU/hr). */
  padCoolingBTUhr: number;
  /** Fog/misting evaporative cooling right now (BTU/hr). */
  fogCoolingBTUhr: number;
  /** Plant growth state (visual geometry + phase) */
  plant: PlantGrowthState;
}

/**
 * Trace spacing AND the physics outer-step, kept identical so elapsed clock
 * time equals elapsed integrated time. They previously diverged (trace advanced
 * 0.5 h while the outer step was 0.25 h), which under-integrated every daily
 * trace by ~2× — most visibly on the carried moisture state (Codex P1).
 * The adaptive substep loop subdivides this for numerical stability.
 */
const TRACE_STEP_HOURS = 0.5;

export interface DailyTracePoint {
  hour: number;
  outdoorTempF: number;
  indoorTempF: number;
  outdoorRH: number;
  indoorRH: number;
  canopyPPFD: number;
  supplementalOnFraction: number; // 0 or 1 for line steps
  ventOpen: number; // 0..1 (proportional opening)
  sunElev: number;
  outdoorPPFD: number;
  /** Interior solar heat gain (BTU/hr) — the "greenhouse effect", peaks at noon. */
  solarGainBTUhr: number;
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

    // Instantaneous solar irradiance (W/m²) across today, distributing the
    // MEASURED monthly shortwave total by the sun-elevation shape so magnitude
    // stays real and the curve peaks at solar noon. Built once per day.
    const solarWm2At = distributeDailyIrradiance(
      lat,
      sim.dayOfYear,
      climateRow.shortwaveKwhPerM2PerDay,
    );
    // W/m² → BTU/hr/ft² — matches grow-core heatLoadModel's constant
    // (CITATIONS.md → greenhouse climate engineering). Solar heat into the house
    // = irradiance × this × floor area × glazing transmission × shade factor.
    const W_PER_M2_TO_BTU_PER_FT2_HR = 0.317;
    // Canopy transpiration as a moisture source (lb water/hr): the seasonal
    // daily rate spread across the hours. 8.3454 lb/gal, 24 h/day.
    const transpirationLbPerHr =
      ((inputs.canopyAreaSqFt / 1000) *
        inputs.plantTranspirationGalPerDayPer1000SqFt *
        8.3454) /
      24;

    const computeAt = (
      hourOfDay: number,
      prevIndoor: number,
      prevVent: number,
      prevAH: number,
    ) => {
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
      const lightsRaw = lightsStateAt({
        hourOfDay,
        photoperiodHours: inputs.flowerPhotoperiodHours,
        windowStartHour: inputs.flowerWindowStartHr,
        windowEndHour: inputs.flowerWindowEndHr,
        naturalCanopyPPFD: canopyNaturalPPFD,
        targetPPFD: derived.target.targetTopCanopyPPFD,
        dimWhenBright: true,
      });
      // Real-time (per-trace-step) dimming control law — light-meter driven,
      // shared with the test via models/dimmingControl.supplementalDim. The
      // "light meter" is canopyNaturalPPFD, recomputed every step, so the
      // fixtures fade as the sun climbs toward noon and brighten as it falls.
      //
      // grow-core reports dimLevel = deficit/target, which is wrong twice over:
      // (1) it's a fraction of the SETPOINT, not of the fixtures' installed
      // output, so it isn't "what % the fixtures actually run at"; and (2) the
      // old code multiplied that by the deficit again → supplemental =
      // deficit²/target, sagging the canopy ~25% below target in half-sun.
      // supplementalDim fixes both: dim = fraction of installed (nameplate)
      // power, supplemental = dim × installed full output. We model fully-
      // dimmable fixtures — a per-fixture dimming floor (Gavita's is
      // controller-dependent, NOT OBSERVED from a spec sheet) is left unset
      // rather than fabricated; add fixture.dimmingFloorPct when sourced.
      const { dimLevel, supplementalPPFD } = supplementalDim({
        targetPPFD: derived.target.targetTopCanopyPPFD,
        naturalPPFD: canopyNaturalPPFD,
        installedFullPPFD: derived.installedFullCanopyPPFD,
        on: lightsRaw.on,
      });
      const lights = { ...lightsRaw, dimLevel };
      const canopyTotalPPFD = canopyNaturalPPFD + supplementalPPFD;
      // Lighting heat scales dim against NAMEPLATE power (dim is a fraction of
      // nameplate output), NOT peakInstalledKW — grow-core's installedKW is the
      // exact pre-rounding requirement and would under-report heat by the
      // whole-fixture slack (material for small fixture counts). Codex P2.
      const lightingBTUhr = lights.on
        ? kWToBTUhr(derived.installedNameplateKW * dimLevel)
        : 0;
      // Interior solar heat gain — the "greenhouse effect", now live per-tick.
      // Same formula grow-core heatLoadEstimate uses seasonally (CITATIONS.md →
      // greenhouse climate engineering): instantaneous shortwave × 0.317 ×
      // floor area × glazing transmission × shade factor. Shade cloth now has a
      // real thermal effect (it drops the shade factor when deployed).
      const shadeFactorNow = shadeActive ? inputs.shadeTransmissionPct / 100 : 1;
      const solarGainBTUhr =
        solarWm2At(hourOfDay) *
        W_PER_M2_TO_BTU_PER_FT2_HR *
        inputs.greenhouseFloorAreaSqFt *
        transmission *
        shadeFactorNow;
      // Outdoor absolute humidity drives the moisture balance (vent exchange +
      // pad intake). Constant across this step's inner substeps.
      const outdoorAH = absoluteHumidityKgPerKg(
        fahrenheitToCelsius(diurnal.outdoorTempF),
        diurnal.outdoorRH,
      );
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
      const dt = TRACE_STEP_HOURS; // outer step = trace spacing (see constant)
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

      // Adaptive substepping. The 15×1-min split was tuned for ~234 kW lighting
      // heat; summer solar gain (~340 kW for a large house) plus lighting can
      // push a bigger ΔT per inner step, and the √ΔT natural-vent feedback
      // overshoots if one inner step moves T too far. Size the inner-step count
      // so the worst-case forcing (all heat + cooling magnitudes summed) can't
      // move T more than ~2 °F per inner step; floor at 15, cap at 60 for cost.
      const thermalCapacityBTUperF = Math.max(
        1,
        inputs.greenhouseVolumeCuFt * AIR_THERMAL_CAPACITY_BTU_PER_FT3_F,
      );
      const heatingCapBTUhr = inputs.radiantHeatingEnabled
        ? inputs.radiantHeatingCapacityBTUhr * 0.7
        : 0;
      const forcingBTUhr =
        lightingBTUhr + solarGainBTUhr + heatingCapBTUhr + peakCoolingCapBTUhr;
      const MAX_DT_PER_SUBSTEP_F = 2;
      const subSteps = Math.max(
        15,
        Math.min(
          60,
          Math.ceil(
            (forcingBTUhr * dt) /
              (MAX_DT_PER_SUBSTEP_F * thermalCapacityBTUperF),
          ),
        ),
      );
      const subDt = dt / subSteps;

      let T = prevIndoor;
      let vent = prevVent; // proportional opening 0..1
      let AH = prevAH; // indoor absolute humidity (kg/kg) — loop state now
      let padCoolingBTUhr = 0;
      let fogCoolingBTUhr = 0;
      for (let s = 0; s < subSteps; s++) {
        // Proportional vent control: open % scales with how far indoor
        // temp is above the setpoint, capped at full open. CFM through
        // the ridge scales with the open % since the effective vent
        // area is proportional to the opening.
        vent = ventStateDecision({
          indoorTempF: T,
          ventOpenSetpointF: inputs.indoorTargetDryBulbF + 2,
          ventCloseSetpointF: inputs.indoorTargetDryBulbF - 1,
          currentlyOpen: vent > 0,
        }).openFraction;
        const A_eff =
          vent > 0
            ? effectiveVentAreaSqFt(peakRidgeArea, peakRidgeArea) * vent
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
        // Mechanical cooling backs up natural ventilation when vents
        // alone can't keep up. Phased in as vents approach full open.
        const ventInsufficient = vent < 0.95;
        const mechCoolingSub =
          T > inputs.indoorTargetDryBulbF + 2 && ventInsufficient
            ? peakCoolingCapBTUhr * 0.5 * (1 - vent)
            : 0;
        // Coupled sensible + latent update. Solar folds into the heat input;
        // wet-wall pad pre-cools the ventilation intake; fog cools interior
        // air toward its wet-bulb; the moisture balance carries AH forward so
        // evaporative effectiveness fades as RH climbs ("full latent coupling").
        // Pad + fog airflow both key off the live natural-vent CFM — the only
        // OBSERVED airflow (mechanical ventilationCFM defaults to 0); no
        // fabricated fan spec. See models/greenhouseClimateStep.
        const step = climateSubstep({
          indoorTempF: T,
          indoorAH: AH,
          outdoorTempF: diurnal.outdoorTempF,
          outdoorRHPct: diurnal.outdoorRH,
          outdoorAH,
          ventCFM: ventCFMSub,
          solarGainBTUhr,
          lightingBTUhr,
          heatingBTUhr: heatingSub,
          mechCoolingBTUhr: mechCoolingSub,
          envelopeAreaSqFt: inputs.greenhouseEnvelopeAreaSqFt,
          envelopeUValue: envelopeUValueNow,
          volumeCuFt: inputs.greenhouseVolumeCuFt,
          transpirationLbPerHr,
          padEnabled: inputs.evapCoolingEnabled,
          padEfficiencyPct: inputs.evapEfficiencyPct,
          fogEnabled: inputs.fogCoolingEnabled,
          fogEfficiencyPct: inputs.fogEfficiencyPct,
          fogAirflowCFM: ventCFMSub,
          dehumEnabled: inputs.dehumidificationEnabled,
          targetRHPct: inputs.targetRHPct,
          dtHours: subDt,
        });
        T = step.indoorTempF;
        AH = step.indoorAH;
        padCoolingBTUhr = step.padCoolingBTUhr;
        fogCoolingBTUhr = step.fogCoolingBTUhr;
        // Physical clamp: a real greenhouse can't exit −20 °F to 140 °F.
        // If the integrator still trips on extreme inputs, this stops the
        // numerical blowup from poisoning downstream VPD/RH calcs.
        if (!Number.isFinite(T)) {
          T = inputs.indoorTargetDryBulbF;
          AH = prevAH;
          break;
        }
        T = Math.max(-20, Math.min(140, T));
      }
      const ventOpen = vent;
      const indoorTempF = T;
      // Indoor RH from the final coupled state (same grow-core inverse
      // climateSubstep uses internally, so it's consistent tick-to-tick).
      const indoorRHPct = Number.isFinite(T)
        ? Math.max(0, Math.min(100, rhFromAbsoluteHumidity(fahrenheitToCelsius(T), AH)))
        : inputs.targetRHPct;
      return {
        sun,
        outdoor: diurnal,
        outdoorPPFD,
        canopyNaturalPPFD,
        canopyTotalPPFD,
        lights,
        ventOpen,
        indoorTempF,
        indoorAH: AH,
        indoorRHPct,
        solarGainBTUhr,
        padCoolingBTUhr,
        fogCoolingBTUhr,
        shadeActive,
        blackoutActive,
      };
    };

    // Build a 24-hour trace for the current day (to chart it)
    const trace: DailyTracePoint[] = [];
    let prevIndoor = climateRow.meanTempF;
    let prevVent = 0;
    // Seed indoor absolute humidity from the day's mean conditions so the
    // moisture state has a physical starting point for the integration.
    let prevAH = absoluteHumidityKgPerKg(
      fahrenheitToCelsius(climateRow.meanTempF),
      climateRow.meanRH,
    );
    for (let h = 0; h <= 24; h += TRACE_STEP_HOURS) {
      const r = computeAt(h, prevIndoor, prevVent, prevAH);
      prevIndoor = r.indoorTempF;
      prevVent = r.ventOpen;
      prevAH = r.indoorAH;
      trace.push({
        hour: h,
        outdoorTempF: r.outdoor.outdoorTempF,
        indoorTempF: r.indoorTempF,
        outdoorRH: r.outdoor.outdoorRH,
        indoorRH: r.indoorRHPct,
        canopyPPFD: r.canopyTotalPPFD,
        supplementalOnFraction: r.lights.on ? r.lights.dimLevel : 0,
        ventOpen: r.ventOpen,
        sunElev: r.sun.elevationDeg,
        outdoorPPFD: r.outdoorPPFD,
        solarGainBTUhr: r.solarGainBTUhr,
      });
    }

    // Snapshot at current sim time. Codex P0: previously we picked the trace
    // point at idx (which holds the post-step indoor/vent state) and re-fed it
    // into another computeAt → snapshot was always one 15-min step ahead of
    // the chart. Fix: feed the PREVIOUS trace point's state in so computeAt
    // produces the same step the trace point represents.
    const idx = Math.max(0, Math.min(trace.length - 1, Math.round(sim.hourOfDay / TRACE_STEP_HOURS)));
    const prevIdx = Math.max(0, idx - 1);
    const prev = trace[prevIdx];
    // Reconstruct the previous point's absolute humidity from its (T, RH) — the
    // grow-core AH↔RH pair is a clean inverse, so this recovers the loop's AH
    // state without widening the trace-point interface just to carry it.
    const prevSnapAH = absoluteHumidityKgPerKg(
      fahrenheitToCelsius(prev.indoorTempF),
      prev.indoorRH,
    );
    const fullSnap = computeAt(
      sim.hourOfDay,
      prev.indoorTempF,
      prev.ventOpen,
      prevSnapAH,
    );
    // Hard guard: even with the substepped solver, sustained numerical
    // pathology in user inputs (e.g., volume = 0, U-value 0) could produce
    // non-finite indoor temp. Substitute the setpoint so HUD never renders
    // 1e+31 °F as it did before this fix.
    if (!Number.isFinite(fullSnap.indoorTempF)) {
      fullSnap.indoorTempF = inputs.indoorTargetDryBulbF;
    }

    // Indoor RH now comes from the coupled moisture balance inside the substep
    // loop (transpiration + pad/fog evaporation + vent exchange − dehumidifier),
    // NOT a post-hoc estimate. This closes the CITATIONS.md gap: the per-tick
    // humidity model DOES apply a full moisture balance moved inside the
    // substepped Euler loop, so evaporative cooling and RH move together.
    // The dehumidifier is modeled in-loop (holds toward targetRHPct when RH is
    // above it), so no separate target cap is applied here.
    const indoorRH = Number.isFinite(fullSnap.indoorRHPct)
      ? Math.max(0, Math.min(100, fullSnap.indoorRHPct))
      : inputs.targetRHPct;
    // Outdoor absolute humidity still feeds the richer HUD vent decision below.
    const outdoorAH = absoluteHumidityKgPerKg(
      fahrenheitToCelsius(fullSnap.outdoor.outdoorTempF),
      fullSnap.outdoor.outdoorRH,
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
      currentlyOpen: fullSnap.ventOpen > 0,
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
    // Cycle-average DLI proxy: in a production setup with sized
    // supplemental lighting, the canopy actually sees its targetDLI
    // during flower (supplemental closes the seasonal gap). When the
    // operator screens a low-target-DLI design (target < 30), the
    // low-DLI damping branch in co2YieldMultiplier correctly fires and
    // shows under-developed plants in the live visual. ventilationMode
    // is also passed so open-vented + CO₂ doesn't fake a yield bump
    // in the live geometry.
    const plant = plantGrowthAt({
      cropStartDayOfYear: inputs.cropStartDayOfYear,
      vegDays: inputs.vegDays,
      flowerDays: inputs.flowerDays,
      currentDayOfYear: sim.dayOfYear,
      meanDLI: derived.target.targetDLI,
      targetDLI: derived.target.targetDLI,
      meanTempF: inputs.indoorTargetDryBulbF,
      co2Ppm: inputs.co2SetpointPpm,
      co2Enabled: inputs.co2Enabled,
      ventilationMode: inputs.ventilationMode,
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
      ventOpen: ventDecision.openFraction,
      ventReason: ventDecision.reason,
      indoorTempF: fullSnap.indoorTempF,
      shadeActive: fullSnap.shadeActive,
      blackoutActive: fullSnap.blackoutActive,
      indoorRH,
      indoorVPD,
      outdoorVPD,
      solarGainBTUhr: fullSnap.solarGainBTUhr,
      padCoolingBTUhr: fullSnap.padCoolingBTUhr,
      fogCoolingBTUhr: fullSnap.fogCoolingBTUhr,
      plant,
    };

    return { snapshot, trace, monthIndex: monthIdx };
  }, [inputs, climate, sim.dayOfYear, sim.hourOfDay, derived]);
}
