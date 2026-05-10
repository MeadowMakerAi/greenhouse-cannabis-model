import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { fallbackMontgomeryClimate } from "../data/fallbackMontgomeryClimate";
import { fixtureLibrary, underCanopyFixtureDefault } from "../data/fixtureLibrary";
import { cropTargets } from "../data/cropTargets";
import {
  defaultEconomics,
  defaultElectricalService,
  defaultEnvelope,
  defaultGreenhouseGeometry,
  defaultPhotoperiod,
  defaultSite,
  defaultSolarConversion,
} from "../data/greenhouseDefaults";
import { defaultClimateControl } from "../data/climateControlDefaults";
import { defaultCO2 } from "../data/co2Defaults";
import { defaultVPDTargets } from "../models/vpdModel";
import type { MonthlyClimate, GreenhouseEnvelope } from "../models/solarModel";
import type { FixtureSpec } from "../models/fixtureModel";
import { fetchNasaPowerMonthly } from "../services/nasaPowerClient";
import { fetchOpenMeteoMonthly } from "../services/openMeteoClient";

const CUSTOM_FIXTURE_KEY = "greenhouse-model:customFixtures:v1";

export type CropStage = "veg" | "earlyFlower" | "midFlower" | "lateFlower";
export type VentilationMode =
  | "open_vented"
  | "moderate"
  | "low"
  | "semi_sealed"
  | "sealed";

export interface ScenarioInputs {
  // Site
  siteAddress: string;
  latitude: number;
  longitude: number;
  elevationFt: number;
  weatherStation: string;
  coordinateStatus: string;
  timezone: string;

  // Geometry — exterior architectural primary
  greenhouseLengthFt: number;
  greenhouseWidthFt: number;
  eaveHeightFt: number;
  peakHeightFt: number;
  // Canopy (flowering footprint)
  canopyAreaSqFt: number;
  // Derived defaults (re-derive from dimensions when sync'd)
  greenhouseFloorAreaSqFt: number;
  greenhouseEnvelopeAreaSqFt: number;
  greenhouseVolumeCuFt: number;

  // Envelope
  envelope: GreenhouseEnvelope;

  // Photoperiod
  cropStage: CropStage;
  flowerPhotoperiodHours: number;
  flowerWindowStartHr: number;
  flowerWindowEndHr: number;
  blackoutEnabled: boolean;

  // Targets
  cropTargetId: keyof typeof cropTargets;

  // Solar conversion
  solarToPARFactor: number;

  // Overhead lighting
  fixtureId: keyof typeof fixtureLibrary;

  // Under-canopy
  underCanopyEnabled: boolean;
  underCanopyPPFD: number;
  underCanopyPhotoperiodHours: number;
  underCanopyPPE: number;
  underCanopyOpticalUtilization: number;
  underCanopyCoveragePct: number;
  underCanopyHeatFractionToCanopyZone: number;

  // CO₂
  co2Enabled: boolean;
  co2SetpointPpm: number;
  co2ControlMode: "ambient" | "enriched" | "sealed_or_semi_sealed";
  ventilationMode: VentilationMode;

  // Shade
  shadeEnabled: boolean;
  shadeTransmissionPct: number;
  shadeStartMonth: number;
  shadeEndMonth: number;
  shadeDeployMode: "manual" | "seasonal" | "temperature_trigger" | "radiation_trigger";
  shadeTriggerOutdoorTempF: number;
  shadeTriggerSolarWm2: number;

  // Heating
  radiantHeatingEnabled: boolean;
  radiantHeatingCapacityBTUhr: number;
  radiantEfficiency: number;
  targetNightTempF: number;
  targetDayTempF: number;
  rootZoneHeatingEnabled: boolean;
  rootZoneTargetTempF: number;
  thermalScreenEnabled: boolean;
  thermalScreenNightUValue: number;

  // Cultivation phase + cycles
  cultivationPhase: "vegetative" | "earlyFlower" | "midFlower" | "lateFlower";
  cyclesPerYear: number;
  // Plant growth schedule (drives 3D plant geometry over time)
  cropStartDayOfYear: number; // when this cycle started (clone planted)
  vegDays: number; // length of vegetative phase
  flowerDays: number; // length of flower phase
  cultivarStretchFactor: number; // 1.2 indica, 1.35 hybrid, 1.5 sativa

  // Heat pump option
  useIntegratedHeatPump: boolean;
  heatPumpCombinedCOP: number;

