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
import type { YieldRealismCase } from "../data/yieldRealism";
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
import {
  decodeScenarioFromHash,
  writeShareHash,
} from "../utils/scenarioUrl";

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

  // Blackout / light-deprivation system
  blackoutEnabled: boolean;
  /** "auto" follows the lights-on window; "scheduled" uses explicit close/open
   *  hours; "always" stays closed for fully artificial flowering; "off" is the
   *  same as blackoutEnabled=false but lets the user keep the system specified
   *  in the BOM while toggling behavior. */
  blackoutDeployMode: "auto" | "scheduled" | "always" | "off";
  /** Minutes before lights-off the curtain begins closing. Commercial systems
   *  use 15–30 min to ensure full closure before the photoperiod-critical
   *  moment. */
  blackoutPreCloseMin: number;
  /** Explicit close hour for "scheduled" deploy mode (0–24). */
  blackoutScheduledCloseHour: number;
  /** Explicit open hour for "scheduled" deploy mode (0–24). */
  blackoutScheduledOpenHour: number;
  /** Envelope U-value (BTU/hr·ft²·°F) when blackout is deployed. Acts as an
   *  additional thermal layer — typical commercial blackout fabric provides
   *  ~25–40 % heat-loss reduction (Ludvig Svensson Obscura B+W: 0.45;
   *  Tempest combined blackout+thermal: 0.30). Used in the energy balance. */
  blackoutClosedUValue: number;
  /** Fabric reference for the BOM (manufacturer + part). */
  blackoutFabricLabel: string;

  // Targets
  cropTargetId: keyof typeof cropTargets;
  /** Yield-realism planning scenario — scales the dialed-in projection. */
  yieldRealismCase: YieldRealismCase;

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
  /** Curtain track elevation above floor (ft). Per Svensson / Argus install
   *  practice, multiple curtains live on adjacent tracks separated by 6-12 in.
   *  Operator-configurable so the model can compare single- / double- / triple-
   *  screen layouts without changing the structural geometry. */
  thermalScreenElevationFt: number;
  shadeElevationFt: number;
  blackoutElevationFt: number;

  // Vent control — multi-input per Argus Titan
  /** Indoor RH (%) at which vents will open to dump moisture. Standard
   *  commercial setpoint 65–75%. */
  ventHumidityTargetPct: number;
  /** Dewpoint margin (°F) below which vents open pre-emptively to prevent
   *  condensation on canopy. Botrytis threshold ≈ 4°F (Punja, UMass). */
  ventDewpointMarginF: number;

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
  /** $/kW-month — utility peak-demand charge billed against the highest
   *  15-min average draw. Often rivals the energy charge on commercial
   *  cultivation accounts. */
  demandChargePerKwMonth: number;

  // Electrical service
  serviceVoltagePrimary: number; // 120 or 240, primary branch voltage
  serviceVoltageSecondary: number; // typically the other available voltage
  branchCircuitAmps: number; // 20 typical for general, 30 for dedicated 240
  servicePowerFactor: number; // assumed PF for amperage calc when fixture doesn't provide one
}

// Auto-derive area + envelope + volume from exterior dimensions.
// Codex P0: guard against peak < eave + epsilon so the gable formulas don't
// produce negative areas or volumes when the user types nonsense values.
function geometryFromDims(
  length: number,
  width: number,
  eave: number,
  peakRaw: number,
) {
  // Enforce peak ≥ eave + 1 ft. Below that, the structure isn't a ridge roof
  // any more — collapse to a flat-roofed shape rather than producing negative
  // gable area or imaginary slope length.
  const peak = Math.max(peakRaw, eave + 1);
  const rise = peak - eave;
  const slopeLen = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(rise, 2));
  const sidewalls = 2 * length * eave;
  const endRectangles = 2 * width * eave;
  const endGables = 2 * (0.5 * width * rise);
  const roofSlopes = 2 * length * slopeLen;
  const envelope = sidewalls + endRectangles + endGables + roofSlopes;
  const floor = length * width;
  const volume = floor * eave + 0.5 * width * rise * length;
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
  yieldRealismCase: "base",
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
  thermalScreenElevationFt: defaultClimateControl.curtainLayers.thermalScreenElevationFt,
  shadeElevationFt: defaultClimateControl.curtainLayers.shadeElevationFt,
  blackoutElevationFt: defaultClimateControl.curtainLayers.blackoutElevationFt,
  ventHumidityTargetPct: defaultClimateControl.ventControl.ventHumidityTargetPct,
  ventDewpointMarginF: defaultClimateControl.ventControl.ventDewpointMarginF,
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
  demandChargePerKwMonth: defaultEconomics.demandChargePerKwMonth,
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

