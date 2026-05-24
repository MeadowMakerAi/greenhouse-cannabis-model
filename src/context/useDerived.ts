import { useMemo } from "react";
import { useScenario } from "./ScenarioContext";
import { useAllFixtures } from "./useAllFixtures";
import { fixtureLibrary } from "../data/fixtureLibrary";
import { cropTargets } from "../data/cropTargets";
import { yieldRealismCases } from "../data/yieldRealism";
import { computeMonthlySolar, netCanopyTransmissionPct } from "../models/solarModel";
import { dliToPPFD, ppfdToDLI } from "../models/dliModel";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { computeUnderCanopy } from "../models/underCanopyModel";
import { evaluateCO2, co2StomatalFactor } from "../models/co2Model";
import { evaluateEvap } from "../models/evapCoolingModel";
import { heatLoadEstimate } from "../models/heatLoadModel";
import { estimateDehumidification } from "../models/dehumidificationModel";
import { psychState } from "../models/psychrometricModel";
import { vpdFromTempRH } from "../models/vpdModel";
import { isShadeActive } from "../models/shadeModel";
import { seasonalStrategy } from "../models/seasonalStrategyModel";
import { evaluateHeating } from "../models/heatingModel";
import { evaluatePathogenPressure } from "../models/pathogenModel";
import { projectYield } from "../models/yieldModel";
import { evaluateSteering } from "../models/cropSteeringModel";
import { evaluateHeatPump } from "../models/heatPumpModel";
import {
  checkLightingDensity,
  checkNetTransmission,
  checkOutdoorDLI,
  type SanityFlag,
} from "../models/sanityGuards";
import { DAYS_IN_MONTH, MONTH_NAMES } from "../utils/formatting";

export interface MonthDerived {
  month: number;
  monthLabel: string;
  outdoorDLI: number;
  greenhouseDLI: number;
  shadedGreenhouseDLI: number;
  flowerWindowDLI: number;
  flowerWindowFraction: number;
  shadeActive: boolean;
  supplementalDLIRequired: number;
  supplementalPPFDRequired: number;
  installedKW: number;
  electricalWatts: number;
  fixtureCount: number;
  wattsPerSqFt: number;
  coveragePerFixtureSqFt: number;
  coveragePerFixtureSqM: number;
  fixturesPer100SqFt: number;
  squareGridSpacingFt: number;
  squareGridSpacingM: number;
  monthlyKwh: number;
  monthlyCostUSD: number;
  lightingHeatBTUhr: number;
  envelopeLossBTUhr: number;
  lightingHeatOffsetBTUhr: number;
  netHeatingLoadBTUhr: number;
  heatingFuelMMBtu: number;
  heatingNotes: string[];
  underCanopyKW: number;
  underCanopyKwhMonth: number;
  underCanopyMonthlyCost: number;
  underCanopyHeatBTUhr: number;
  underCanopyDLI: number;
  wholePlantPPFDUplift: number;
  wholePlantDLIUplift: number;
  wholePlantDLIUpliftFraction: number;
  dailyPhotonAddedMMolPerFt2: number;
  underCanopyPhotonFlux_umol_s: number;
  vpdKPa: number;
  wetBulbF: number;
  dewPointF: number;
  evapSupplyTempF: number;
  evapReachesTarget: boolean;
  evapWarnings: string[];
  totalCoolingBTUhr: number;
  coolingTons: number;
  dehumidPintsPerDay: number;
  dehumidKwhPerDay: number;
  netMoistureGalDay: number;
  highHumidityRisk: boolean;
  botrytisScore: number;
  powderyMildewScore: number;
  pathogenSummary: string;
}

export interface ScenarioWarnings {
  global: string[];
  perMonth: Record<number, string[]>;
}