  // Evap cooling
  evapCoolingEnabled: boolean;
  evapEfficiencyPct: number;
  indoorTargetDryBulbF: number;

  // Mechanical cooling
  mechanicalCoolingEnabled: boolean;
  envelopeUValueBTUhrFtF: number;
  equipmentKW: number;
  ventilationCFM: number;
  ventilationDeltaTempF: number;

  // Dehumidification
  dehumidificationEnabled: boolean;
  plantDensity: number;
  plantTranspirationGalPerDayPer1000SqFt: number;
  irrigationRateGalDay: number;
  runoffPct: number;
  dehumidifierEfficiencyPintsPerKwh: number;
  ventilationMoistureRemovalGalDay: number;
  targetRHPct: number;

  // VPD targets
  leafTempOffsetC: number;

  // Economics
  electricityRatePerKwh: number;

  // Electrical service
  serviceVoltagePrimary: number; // 120 or 240, primary branch voltage
  serviceVoltageSecondary: number; // typically the other available voltage
  branchCircuitAmps: number; // 20 typical for general, 30 for dedicated 240
  servicePowerFactor: number; // assumed PF for amperage calc when fixture doesn't provide one
}

// Auto-derive area + envelope + volume from exterior dimensions.
// Exported so consumers (e.g. the chatbot's set_scenario tool) can mirror
// the same derivation when echoing patches synchronously, without having
// to wait for React to re-render and re-run setInputs's internal derive.
export function geometryFromDims(
  length: number,
  width: number,
  eave: number,
  peak: number,
) {
  // Clamp peak >= eave. A peak below the eave inverts the gable, producing
  // negative gable area, negative volume contribution, and a "valley" roof
  // slope that the 3D scene can't render correctly. Treat peak === eave as
  // a flat roof and proceed.
  const safePeak = Math.max(peak, eave);
  // Roof slope length: hypotenuse from eave to peak across half the width
  const slopeLen = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(safePeak - eave, 2));
  // Envelope area: 2 sidewalls (L×eave) + 2 end gables (rectangle + triangle)
  // + 2 roof slopes (L × slopeLen)
  const sidewalls = 2 * length * eave;
  const endRectangles = 2 * width * eave;
  const endGables = 2 * (0.5 * width * (safePeak - eave));
  const roofSlopes = 2 * length * slopeLen;
  const envelope = sidewalls + endRectangles + endGables + roofSlopes;
  const floor = length * width;
  // Volume: rectangular sidewalls + triangular ridge prism
  const volume = floor * eave + 0.5 * width * (safePeak - eave) * length;
  return {
    floor,
    envelope,
    volume,
  };
}

const _defaultDerived = geometryFromDims(
  defaultGreenhouseGeometry.greenhouseLengthFt,
  defaultGreenhouseGeometry.greenhouseWidthFt,
  defaultGreenhouseGeometry.eaveHeightFt,
  defaultGreenhouseGeometry.peakHeightFt,
);