/**
 * Hydrate from a `#s=...` share URL fragment if present. Runs once at
 * provider mount. Each share link encodes only the delta vs defaults,
 * so we layer it onto `defaultScenario` and let `setInputs` re-derive
 * geometry/envelope/volume downstream.
 */
function initialScenarioFromHashOrDefault(): ScenarioInputs {
  if (typeof window === "undefined") return defaultScenario;
  const patch = decodeScenarioFromHash(window.location.hash);
  if (!patch) return defaultScenario;
  return { ...defaultScenario, ...patch } as ScenarioInputs;
}

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const [inputs, setInputsState] = useState<ScenarioInputs>(
    initialScenarioFromHashOrDefault,
  );
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
      // Defensive clamps on critical numeric inputs. Belt-and-suspenders
      // alongside NumberField's NaN-drop: any path that bypasses the field
      // (chatbot set_scenario tool, scenario presets, programmatic updates,
      // or future inputs) still gets safe values. Without these, a single
      // NaN or 0 propagates through Math.sqrt() and floods the 3D scene
      // with NaN positions — 100+ console errors, scene goes blank.
      const clampMin = (key: keyof ScenarioInputs, min: number) => {
        const v = merged[key] as number;
        if (!Number.isFinite(v) || v < min) {
          (merged as Record<string, unknown>)[key] = min;
        }
      };
      clampMin("greenhouseLengthFt", 8);
      clampMin("greenhouseWidthFt", 8);
      clampMin("eaveHeightFt", 6);
      clampMin("peakHeightFt", 7); // geometryFromDims further enforces > eave
      clampMin("canopyAreaSqFt", 50);
      clampMin("greenhouseFloorAreaSqFt", 50);
      clampMin("greenhouseEnvelopeAreaSqFt", 50);
      clampMin("greenhouseVolumeCuFt", 100);
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
        // Auto-scale canopy area with floor footprint so plants, fixtures,
        // and canopy all follow when the user resizes the greenhouse.
        // The fixture count downstream is derived from canopy area; plant
        // grid is derived from canopy dimensions — preserving the prior
        // canopy:floor ratio means the whole 3D scene rescales coherently.
        // Skip if the user is explicitly overriding canopyAreaSqFt this call.
        const lengthOrWidthChanged =
          "greenhouseLengthFt" in next || "greenhouseWidthFt" in next;
        if (
          lengthOrWidthChanged &&
          !("canopyAreaSqFt" in next) &&
          prev.greenhouseFloorAreaSqFt > 0
        ) {
          const ratio = d.floor / prev.greenhouseFloorAreaSqFt;
          merged.canopyAreaSqFt = Math.max(
            50,
            Math.round(prev.canopyAreaSqFt * ratio),
          );
        }
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

  // Keep the URL fragment in sync with scenario inputs so the page is
  // shareable at any moment. Debounced ~250 ms so a slider drag doesn't
  // flood replaceState. Uses replaceState (not pushState) — the back
  // button shouldn't iterate every input change.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = window.setTimeout(() => {
      writeShareHash(inputs);
    }, 250);
    return () => window.clearTimeout(t);
  }, [inputs]);

  // If the user pastes a different share URL into the address bar
  // mid-session and the browser fires `hashchange`, re-hydrate.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onHashChange = () => {
      const patch = decodeScenarioFromHash(window.location.hash);
      if (patch) setInputsState((prev) => ({ ...prev, ...patch }));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

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