export function useDerived() {
  const { inputs, climate } = useScenario();
  const allFixtures = useAllFixtures();

  return useMemo(() => {
    const fixture =
      allFixtures[inputs.fixtureId] ?? fixtureLibrary[inputs.fixtureId] ?? fixtureLibrary.ledHighEfficiency;
    const target = cropTargets[inputs.cropTargetId];
    const transmission = netCanopyTransmissionPct(inputs.envelope);

    const solarOutputs = computeMonthlySolar(climate.data, {
      envelope: inputs.envelope,
      shadeEnabled: inputs.shadeEnabled,
      shadeTransmissionPct: inputs.shadeTransmissionPct,
      shadeStartMonth: inputs.shadeStartMonth,
      shadeEndMonth: inputs.shadeEndMonth,
      latitudeDeg: inputs.latitude,
      flowerWindowStartHr: inputs.flowerWindowStartHr,
      flowerWindowEndHr: inputs.flowerWindowEndHr,
      solarToPARFactor: inputs.solarToPARFactor,
    });

    const co2 = evaluateCO2({
      enabled: inputs.co2Enabled,
      setpointPpm: inputs.co2SetpointPpm,
      controlMode: inputs.co2ControlMode,
      ventilationMode: inputs.ventilationMode,
      targetDLI: target.targetDLI,
      highHumidityRisk: false,
    });

    const months: MonthDerived[] = solarOutputs.map((s, idx) => {
      const climateRow = climate.data[idx];
      const supplementalDLIRequired = Math.max(0, target.targetDLI - s.flowerWindowDLI);
      const supplementalPPFDRequired = dliToPPFD(
        supplementalDLIRequired,
        inputs.flowerPhotoperiodHours,
      );

      const sized = fixtureKWFromPPFD({
        supplementalPPFDRequired,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        fixture,
        photoperiodHours: inputs.flowerPhotoperiodHours,
        electricityRatePerKwh: inputs.electricityRatePerKwh,
        daysInMonth: DAYS_IN_MONTH[idx],
      });

      const heating = evaluateHeating({
        enabled: inputs.radiantHeatingEnabled,
        outdoorNightTempF: climateRow.minTempF,
        targetNightTempF: inputs.targetNightTempF,
        envelopeAreaSqFt: inputs.greenhouseEnvelopeAreaSqFt,
        envelopeUValueBTUhrFtF: inputs.envelopeUValueBTUhrFtF,
        nightLightingKW: sized.installedKW,
        lightingHeatRecoveryFraction: 0.6,
        equipmentNightKW: inputs.equipmentKW,
        radiantCapacityBTUhr: inputs.radiantHeatingCapacityBTUhr,
        radiantEfficiency: inputs.radiantEfficiency,
        nightHoursPerDay: 24 - inputs.flowerPhotoperiodHours,
        daysInMonth: DAYS_IN_MONTH[idx],
        thermalScreenEnabled: inputs.thermalScreenEnabled,
        thermalScreenNightUValue: inputs.thermalScreenNightUValue,
      });

      const uc = computeUnderCanopy({
        enabled: inputs.underCanopyEnabled,
        underCanopyPPFD: inputs.underCanopyPPFD,
        underCanopyPhotoperiodHours: inputs.underCanopyPhotoperiodHours,
        underCanopyPPE: inputs.underCanopyPPE,
        underCanopyCoveragePct: inputs.underCanopyCoveragePct,
        underCanopyOpticalUtilization: inputs.underCanopyOpticalUtilization,
        underCanopyHeatFractionToCanopyZone: inputs.underCanopyHeatFractionToCanopyZone,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        electricityRatePerKwh: inputs.electricityRatePerKwh,
        daysInMonth: DAYS_IN_MONTH[idx],
        topCanopyDLI:
          s.flowerWindowDLI +
          ppfdToDLI(supplementalPPFDRequired, inputs.flowerPhotoperiodHours),
      });

      const psych = psychState(climateRow.meanTempF, climateRow.meanRH, inputs.leafTempOffsetC);
      const vpd = vpdFromTempRH(
        climateRow.meanTempF,
        climateRow.meanRH,
        inputs.leafTempOffsetC,
      );

      const pathogen = evaluatePathogenPressure({
        meanTempF: inputs.indoorTargetDryBulbF,
        meanRH: inputs.targetRHPct,
        dewPointF: psych.dewPointF,
        cropStage: inputs.cultivationPhase,
        isFlowering: inputs.cultivationPhase !== "vegetative",
      });

      const evap = evaluateEvap({
        enabled: inputs.evapCoolingEnabled,
        efficiencyPct: inputs.evapEfficiencyPct,
        outdoorDryBulbF: climateRow.maxTempF,
        outdoorWetBulbF: climateRow.designWetBulbF,
        outdoorDewPointF: climateRow.designDewPointF,
        indoorTargetDryBulbF: inputs.indoorTargetDryBulbF,
        cropStage:
          inputs.cropStage === "veg"
            ? "veg"
            : inputs.cropStage === "earlyFlower"
              ? "earlyFlower"
              : inputs.cropStage === "midFlower"
                ? "midFlower"
                : "lateFlower",
      });

      const meanSolarWm2 = (climateRow.shortwaveKwhPerM2PerDay * 1000) / 12;
      const shadeActive = isShadeActive(idx, climateRow.meanTempF, meanSolarWm2, {
        shadeEnabled: inputs.shadeEnabled,
        shadeTransmissionPct: inputs.shadeTransmissionPct,
        shadeStartMonth: inputs.shadeStartMonth,
        shadeEndMonth: inputs.shadeEndMonth,
        shadeDeployMode: inputs.shadeDeployMode,
        shadeTriggerOutdoorTempF: inputs.shadeTriggerOutdoorTempF,
        shadeTriggerSolarWm2: inputs.shadeTriggerSolarWm2,
      });

      const shadeFactor = shadeActive ? inputs.shadeTransmissionPct / 100 : 1;
      // CO₂ enrichment partially closes stomata → less transpiration →
      // smaller latent cooling load AND smaller dehumidification load.
      // Apply the same factor at both call sites so the energy balance
      // and the moisture balance agree. Physical-feasibility gate on
      // ventilation mode lives inside co2StomatalFactor — open-vented
      // operation returns 1.0 because CO₂ can't be held at the canopy.
      // See CITATIONS.md → Ainsworth & Long (2005).
      const stomatalFactor = co2StomatalFactor(
        inputs.co2SetpointPpm,
        inputs.co2Enabled,
        inputs.ventilationMode,
      );
      const baselineTranspirationGalDay =
        (inputs.canopyAreaSqFt / 1000) *
        inputs.plantTranspirationGalPerDayPer1000SqFt;
      const effectiveTranspirationGalDay =
        baselineTranspirationGalDay * stomatalFactor;
      const heat = heatLoadEstimate({
        outdoorDryBulbF: climateRow.maxTempF,
        indoorTargetTempF: inputs.indoorTargetDryBulbF,
        envelopeUValueBTUhrFtF: inputs.envelopeUValueBTUhrFtF,
        greenhouseEnvelopeAreaSqFt: inputs.greenhouseEnvelopeAreaSqFt,
        greenhouseFloorAreaSqFt: inputs.greenhouseFloorAreaSqFt,
        solarShortwaveWm2: meanSolarWm2,
        greenhouseTransmissionFraction: transmission,
        shadeFactor,
        lightingKW: sized.installedKW,
        underCanopyKW: uc.underCanopyKW,
        equipmentKW: inputs.equipmentKW,
        ventilationCFM: inputs.ventilationCFM,
        ventilationDeltaTempF: inputs.ventilationDeltaTempF,
        plantTranspirationGalDay: effectiveTranspirationGalDay,
      });

      const dehumid = estimateDehumidification({
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        plantDensity: inputs.plantDensity,
        plantTranspirationGalPerDayPer1000SqFt:
          inputs.plantTranspirationGalPerDayPer1000SqFt,
        irrigationRateGalDay: inputs.irrigationRateGalDay,
        runoffPct: inputs.runoffPct,
        dehumidifierEfficiencyPintsPerKwh: inputs.dehumidifierEfficiencyPintsPerKwh,
        ventilationMoistureRemovalGalDay: inputs.ventilationMoistureRemovalGalDay,
        co2Enabled: inputs.co2Enabled,
        co2SetpointPpm: inputs.co2SetpointPpm,
        ventilationMode: inputs.ventilationMode,
      });

      const highHumidityRisk = climateRow.designDewPointF >= 60 || psych.dewPointF >= 60;

      return {
        month: idx,
        monthLabel: MONTH_NAMES[idx],
        outdoorDLI: s.outdoorDLI,
        greenhouseDLI: s.greenhouseDLI,
        shadedGreenhouseDLI: s.shadedGreenhouseDLI,
        flowerWindowDLI: s.flowerWindowDLI,
        flowerWindowFraction: s.flowerWindowFraction,
        shadeActive,
        supplementalDLIRequired,
        supplementalPPFDRequired,
        installedKW: sized.installedKW,
        electricalWatts: sized.electricalWatts,
        fixtureCount: sized.fixtureCount,
        wattsPerSqFt: sized.wattsPerSqFt,
        coveragePerFixtureSqFt: sized.coveragePerFixtureSqFt,
        coveragePerFixtureSqM: sized.coveragePerFixtureSqM,
        fixturesPer100SqFt: sized.fixturesPer100SqFt,
        squareGridSpacingFt: sized.squareGridSpacingFt,
        squareGridSpacingM: sized.squareGridSpacingM,
        monthlyKwh: sized.monthlyKwh,
        monthlyCostUSD: sized.monthlyCostUSD,
        lightingHeatBTUhr: sized.lightingHeatBTUhr,
        envelopeLossBTUhr: heating.envelopeLossBTUhr,
        lightingHeatOffsetBTUhr: heating.lightingHeatOffsetBTUhr,
        netHeatingLoadBTUhr: heating.netHeatingLoadBTUhr,
        heatingFuelMMBtu: heating.monthlyFuelInputMMBtu,
        heatingNotes: heating.notes,
        underCanopyKW: uc.underCanopyKW,
        underCanopyKwhMonth: uc.underCanopyKwhMonth,
        underCanopyMonthlyCost: uc.underCanopyMonthlyCost,
        underCanopyHeatBTUhr: uc.underCanopyHeatBTUhr,
        underCanopyDLI: uc.underCanopyDLI,
        wholePlantPPFDUplift: uc.wholePlantPPFDUplift,
        wholePlantDLIUplift: uc.wholePlantDLIUplift,
        wholePlantDLIUpliftFraction: uc.wholePlantDLIUpliftFraction,
        dailyPhotonAddedMMolPerFt2: uc.dailyPhotonAddedMMolPerFt2,
        underCanopyPhotonFlux_umol_s: uc.underCanopyPhotonFlux_umol_s,
        vpdKPa: vpd,
        wetBulbF: psych.wetBulbF,
        dewPointF: psych.dewPointF,
        evapSupplyTempF: evap.theoreticalSupplyTempF,
        evapReachesTarget: evap.reachesTarget,
        evapWarnings: evap.warnings,
        totalCoolingBTUhr: heat.totalCoolingBTUhr,
        coolingTons: heat.coolingTons,
        dehumidPintsPerDay: dehumid.pintsPerDay,
        dehumidKwhPerDay: dehumid.dehumidifierKwhPerDay,
        netMoistureGalDay: dehumid.netMoistureGalDay,
        highHumidityRisk,
        botrytisScore: pathogen.botrytisScore,
        powderyMildewScore: pathogen.powderyMildewScore,
        pathogenSummary: pathogen.summary,
      };
    });

    const annualKwh = months.reduce((a, m) => a + m.monthlyKwh + m.underCanopyKwhMonth, 0);
    const annualCost = months.reduce(
      (a, m) => a + m.monthlyCostUSD + m.underCanopyMonthlyCost,
      0,
    );
    const peakInstalledKW = Math.max(...months.map((m) => m.installedKW));
    // Peak lighting kW — overhead + under-canopy, since both bars run
    // in the same flower window. Codex P1: dropping under-canopy
    // under-bills demand by ~underCanopyKW × $/kW for any scenario
    // with under-canopy enabled (default on).
    const peakLightingKW = Math.max(
      ...months.map((m) => m.installedKW + m.underCanopyKW),
    );
    // Demand charge: utility bills the highest 15-min average kW each
    // month at $/kW. For lights-on cultivation the peak is the installed
    // lighting kW + always-on HVAC base. We use the lighting peak as a
    // screening-level lower bound; real demand is higher if HVAC peaks
    // coincidentally. This single line frequently exceeds the energy
    // charge on commercial cannabis accounts (Cannabis Business Times,
    // "10 Tips for Reducing Electricity Usage and Cost", 2024).
    const peakDemandChargeMonthly = peakLightingKW * inputs.demandChargePerKwMonth;
    const peakDemandChargeAnnual = peakDemandChargeMonthly * 12;
    // Dehumidification electric cost — pulled into the % denominator so
    // the "% of bill" reading reflects the full modeled electric load,
    // not just lighting. Codex P2.
    const annualDehumidKwh = months.reduce(
      (a, m) => a + m.dehumidKwhPerDay * 30,
      0,
    );
    const annualDehumidCost = annualDehumidKwh * inputs.electricityRatePerKwh;
    const annualEnergyPlusDemand =
      annualCost + annualDehumidCost + peakDemandChargeAnnual;
    const demandFractionOfBill =
      annualEnergyPlusDemand > 0
        ? peakDemandChargeAnnual / annualEnergyPlusDemand
        : 0;
    const peakElectricalWatts = Math.max(...months.map((m) => m.electricalWatts));
    const peakFixtureCount = Math.max(...months.map((m) => m.fixtureCount));
    const peakWattsPerSqFt = Math.max(...months.map((m) => m.wattsPerSqFt));
    // At peak fixture count, the coverage per fixture is at its smallest.
    const peakCoveragePerFixtureSqFt =
      peakFixtureCount > 0 ? inputs.canopyAreaSqFt / peakFixtureCount : 0;
    const peakCoveragePerFixtureSqM = peakCoveragePerFixtureSqFt / 10.7639;
    const peakFixturesPer100SqFt =
      inputs.canopyAreaSqFt > 0
        ? (peakFixtureCount / inputs.canopyAreaSqFt) * 100
        : 0;
    const peakSquareGridSpacingFt =
      peakCoveragePerFixtureSqFt > 0 ? Math.sqrt(peakCoveragePerFixtureSqFt) : 0;
    const peakSquareGridSpacingM = peakSquareGridSpacingFt / 3.2808;

    const activeFixtureSupports120V =
      fixture.minVoltage <= 120 && fixture.maxVoltage >= 120;
    const activeFixtureSupports240V =
      fixture.minVoltage <= 240 && fixture.maxVoltage >= 240;
    const activePF = fixture.powerFactor ?? inputs.servicePowerFactor;
    const peakAmpsPerFixture120V = activeFixtureSupports120V
      ? fixture.wattsPerFixture / (120 * activePF)
      : Number.NaN;
    const peakAmpsPerFixture240V = activeFixtureSupports240V
      ? fixture.wattsPerFixture / (240 * activePF)
      : Number.NaN;
    const peakTotalAmps120V = activeFixtureSupports120V
      ? peakElectricalWatts / (120 * activePF)
      : Number.NaN;
    const peakTotalAmps240V = activeFixtureSupports240V
      ? peakElectricalWatts / (240 * activePF)
      : Number.NaN;
    const usableAmps20A = inputs.branchCircuitAmps * 0.8;
    const usableAmps30A = 30 * 0.8;
    const peakCircuits20A_120V = activeFixtureSupports120V
      ? Math.ceil(peakTotalAmps120V / usableAmps20A)
      : 0;
    const peakCircuits20A_240V = activeFixtureSupports240V
      ? Math.ceil(peakTotalAmps240V / usableAmps20A)
      : 0;
    const peakCircuits30A_240V = activeFixtureSupports240V
      ? Math.ceil(peakTotalAmps240V / usableAmps30A)
      : 0;
    const peakCoolingTons = Math.max(...months.map((m) => m.coolingTons));
    const peakNetHeatingLoad = Math.max(...months.map((m) => m.netHeatingLoadBTUhr));
    const annualHeatingFuelMMBtu = months.reduce(
      (a, m) => a + m.heatingFuelMMBtu,
      0,
    );

    const sanityFlags: SanityFlag[] = [
      ...checkOutdoorDLI(months.map((m) => m.outdoorDLI)),
      ...checkNetTransmission(transmission),
      ...checkLightingDensity(peakElectricalWatts, inputs.canopyAreaSqFt),
    ];

    // ---- Yield projection (annual, screening estimate) ----
    const annualDLIMolM2 = months.reduce(
      (a, m, idx) => a + (m.flowerWindowDLI + m.supplementalDLIRequired) * DAYS_IN_MONTH[idx],
      0,
    );
    const yieldOut = projectYield({
      annualDLIMolM2,
      meanFlowerDayTempF: inputs.indoorTargetDryBulbF,
      co2Ppm: inputs.co2SetpointPpm,
      co2Enabled: inputs.co2Enabled,
      // Open-vented + enriched is physically infeasible; the gate
      // inside co2YieldMultiplier collapses the yield bump to 1.0 so
      // the model doesn't claim a +40% yield benefit for a scenario
      // that evaluateCO2 simultaneously flags as not viable.
      ventilationMode: inputs.ventilationMode,
      cyclesPerYear: inputs.cyclesPerYear,
      canopyAreaSqFt: inputs.canopyAreaSqFt,
      realismFactor: yieldRealismCases[inputs.yieldRealismCase].multiplier,
    });

    // ---- Crop steering alignment ----
    const steering = evaluateSteering({
      phase: inputs.cultivationPhase,
      dayTempF: inputs.indoorTargetDryBulbF,
      nightTempF: inputs.targetNightTempF,
      rhPct: inputs.targetRHPct,
      vpdKPa: months[5]?.vpdKPa ?? 1.2, // June reference
    });

    // ---- Heat pump alternative analysis ----
    const peakDehumidPintsDay = Math.max(...months.map((m) => m.dehumidPintsPerDay));
    const peakCoolingBTU = Math.max(...months.map((m) => m.totalCoolingBTUhr));
    const heatPump = evaluateHeatPump({
      peakCoolingBTUhr: peakCoolingBTU,
      peakDehumidPintsDay,
      peakToAverageRatio: 2.5,
      combinedCOP: inputs.heatPumpCombinedCOP,
      monthsOfOperation: 12,
    });

    // ---- Energy-use intensity (kWh per gram of dry flower) ----
    const totalAnnualKwh =
      annualKwh +
      months.reduce((a, m) => a + m.dehumidKwhPerDay * 30, 0);
    const energyUseIntensity_kWhPerGram =
      yieldOut.totalAnnualKg > 0 ? totalAnnualKwh / (yieldOut.totalAnnualKg * 1000) : 0;

    // ---- Yield realism classifier ----
    // Industry benchmarks for commercial cannabis (CannaMLS buyer's
    // checklist 2025, Cannabis Business Times "Measuring Yield"):
    //   indoor avg ~40 g/sq ft/harvest
    //   top operators 50-70
    //   "elite" rare at 100+
    //   greenhouse industry avg ~18 g/sq ft (Next Big Crop)
    // We classify the projected g/ft²/cycle into one of three tiers
    // so the user can see — before they take a number to a lender —
    // whether their projection requires harvest evidence to defend.
    const gramsPerSqFtPerCycle = yieldOut.gramsPerM2PerCycle / 10.7639;
    let yieldTier: "startup" | "established" | "aspirational" | "elite";
    let yieldTierLabel: string;
    let yieldTierNeedsEvidence: boolean;
    if (gramsPerSqFtPerCycle <= 35) {
      yieldTier = "startup";
      yieldTierLabel = "Startup-tier yield";
      yieldTierNeedsEvidence = false;
    } else if (gramsPerSqFtPerCycle <= 70) {
      yieldTier = "established";
      yieldTierLabel = "Established-operator tier";
      yieldTierNeedsEvidence = false;
    } else if (gramsPerSqFtPerCycle <= 100) {
      yieldTier = "aspirational";
      yieldTierLabel = "Aspirational — needs harvest evidence";
      yieldTierNeedsEvidence = true;
    } else {
      yieldTier = "elite";
      yieldTierLabel = "Elite-only — strongly justify";
      yieldTierNeedsEvidence = true;
    }

    // ---- Pathogen pressure summary across all months ----
    const peakBotrytis = Math.max(...months.map((m) => m.botrytisScore));
    const peakPM = Math.max(...months.map((m) => m.powderyMildewScore));
    const annualBotrytisAvg =
      months.reduce((a, m) => a + m.botrytisScore, 0) / 12;
    const annualPMAvg = months.reduce((a, m) => a + m.powderyMildewScore, 0) / 12;

    const warnings: ScenarioWarnings = {
      global: [...co2.warnings],
      perMonth: {},
    };
    if (target.targetDLI >= 45 && !inputs.co2Enabled) {
      warnings.global.push(
        "High DLI target selected without CO₂ enrichment. Diminishing returns and stress risk increase.",
      );
    }
    if (fixture.type === "HPS") {
      warnings.global.push(
        "HPS adds large radiant heat directly to the canopy. Cooling/dehumidification penalty in summer can outweigh lower capex.",
      );
    }
    if (
      inputs.blackoutEnabled &&
      transmission > 0.6 &&
      months.some((m) => m.month >= 5 && m.month <= 7 && climate.data[m.month].maxTempF > 80)
    ) {
      warnings.global.push(
        "Blackout traps heat and humidity in summer. Active cooling and dehumidification will be required.",
      );
    }

    months.forEach((m) => {
      const wm: string[] = [];
      if (!m.evapReachesTarget && inputs.evapCoolingEnabled) {
        wm.push(
          `Evaporative cooling cannot reach target indoor temp this month (supply ${m.evapSupplyTempF.toFixed(0)}°F).`,
        );
      }
      if (m.highHumidityRisk) {
        wm.push("High dew-point period — botrytis/PM risk; mechanical dehumidification critical.");
      }
      if (inputs.co2Enabled && (inputs.ventilationMode === "moderate" || inputs.ventilationMode === "open_vented") && climate.data[m.month].maxTempF > 80) {
        wm.push("CO₂ enrichment will be ineffective during high-ventilation periods this month.");
      }
      if (wm.length) warnings.perMonth[m.month] = wm;
    });

    const strategies = months.map((m) =>
      seasonalStrategy({
        month: m.month,
        outdoorDLI: m.outdoorDLI,
        flowerWindowDLI: m.flowerWindowDLI,
        meanTempF: climate.data[m.month].meanTempF,
        designWetBulbF: climate.data[m.month].designWetBulbF,
        designDewPointF: climate.data[m.month].designDewPointF,
        shadeActive: m.shadeActive,
        co2Enabled: inputs.co2Enabled,
        hpsSelected: fixture.type === "HPS",
        highDLITarget: target.targetDLI >= 45,
      }),
    );

    return {
      months,
      annualKwh,
      annualCost,
      peakLightingKW,
      annualDehumidKwh,
      annualDehumidCost,
      peakDemandChargeMonthly,
      peakDemandChargeAnnual,
      annualEnergyPlusDemand,
      demandFractionOfBill,
      gramsPerSqFtPerCycle,
      yieldTier,
      yieldTierLabel,
      yieldTierNeedsEvidence,
      peakInstalledKW,
      peakElectricalWatts,
      peakFixtureCount,
      peakWattsPerSqFt,
      peakCoveragePerFixtureSqFt,
      peakCoveragePerFixtureSqM,
      peakFixturesPer100SqFt,
      peakSquareGridSpacingFt,
      peakSquareGridSpacingM,
      activeFixtureSupports120V,
      activeFixtureSupports240V,
      peakAmpsPerFixture120V,
      peakAmpsPerFixture240V,
      peakTotalAmps120V,
      peakTotalAmps240V,
      peakCircuits20A_120V,
      peakCircuits20A_240V,
      peakCircuits30A_240V,
      peakCoolingTons,
      peakNetHeatingLoad,
      annualHeatingFuelMMBtu,
      transmission,
      target,
      fixture,
      co2,
      warnings,
      strategies,
      sanityFlags,
      yieldProjection: yieldOut,
      cropSteering: steering,
      heatPump,
      energyUseIntensity_kWhPerGram,
      peakBotrytis,
      peakPM,
      annualBotrytisAvg,
      annualPMAvg,
      annualDLIMolM2,
    };
  }, [inputs, climate, allFixtures]);
}