export const defaultScenario: ScenarioInputs = {
  ...defaultSite,
  weatherStation: defaultSite.nearestWeatherAnchor,
  ...defaultGreenhouseGeometry,
  greenhouseFloorAreaSqFt: _defaultDerived.floor,
  greenhouseEnvelopeAreaSqFt: _defaultDerived.envelope,
  greenhouseVolumeCuFt: _defaultDerived.volume,
  envelope: defaultEnvelope,
  ...defaultPhotoperiod,
  cropTargetId: "commercialPremium",
  solarToPARFactor: defaultSolarConversion.solarToPARFactor,
  fixtureId: "ledHighEfficiency",
  underCanopyEnabled: true,
  underCanopyPPFD: 150,
  underCanopyPhotoperiodHours: 12,
  underCanopyPPE: underCanopyFixtureDefault.ppe,
  underCanopyOpticalUtilization: underCanopyFixtureDefault.opticalUtilization,
  underCanopyCoveragePct: 80,
  underCanopyHeatFractionToCanopyZone:
    underCanopyFixtureDefault.heatFractionToCanopyZone,
  co2Enabled: defaultCO2.enabled,
  co2SetpointPpm: defaultCO2.setpointPpm,
  co2ControlMode: defaultCO2.controlMode,
  ventilationMode: defaultCO2.ventilationMode,
  shadeEnabled: defaultClimateControl.shade.shadeEnabled,
  shadeTransmissionPct: defaultClimateControl.shade.shadeTransmissionPct,
  shadeStartMonth: defaultClimateControl.shade.shadeStartMonth,
  shadeEndMonth: defaultClimateControl.shade.shadeEndMonth,
  shadeDeployMode: defaultClimateControl.shade.shadeDeployMode,
  shadeTriggerOutdoorTempF: defaultClimateControl.shade.shadeTriggerOutdoorTempF,
  shadeTriggerSolarWm2: defaultClimateControl.shade.shadeTriggerSolarWm2,
  radiantHeatingEnabled: defaultClimateControl.radiant.radiantHeatingEnabled,
  radiantHeatingCapacityBTUhr: defaultClimateControl.radiant.radiantHeatingCapacityBTUhr,
  radiantEfficiency: defaultClimateControl.radiant.radiantEfficiency,
  targetNightTempF: defaultClimateControl.radiant.targetNightTempF,
  targetDayTempF: defaultClimateControl.radiant.targetDayTempF,
  rootZoneHeatingEnabled: defaultClimateControl.radiant.rootZoneHeatingEnabled,
  rootZoneTargetTempF: defaultClimateControl.radiant.rootZoneTargetTempF,
  thermalScreenEnabled: defaultClimateControl.radiant.thermalScreenEnabled,
  thermalScreenNightUValue: defaultClimateControl.radiant.thermalScreenNightUValue,
  cultivationPhase: "midFlower",
  cyclesPerYear: 3,
  cropStartDayOfYear: 100, // April 10 — clone planted
  vegDays: 28,
  flowerDays: 56, // 8-week flower
  cultivarStretchFactor: 1.35, // hybrid default
  useIntegratedHeatPump: false,
  heatPumpCombinedCOP: 3.5,
  evapCoolingEnabled: defaultClimateControl.evap.evapCoolingEnabled,
  evapEfficiencyPct: defaultClimateControl.evap.evapEfficiencyPct,
  indoorTargetDryBulbF: defaultClimateControl.evap.indoorTargetDryBulbF,
  mechanicalCoolingEnabled: defaultClimateControl.cooling.mechanicalCoolingEnabled,
  envelopeUValueBTUhrFtF: defaultClimateControl.cooling.envelopeUValueBTUhrFtF,
  equipmentKW: defaultClimateControl.cooling.equipmentKW,
  ventilationCFM: defaultClimateControl.cooling.ventilationCFM,
  ventilationDeltaTempF: defaultClimateControl.cooling.ventilationDeltaTempF,
  dehumidificationEnabled: defaultClimateControl.dehumid.dehumidificationEnabled,
  plantDensity: defaultClimateControl.dehumid.plantDensity,
  plantTranspirationGalPerDayPer1000SqFt:
    defaultClimateControl.dehumid.plantTranspirationGalPerDayPer1000SqFt,
  irrigationRateGalDay: defaultClimateControl.dehumid.irrigationRateGalDay,
  runoffPct: defaultClimateControl.dehumid.runoffPct,
  dehumidifierEfficiencyPintsPerKwh:
    defaultClimateControl.dehumid.dehumidifierEfficiencyPintsPerKwh,
  ventilationMoistureRemovalGalDay:
    defaultClimateControl.dehumid.ventilationMoistureRemovalGalDay,
  targetRHPct: defaultClimateControl.dehumid.targetRHPct,
  leafTempOffsetC: defaultVPDTargets.leafTempOffsetC,
  electricityRatePerKwh: defaultEconomics.electricityRatePerKwh,
  serviceVoltagePrimary: defaultElectricalService.serviceVoltages[1] ?? 240,
  serviceVoltageSecondary: defaultElectricalService.serviceVoltages[0] ?? 120,
  branchCircuitAmps: defaultElectricalService.branchCircuitAmps,
  servicePowerFactor: defaultElectricalService.powerFactor,
};

export interface ClimateState {
  data: MonthlyClimate[];
  source: "fallback" | "nasa-power" | "open-meteo";
  status: "idle" | "loading" | "ok" | "error";
  message: string;
  retrievedAt: string;
}

interface ScenarioContextValue {
  inputs: ScenarioInputs;
  setInputs: (next: Partial<ScenarioInputs>) => void;
  reset: () => void;
  climate: ClimateState;
  refreshClimate: (provider: "nasa-power" | "open-meteo" | "fallback") => Promise<void>;
  customFixtures: FixtureSpec[];
  addCustomFixture: (f: FixtureSpec) => void;
  removeCustomFixture: (id: string) => void;
}

const Ctx = createContext<ScenarioContextValue | null>(null);

function loadCustomFixtures(): FixtureSpec[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_FIXTURE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FixtureSpec[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomFixtures(list: FixtureSpec[]) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(CUSTOM_FIXTURE_KEY, JSON.stringify(list));
  } catch {
    /* localStorage may be unavailable; silently ignore */
  }
}

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputsState] = useState<ScenarioInputs>(defaultScenario);
  const [customFixtures, setCustomFixtures] = useState<FixtureSpec[]>(() =>
    loadCustomFixtures(),
  );
  const [climate, setClimate] = useState<ClimateState>({
    data: fallbackMontgomeryClimate,
    source: "fallback",
    status: "ok",
    message: "Using built-in fallback climate normals.",
    retrievedAt: new Date().toISOString(),
  });

  const addCustomFixture = useCallback((f: FixtureSpec) => {
    setCustomFixtures((prev) => {
      const next = [...prev.filter((x) => x.id !== f.id), f];
      saveCustomFixtures(next);
      return next;
    });
  }, []);

  const removeCustomFixture = useCallback((id: string) => {
    setCustomFixtures((prev) => {
      const next = prev.filter((x) => x.id !== id);
      saveCustomFixtures(next);
      return next;
    });
  }, []);

  const setInputs = useCallback((next: Partial<ScenarioInputs>) => {
    setInputsState((prev) => {
      const merged = { ...prev, ...next };
      // If any exterior dimension changed, re-derive area + envelope + volume
      const dimKeys = [
        "greenhouseLengthFt",
        "greenhouseWidthFt",
        "eaveHeightFt",
        "peakHeightFt",
      ];
      const dimChanged = dimKeys.some((k) => k in next);
      if (dimChanged) {
        const d = geometryFromDims(
          merged.greenhouseLengthFt,
          merged.greenhouseWidthFt,
          merged.eaveHeightFt,
          merged.peakHeightFt,
        );
        merged.greenhouseFloorAreaSqFt = Math.round(d.floor);
        merged.greenhouseEnvelopeAreaSqFt = Math.round(d.envelope);
        merged.greenhouseVolumeCuFt = Math.round(d.volume);
      }
      return merged;
    });
  }, []);

  const reset = useCallback(() => setInputsState(defaultScenario), []);

  const refreshClimate = useCallback(
    async (provider: "nasa-power" | "open-meteo" | "fallback") => {
      if (provider === "fallback") {
        setClimate({
          data: fallbackMontgomeryClimate,
          source: "fallback",
          status: "ok",
          message: "Using built-in fallback climate normals.",
          retrievedAt: new Date().toISOString(),
        });
        return;
      }
      setClimate((c) => ({ ...c, status: "loading", message: `Loading from ${provider}…` }));
      try {
        const data =
          provider === "nasa-power"
            ? await fetchNasaPowerMonthly(inputs.latitude, inputs.longitude)
            : await fetchOpenMeteoMonthly(
                inputs.latitude,
                inputs.longitude,
                new Date().getFullYear() - 11,
                new Date().getFullYear() - 1,
              );
        setClimate({
          data,
          source: provider,
          status: "ok",
          message: `Loaded ${data.length} months from ${provider}.`,
          retrievedAt: new Date().toISOString(),
        });
      } catch (err) {
        setClimate({
          data: fallbackMontgomeryClimate,
          source: "fallback",
          status: "error",
          message: `Failed to load from ${provider}: ${(err as Error).message}. Falling back.`,
          retrievedAt: new Date().toISOString(),
        });
      }
    },
    [inputs.latitude, inputs.longitude],
  );

  // Try NASA POWER once on mount; silently fall back if it fails.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await fetchNasaPowerMonthly(inputs.latitude, inputs.longitude);
        if (!cancelled)
          setClimate({
            data,
            source: "nasa-power",
            status: "ok",
            message: `Loaded ${data.length} months from NASA POWER.`,
            retrievedAt: new Date().toISOString(),
          });
      } catch {
        // keep fallback
      }
    })();
    return () => {
      cancelled = true;
    };
    // intentionally one-shot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      inputs,
      setInputs,
      reset,
      climate,
      refreshClimate,
      customFixtures,
      addCustomFixture,
      removeCustomFixture,
    }),
    [
      inputs,
      setInputs,
      reset,
      climate,
      refreshClimate,
      customFixtures,
      addCustomFixture,
      removeCustomFixture,
    ],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useScenario() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useScenario must be used within ScenarioProvider");
  return v;
}
