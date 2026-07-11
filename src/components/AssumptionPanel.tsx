import { useScenario } from "../context/ScenarioContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { cropTargets } from "../data/cropTargets";
import { yieldRealismCases, type YieldRealismCase } from "../data/yieldRealism";
import { netCanopyTransmissionPct } from "../models/solarModel";
import { fmtPct } from "../utils/formatting";
import { FieldGroup, NumberField, SelectField, ToggleField } from "./Field";
import { canopyUtilizationPct } from "../services/scenarioAdvisor";
import { solveBenchLayout } from "../models/benchLayout";
import CustomFixtureForm from "./CustomFixtureForm";
import { MONTH_NAMES } from "../utils/formatting";

const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i), label: m }));

export default function AssumptionPanel() {
  const { inputs, setInputs, climate, refreshClimate } = useScenario();
  const allFixtures = useAllFixtures();
  const transmission = netCanopyTransmissionPct(inputs.envelope);

  return (
    <aside className="flex h-full flex-col overflow-y-auto px-3 py-1">
      <details className="sidebar-section" open>
        <summary className="sidebar-section-header">
          <span className="sidebar-section-caret" aria-hidden>▸</span>
          <span className="sidebar-section-title">Site</span>
          <span className="sidebar-section-right">
            {/* Phase 2 visual-system cue: "Start here" pill is the
                onboarding signal for first-time visitors that this is
                where to drop their actual greenhouse's coordinates.
                Pairs with the existing coordinate-status warn tag —
                the start tag tells you to act, the warn tag tells you
                what's currently set. */}
            <span className="tag tag-start">Start here</span>
            <span className="tag tag-warn">{inputs.coordinateStatus}</span>
          </span>
        </summary>
        <div className="sidebar-section-body">
          <p className="text-[11px] leading-snug text-ink-500">
            Latitude / longitude drive solar geometry, day-length, and sun-angle calculations. They also feed the NASA POWER and Open-Meteo lookups. Override these directly — climate refresh always uses the values shown here.
          </p>
          <div className="kv">
            <span className="kv-label">Address</span>
            <span className="kv-value text-right">{inputs.siteAddress}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="Latitude"
              value={inputs.latitude}
              onChange={(n) => setInputs({ latitude: n })}
              step={0.0001}
              unit="°"
              hint="North positive, south negative. Drives day-length curve."
            />
            <NumberField
              label="Longitude"
              value={inputs.longitude}
              onChange={(n) => setInputs({ longitude: n })}
              step={0.0001}
              unit="°"
              hint="West negative. Used only for weather API lookup."
            />
            <NumberField
              label="Elevation"
              value={inputs.elevationFt}
              onChange={(n) => setInputs({ elevationFt: n })}
              unit="ft"
              hint="Above sea level. Affects atmospheric clarity at margins."
            />
            <div>
              <label className="field-label">Weather station name</label>
              <input
                type="text"
                value={inputs.weatherStation}
                onChange={(e) => setInputs({ weatherStation: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-ink-500">Label only — climate is fetched from APIs by lat/lon.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className={`tag ${climate.status === "ok" ? "tag-info" : "tag-warn"}`}>
              {climate.source}
            </span>
            <span className="text-[11px] text-ink-500">{climate.message}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn !px-2 !py-0.5 !text-[11px]"
              onClick={() => refreshClimate("nasa-power")}
            >
              NASA POWER
            </button>
            <button
              type="button"
              className="btn !px-2 !py-0.5 !text-[11px]"
              onClick={() => refreshClimate("open-meteo")}
            >
              Open-Meteo
            </button>
            <button
              type="button"
              className="btn !px-2 !py-0.5 !text-[11px]"
              onClick={() => refreshClimate("fallback")}
            >
              Fallback
            </button>
          </div>
        </div>
      </details>

      <FieldGroup
        title="Geometry · exterior dimensions"
        description={
          "Primary architectural inputs. LENGTH × WIDTH = floor footprint. " +
          "EAVE = sidewall height where roof slope starts. PEAK = ridge height. " +
          "Floor area, envelope area, and volume are auto-derived from these — change a dimension and they recompute. " +
          "CANOPY is the plant-touching area inside (typically smaller than floor)."
        }
      >
        <NumberField
          label="Length"
          value={inputs.greenhouseLengthFt}
          onChange={(n) => setInputs({ greenhouseLengthFt: n })}
          debounceMs={500}
          unit="ft"
          hint="Long-axis exterior length (gutter run direction). Suggested 16–300 ft for a single-zone commercial greenhouse."
        />
        <NumberField
          label="Width"
          value={inputs.greenhouseWidthFt}
          onChange={(n) => setInputs({ greenhouseWidthFt: n })}
          debounceMs={500}
          unit="ft"
          hint="Short-axis exterior width (eave-to-eave). Suggested 18–60 ft for a single bay; gutter-connect multi-bay houses exceed this."
        />
        <NumberField
          label="Eave height"
          value={inputs.eaveHeightFt}
          onChange={(n) => setInputs({ eaveHeightFt: n })}
          debounceMs={500}
          unit="ft"
          hint="Sidewall vertical height before roof slope. Suggested 8–18 ft (commercial high-bay range)."
        />
        <NumberField
          label="Peak height"
          value={inputs.peakHeightFt}
          onChange={(n) => setInputs({ peakHeightFt: n })}
          debounceMs={500}
          unit="ft"
          hint="Ridge / peak vertical height. Suggested 10–28 ft."
        />
        <NumberField
          label="Canopy area"
          value={inputs.canopyAreaSqFt}
          onChange={(n) => setInputs({ canopyAreaSqFt: n })}
          debounceMs={500}
          unit="ft²"
          disabled={inputs.benchLayout.enabled}
          hint={
            inputs.benchLayout.enabled
              ? "Derived from the bench layout below — disable benches to set canopy directly."
              : "Active flowering footprint — what fixtures sit over (typically smaller than floor)."
          }
        />
        <NumberField
          label="Canopy utilization"
          value={Math.round(
            canopyUtilizationPct(
              inputs.canopyAreaSqFt,
              inputs.greenhouseFloorAreaSqFt,
            ),
          )}
          onChange={(pct) => {
            if (inputs.greenhouseFloorAreaSqFt > 0) {
              setInputs({
                canopyAreaSqFt: Math.round(
                  (inputs.greenhouseFloorAreaSqFt * pct) / 100,
                ),
              });
            }
          }}
          debounceMs={500}
          min={1}
          max={100}
          unit="%"
          disabled={inputs.benchLayout.enabled}
          hint="Canopy as a share of floor. Rolling/movable benches reach ~90% (peninsular fixed >75%); below ~80% is aisle space rolling benches reclaim. Setting this resizes canopy to match."
        />
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-2 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-ink-500">Auto-derived</div>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono tabular-nums text-ink-900">
            <span className="text-ink-500">Floor</span>
            <span className="text-right">{inputs.greenhouseFloorAreaSqFt.toLocaleString()} ft²</span>
            <span className="text-ink-500">Envelope</span>
            <span className="text-right">{inputs.greenhouseEnvelopeAreaSqFt.toLocaleString()} ft²</span>
            <span className="text-ink-500">Volume</span>
            <span className="text-right">{inputs.greenhouseVolumeCuFt.toLocaleString()} ft³</span>
          </div>
        </div>
      </FieldGroup>

      <FieldGroup
        title="Benches · optional"
        description={
          "When on, canopy is DERIVED from the bench packing (not the typed canopy). " +
          "Rolling benches share ONE movable aisle for the whole block (up to ~90% floor use); " +
          "fixed benches need an aisle between every row (~50–67%). Shows in the top-down plan view."
        }
      >
        <ToggleField
          label="Use bench layout"
          value={inputs.benchLayout.enabled}
          onChange={(b) =>
            setInputs({ benchLayout: { ...inputs.benchLayout, enabled: b } })
          }
          hint="Off = open floor with a typed canopy area (default behavior)."
        />
        {inputs.benchLayout.enabled && (
          <>
            <SelectField
              label="Bench type"
              value={inputs.benchLayout.type}
              onChange={(v) =>
                setInputs({ benchLayout: { ...inputs.benchLayout, type: v } })
              }
              options={[
                { value: "rolling", label: "Rolling — one shared aisle" },
                { value: "fixed", label: "Fixed — aisle per row" },
              ]}
            />
            <NumberField
              label="Bench width"
              value={inputs.benchLayout.benchWidthFt}
              onChange={(n) =>
                setInputs({ benchLayout: { ...inputs.benchLayout, benchWidthFt: n } })
              }
              debounceMs={500}
              step={0.5}
              min={1}
              max={12}
              unit="ft"
              hint="Narrow dimension of one bench. Commercial rolling benches run 4–6 ft."
            />
            <NumberField
              label="Bench length"
              value={inputs.benchLayout.benchLengthFt}
              onChange={(n) =>
                setInputs({ benchLayout: { ...inputs.benchLayout, benchLengthFt: n } })
              }
              debounceMs={500}
              min={2}
              unit="ft"
              hint="Segment length along a row — rows run the house length."
            />
            <NumberField
              label="Aisle width"
              value={inputs.benchLayout.aisleWidthFt}
              onChange={(n) =>
                setInputs({ benchLayout: { ...inputs.benchLayout, aisleWidthFt: n } })
              }
              debounceMs={500}
              step={0.5}
              min={0.5}
              max={12}
              unit="ft"
              hint="Rolling: the single movable aisle. Fixed: aisle between every row."
            />
            <NumberField
              label="Perimeter clearance"
              value={inputs.benchLayout.perimeterFt}
              onChange={(n) =>
                setInputs({ benchLayout: { ...inputs.benchLayout, perimeterFt: n } })
              }
              debounceMs={500}
              step={0.5}
              min={0}
              max={20}
              unit="ft"
              hint="Clear space kept around the whole bench block (endwalls/sidewalls)."
            />
            {(() => {
              const b = solveBenchLayout(
                inputs.greenhouseLengthFt,
                inputs.greenhouseWidthFt,
                inputs.benchLayout,
              );
              return (
                <div className="rounded-lg border border-leaf-500/25 bg-leaf-50 p-2 text-xs">
                  <div className="text-[10px] uppercase tracking-wider text-leaf-600">
                    Bench-derived canopy
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono tabular-nums text-ink-900">
                    <span className="text-ink-500">Rows · benches</span>
                    <span className="text-right">
                      {b.rows} · {b.benchCount}
                    </span>
                    <span className="text-ink-500">Canopy</span>
                    <span className="text-right">{b.canopyAreaSqFt.toFixed(0)} ft²</span>
                    <span className="text-ink-500">Floor use</span>
                    <span className="text-right">{b.utilizationPct.toFixed(0)}%</span>
                  </div>
                  {b.rows === 0 && (
                    <p className="mt-1 text-[11px] text-warn-500">
                      Benches don't fit — reduce bench/aisle width or perimeter.
                    </p>
                  )}
                </div>
              );
            })()}
          </>
        )}
      </FieldGroup>

      <FieldGroup
        title={`Envelope transmission · net ${fmtPct(transmission)}`}
        description={
          "Light loss stacks multiplicatively from outdoor to canopy. " +
          "GLAZING TRANS. is the PAR transmission of the material itself — single poly ~80%, double poly ~70%, glass ~88%. " +
          "ROOF FACTOR is an additional reduction for roof shape, pitch, and condensation droplet scattering — separate from the glazing material spec. " +
          "STRUCTURE SHADE LOSS is light blocked by trusses, gutters, mullions (not the glazing). " +
          "DIRT/AGING and INTERNAL OBSTRUCTION are the soiling and the equipment hanging in the path."
        }
      >
        <NumberField
          label="Glazing light transmission"
          value={inputs.envelope.baseTransmissionPct}
          onChange={(n) =>
            setInputs({ envelope: { ...inputs.envelope, baseTransmissionPct: n } })
          }
          unit="%"
          hint="Material-only PAR transmission. Single poly ~80, glass ~88, double poly ~70."
        />
        <NumberField
          label="Roof shape & condensation loss"
          value={inputs.envelope.roofTransmissionPct}
          onChange={(n) =>
            setInputs({ envelope: { ...inputs.envelope, roofTransmissionPct: n } })
          }
          unit="%"
          hint="Geometry & condensation factor on top of glazing material. Typical 88–95%."
        />
        <NumberField
          label="Structure shade loss"
          value={inputs.envelope.structureShadeLossPct}
          onChange={(n) =>
            setInputs({ envelope: { ...inputs.envelope, structureShadeLossPct: n } })
          }
          unit="%"
          hint="Trusses, gutters, mullions blocking sky. Typical 5–10%."
        />
        <NumberField
          label="Dirt/aging loss"
          value={inputs.envelope.dirtAgingLossPct}
          onChange={(n) =>
            setInputs({ envelope: { ...inputs.envelope, dirtAgingLossPct: n } })
          }
          unit="%"
          hint="Soiling & material yellowing. Typical 5–8% for aged glazing."
        />
        <NumberField
          label="Equipment shading"
          value={inputs.envelope.internalObstructionLossPct}
          onChange={(n) =>
            setInputs({ envelope: { ...inputs.envelope, internalObstructionLossPct: n } })
          }
          unit="%"
          hint="Hangers, pipes, equipment shading canopy. 3–8% typical."
        />
        <NumberField
          label="Sunlight-to-PAR factor"
          value={inputs.solarToPARFactor}
          onChange={(n) => setInputs({ solarToPARFactor: n })}
          step={0.05}
          unit="mol/kWh"
          hint="Broadband shortwave→PAR conversion. Range 6.8–8.0; 7.35 is the textbook clear-sky value."
        />
      </FieldGroup>

      <FieldGroup
        title="Photoperiod & DLI target"
        description={
          "DLI is integrated photons per square meter per day. " +
          "PHOTOPERIOD is the lights-on duration during flower (cannabis flips at 12h). " +
          "WINDOW START/END is when overhead lighting actually runs on the clock — used to align supplemental light with the flowering window vs the natural day. " +
          "BLACKOUT pulls curtains to enforce 12h darkness during long summer days."
        }
      >
        <SelectField
          label="Crop stage"
          value={inputs.cropStage}
          onChange={(v) => setInputs({ cropStage: v })}
          options={[
            { value: "veg", label: "Veg" },
            { value: "earlyFlower", label: "Early flower" },
            { value: "midFlower", label: "Mid flower" },
            { value: "lateFlower", label: "Late flower" },
          ]}
          hint="Drives VPD targets and humidity-risk thresholds."
        />
        <SelectField
          label="Light target"
          value={inputs.cropTargetId}
          onChange={(v) => setInputs({ cropTargetId: v as keyof typeof cropTargets })}
          options={Object.values(cropTargets).map((t) => ({
            value: t.id,
            label: `${t.label} · ${t.targetDLI} DLI`,
          }))}
          hint={
            cropTargets[inputs.cropTargetId]?.description ??
            "The canopy light level the model sizes lighting toward."
          }
        />
        <NumberField
          label="Photoperiod"
          value={inputs.flowerPhotoperiodHours}
          onChange={(n) => setInputs({ flowerPhotoperiodHours: n })}
          unit="hr"
          hint="Lights-on duration. Cannabis flowers at 12h."
        />
        <NumberField
          label="Window start"
          value={inputs.flowerWindowStartHr}
          onChange={(n) => setInputs({ flowerWindowStartHr: n })}
          unit="hr"
          hint="Clock hour overhead lights turn on. 0–24."
        />
        <NumberField
          label="Window end"
          value={inputs.flowerWindowEndHr}
          onChange={(n) => setInputs({ flowerWindowEndHr: n })}
          unit="hr"
          hint="Clock hour overhead lights turn off."
        />
        <ToggleField
          label="Blackout curtains"
          value={inputs.blackoutEnabled}
          onChange={(b) => setInputs({ blackoutEnabled: b })}
          hint="Light-deprivation system — opaque pulldown curtains that seal the canopy during the dark phase. REQUIRED for flowering cannabis outside the natural 12-hr-dark season; even brief light leak (sun, street, full moon) can revert flowering plants to veg. Commercial spec: <0.05% PAR transmission (Ludvig Svensson Obscura / SLS Tempest)."
        />
        {inputs.blackoutEnabled && (
          <>
            <SelectField
              label="Deploy mode"
              value={inputs.blackoutDeployMode}
              onChange={(v) =>
                setInputs({
                  blackoutDeployMode: v as
                    | "auto"
                    | "scheduled"
                    | "always"
                    | "off",
                })
              }
              options={[
                { value: "auto", label: "Auto — follow lights window" },
                { value: "scheduled", label: "Scheduled — explicit hours" },
                { value: "always", label: "Always closed (sealed mode)" },
                { value: "off", label: "Disabled (override)" },
              ]}
              hint="Auto closes the curtain just before lights-off and reopens at lights-on. Scheduled lets you decouple curtain timing from the lights window (e.g. midday light-dep flips). Always-closed is fully artificial flowering."
            />
            <NumberField
              label="Pre-close lead"
              value={inputs.blackoutPreCloseMin}
              onChange={(n) => setInputs({ blackoutPreCloseMin: n })}
              unit="min"
              hint="Minutes before close hour the curtain begins traversing. Commercial systems use 15–30 min to guarantee full closure before the photoperiod-critical moment."
            />
            {inputs.blackoutDeployMode === "scheduled" && (
              <>
                <NumberField
                  label="Scheduled close"
                  value={inputs.blackoutScheduledCloseHour}
                  onChange={(n) => setInputs({ blackoutScheduledCloseHour: n })}
                  unit="hr"
                  hint="Clock hour curtain closes (scheduled mode only)."
                />
                <NumberField
                  label="Scheduled open"
                  value={inputs.blackoutScheduledOpenHour}
                  onChange={(n) => setInputs({ blackoutScheduledOpenHour: n })}
                  unit="hr"
                  hint="Clock hour curtain opens (scheduled mode only)."
                />
              </>
            )}
            <NumberField
              label="Curtain-closed U-value"
              value={inputs.blackoutClosedUValue}
              onChange={(n) => setInputs({ blackoutClosedUValue: n })}
              unit="BTU/hr·ft²·°F"
              step={0.05}
              hint="Envelope U when curtain deployed. Obscura B+W ≈ 0.45; Tempest combined blackout+thermal ≈ 0.30. Acts as an additional thermal layer — drops cooling/heating load when deployed."
            />
          </>
        )}
      </FieldGroup>

      <FieldGroup
        title="Site electrical service"
        description={
          "What's actually available at the meter. Default profile is single-phase 120/240V (typical small ag service). Fixtures whose drivers require 208V+ cannot run on 120V branches; fixtures that need 277V+ can't run at all on single-phase service without a service upgrade. The model flags incompatibilities and computes amperage and circuit count at the available voltages."
        }
      >
        <NumberField
          label="Primary voltage"
          value={inputs.serviceVoltagePrimary}
          onChange={(n) => setInputs({ serviceVoltagePrimary: n })}
          unit="V"
          hint="Higher available voltage. 240 typical for residential / small ag service."
        />
        <NumberField
          label="Secondary voltage"
          value={inputs.serviceVoltageSecondary}
          onChange={(n) => setInputs({ serviceVoltageSecondary: n })}
          unit="V"
          hint="Lower available voltage. 120 for single-phase residential service."
        />
        <NumberField
          label="Branch circuit"
          value={inputs.branchCircuitAmps}
          onChange={(n) => setInputs({ branchCircuitAmps: n })}
          unit="A"
          hint="Per-circuit breaker rating. 20A typical general, 30A typical dedicated 240V."
        />
        <NumberField
          label="Power factor"
          value={inputs.servicePowerFactor}
          onChange={(n) => setInputs({ servicePowerFactor: n })}
          step={0.01}
          unit="0–1"
          hint="LED drivers 0.93–0.98, HPS magnetic 0.85–0.92. Used in I = P / (V·PF)."
        />
      </FieldGroup>

      <FieldGroup
        title="Overhead lighting"
        description={
          "Pick from generic presets, named-vendor reference fixtures, or custom fixtures you've added. " +
          "PPE is fixture efficacy in µmol photons per joule of input electricity — higher = more light per dollar of electricity. " +
          "Watts/fixture comes from the unit-level driver spec; the model derives total fixture count from required photon flux."
        }
      >
        <SelectField
          label="Fixture"
          value={inputs.fixtureId}
          onChange={(v) => setInputs({ fixtureId: v })}
          options={Object.values(allFixtures).map((f) => {
            const tag =
              f.source === "vendor-verified"
                ? " ✓ verified"
                : f.source === "custom"
                  ? " (custom)"
                  : "";
            return {
              value: f.id,
              label: `${f.label} · ${f.ppe} µmol/J${tag}`,
            };
          })}
          hint="Preset (generic), vendor-verified (live datasheet), or custom-entered."
        />
        <NumberField
          label="Electricity rate"
          value={inputs.electricityRatePerKwh}
          onChange={(n) => setInputs({ electricityRatePerKwh: n })}
          step={0.01}
          unit="$/kWh"
          hint="All-in delivered rate including demand charges, if known."
        />
      </FieldGroup>

      <CustomFixtureForm />

      <FieldGroup
        title="Under-canopy lighting"
        description={
          "Real photon flux delivered to lower bud sites and side branches. " +
          "PPFD here is the intensity at the lit lower-canopy zone (typical 100–200 µmol/m²/s). " +
          "COVERAGE is the fraction of canopy footprint the under-canopy bars actually illuminate. " +
          "Under-canopy adds whole-plant photon delivery — but does NOT reduce overhead PPFD requirements at the apex."
        }
      >
        <ToggleField
          label="Enabled"
          value={inputs.underCanopyEnabled}
          onChange={(b) => setInputs({ underCanopyEnabled: b })}
        />
        <NumberField
          label="Under-canopy PPFD"
          value={inputs.underCanopyPPFD}
          onChange={(n) => setInputs({ underCanopyPPFD: n })}
          unit="µmol/m²/s"
          hint="Intensity at lower-canopy zone. 100–200 typical."
        />
        <NumberField
          label="Under-canopy coverage"
          value={inputs.underCanopyCoveragePct}
          onChange={(n) => setInputs({ underCanopyCoveragePct: n })}
          unit="%"
          hint="Fraction of canopy footprint actually lit by UC bars."
        />
        <NumberField
          label="Under-canopy efficacy"
          value={inputs.underCanopyPPE}
          onChange={(n) => setInputs({ underCanopyPPE: n })}
          step={0.05}
          unit="µmol/J"
          hint="Under-canopy fixture efficacy. Modern bars 2.4–2.8."
        />
        <NumberField
          label="Under-canopy hours"
          value={inputs.underCanopyPhotoperiodHours}
          onChange={(n) => setInputs({ underCanopyPhotoperiodHours: n })}
          unit="hr"
          hint="Hours UC bars run during flower window."
        />
        <NumberField
          label="Heat to canopy"
          value={inputs.underCanopyHeatFractionToCanopyZone}
          onChange={(n) => setInputs({ underCanopyHeatFractionToCanopyZone: n })}
          step={0.05}
          unit="0–1"
          hint="Fraction of UC waste heat that lands in the plant zone."
        />
      </FieldGroup>

      <FieldGroup
        title="CO₂ enrichment"
        description={
          "CO₂ shifts the operating envelope — it does not magically raise yield. " +
          "Higher SETPOINT supports higher DLI without diminishing returns, but only if VENTILATION is low enough that you're not blowing the gas out of the building. " +
          "CONTROL MODE is the operator's intent; the model uses ventilation mode to decide if CO₂ is feasible right now."
        }
      >
        <ToggleField
          label="Enabled"
          value={inputs.co2Enabled}
          onChange={(b) => setInputs({ co2Enabled: b })}
        />
        <NumberField
          label="CO₂ setpoint"
          value={inputs.co2SetpointPpm}
          onChange={(n) => setInputs({ co2SetpointPpm: n })}
          unit="ppm"
          hint="Ambient ~420. Enriched 900–1200. Aggressive 1200–1500."
        />
        <SelectField
          label="Control mode"
          value={inputs.co2ControlMode}
          onChange={(v) => setInputs({ co2ControlMode: v })}
          options={[
            { value: "ambient", label: "Ambient" },
            { value: "enriched", label: "Enriched" },
            { value: "sealed_or_semi_sealed", label: "Sealed / semi-sealed" },
          ]}
          hint="Operator strategy. Sealed = mechanical climate, no ventilation."
        />
        <SelectField
          label="Ventilation"
          value={inputs.ventilationMode}
          onChange={(v) => setInputs({ ventilationMode: v })}
          options={[
            { value: "open_vented", label: "Open vented" },
            { value: "moderate", label: "Moderate" },
            { value: "low", label: "Low" },
            { value: "semi_sealed", label: "Semi-sealed" },
            { value: "sealed", label: "Sealed" },
          ]}
          hint="Actual airflow regime. Open ventilation defeats CO₂ enrichment."
        />
      </FieldGroup>

      <FieldGroup
        title="Shade cloth / curtain"
        description={
          "Shade is a control system, not just light loss. " +
          "TRANSMISSION is the fraction of incoming light that passes through — 70% means 30% shade cloth. " +
          "DEPLOY MODE controls when it's actually pulled: SEASONAL = fixed months, TEMP/RADIATION TRIGGER = closed only when needed. " +
          "Shade reduces both solar heat gain and natural DLI, so the model shows the cooling vs supplemental-light tradeoff."
        }
      >
        <ToggleField
          label="Enabled"
          value={inputs.shadeEnabled}
          onChange={(b) => setInputs({ shadeEnabled: b })}
        />
        <NumberField
          label="Shade transmission"
          value={inputs.shadeTransmissionPct}
          onChange={(n) => setInputs({ shadeTransmissionPct: n })}
          unit="%"
          hint="70 = 30% shade cloth. 50 = 50% shade. Lower = more shading."
        />
        <SelectField
          label="Deploy mode"
          value={inputs.shadeDeployMode}
          onChange={(v) => setInputs({ shadeDeployMode: v })}
          options={[
            { value: "manual", label: "Manual" },
            { value: "seasonal", label: "Seasonal months" },
            { value: "temperature_trigger", label: "Temp trigger" },
            { value: "radiation_trigger", label: "Radiation trigger" },
          ]}
          hint="When the shade is actually pulled."
        />
        <SelectField
          label="Start month"
          value={String(inputs.shadeStartMonth)}
          onChange={(v) => setInputs({ shadeStartMonth: parseInt(v, 10) })}
          options={monthOptions}
          hint="Used in seasonal mode."
        />
        <SelectField
          label="End month"
          value={String(inputs.shadeEndMonth)}
          onChange={(v) => setInputs({ shadeEndMonth: parseInt(v, 10) })}
          options={monthOptions}
          hint="Used in seasonal mode."
        />
      </FieldGroup>

      <FieldGroup
        title="Cultivation phase & cycles"
        description={
          "Driving the crop-steering, pathogen, and yield models. Phase determines target VPD/temp/RH bands and pathogen vulnerability. Cycles per year sets annual yield aggregation (greenhouse 2–3 typical, indoor 4–5)."
        }
      >
        <SelectField
          label="Cultivation phase"
          value={inputs.cultivationPhase}
          onChange={(v) => setInputs({ cultivationPhase: v })}
          options={[
            { value: "vegetative", label: "Vegetative" },
            { value: "earlyFlower", label: "Early flower" },
            { value: "midFlower", label: "Mid flower" },
            { value: "lateFlower", label: "Late flower" },
          ]}
          hint="Mid-flower default for cannabis sizing math"
        />
        <NumberField
          label="Cycles / year"
          value={inputs.cyclesPerYear}
          onChange={(n) => setInputs({ cyclesPerYear: n })}
          step={0.5}
          unit="cycles"
          hint="Greenhouse 2–3, indoor sealed 4–5"
        />
        <NumberField
          label="Plant density"
          value={inputs.plantsPerSqFt}
          onChange={(n) => setInputs({ plantsPerSqFt: n })}
          step={0.05}
          unit="plants/ft²"
          hint="Commercial standard 0.65–1.0 plants/ft² (Cannabis Industry Institute via Greenhouse Grower; Royal Queen Seeds / Premium Cultivars). Sea-of-Green pushes 2–4 with shorter veg + smaller plants. Bugbee-style density studies (2-gal pots, 0.5 ft²/plant) maximize biomass per area but increase pathogen risk."
        />
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-2 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-ink-500">
            Auto-derived
          </div>
          <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono tabular-nums text-ink-900">
            <span className="text-ink-500">Total plants</span>
            <span className="text-right">
              {Math.round(inputs.canopyAreaSqFt * inputs.plantsPerSqFt).toLocaleString()}
            </span>
            <span className="text-ink-500">Plants / cycle</span>
            <span className="text-right">
              {Math.round(inputs.canopyAreaSqFt * inputs.plantsPerSqFt).toLocaleString()}
            </span>
            <span className="text-ink-500">Plants / yr</span>
            <span className="text-right">
              {Math.round(inputs.canopyAreaSqFt * inputs.plantsPerSqFt * inputs.cyclesPerYear).toLocaleString()}
            </span>
          </div>
        </div>
        <SelectField
          label="Yield realism"
          value={inputs.yieldRealismCase}
          onChange={(v) =>
            setInputs({ yieldRealismCase: v as YieldRealismCase })
          }
          options={Object.values(yieldRealismCases).map((c) => ({
            value: c.id,
            label: c.label,
          }))}
          hint={
            yieldRealismCases[inputs.yieldRealismCase]?.description ??
            "Scales the yield projection from the model's dialed-in ceiling to a realistic planning scenario."
          }
        />
      </FieldGroup>

      <FieldGroup
        title="Heating & cooling"
        description={
          "RADIANT HEAT covers winter night setpoints. EVAP COOLING is wet-bulb-limited — when outdoor dew point is high it stops working. " +
          "INDOOR TARGET is the dry-bulb you're sizing cooling toward. " +
          "ENVELOPE U-VALUE is heat loss per ft² of skin per °F delta — single poly ~1.1, double poly ~0.7, single glass ~1.0. " +
          "THERMAL SCREEN is a deployable energy curtain that cuts overnight heat loss by 30–50% in northern climates (Wageningen)."
        }
      >
        <ToggleField
          label="Radiant heat"
          value={inputs.radiantHeatingEnabled}
          onChange={(b) => setInputs({ radiantHeatingEnabled: b })}
        />
        <NumberField
          label="Radiant capacity"
          value={inputs.radiantHeatingCapacityBTUhr}
          onChange={(n) => setInputs({ radiantHeatingCapacityBTUhr: n })}
          unit="BTU/hr"
          hint="Installed boiler / hot-water heating output capacity."
        />
        <ToggleField
          label="Evap cooling"
          value={inputs.evapCoolingEnabled}
          onChange={(b) => setInputs({ evapCoolingEnabled: b })}
        />
        <NumberField
          label="Evap efficiency"
          value={inputs.evapEfficiencyPct}
          onChange={(n) => setInputs({ evapEfficiencyPct: n })}
          unit="%"
          hint="Pad media efficiency. New pads 75–80, aged 60–70."
        />
        <NumberField
          label="Indoor target temp"
          value={inputs.indoorTargetDryBulbF}
          onChange={(n) => setInputs({ indoorTargetDryBulbF: n })}
          unit="°F"
          hint="Day setpoint. Cannabis flower 75–82°F typical."
        />
        <NumberField
          label="Envelope U-value"
          value={inputs.envelopeUValueBTUhrFtF}
          onChange={(n) => setInputs({ envelopeUValueBTUhrFtF: n })}
          step={0.05}
          unit="BTU/hr·ft²·°F"
          hint="Single poly 1.1, double poly 0.7, single glass 1.0."
        />
        <NumberField
          label="Equipment heat"
          value={inputs.equipmentKW}
          onChange={(n) => setInputs({ equipmentKW: n })}
          step={0.1}
          unit="kW"
          hint="Pumps, fans, dehumidifiers, controllers — non-lighting electrical."
        />
        <NumberField
          label="Night setpoint"
          value={inputs.targetNightTempF}
          onChange={(n) => setInputs({ targetNightTempF: n })}
          unit="°F"
          hint="Generative phase wants 65–68°F nights for 5–8°F day/night swing"
        />
        <NumberField
          label="Leaf temp offset"
          value={inputs.leafTempOffsetC}
          onChange={(n) => setInputs({ leafTempOffsetC: n })}
          step={0.5}
          unit="°C"
          hint="Leaf temp vs air. Negative = leaves cooler (typical −1 to −3°C with transpiration)."
        />
        <ToggleField
          label="Thermal screen"
          value={inputs.thermalScreenEnabled}
          onChange={(b) => setInputs({ thermalScreenEnabled: b })}
          hint="Energy curtain deployed at night; cuts envelope U by ~40%"
        />
        <NumberField
          label="Thermal-screen U-value"
          value={inputs.thermalScreenNightUValue}
          onChange={(n) => setInputs({ thermalScreenNightUValue: n })}
          step={0.05}
          unit="BTU/hr·ft²·°F"
          hint="Effective U with screen closed. 0.55–0.70 typical."
        />
        <ToggleField
          label="Heat pump (integrated)"
          value={inputs.useIntegratedHeatPump}
          onChange={(b) => setInputs({ useIntegratedHeatPump: b })}
          hint="Hot-gas reheat DX, combined cooling+dehum COP 3–4"
        />
        <NumberField
          label="Heat-pump COP"
          value={inputs.heatPumpCombinedCOP}
          onChange={(n) => setInputs({ heatPumpCombinedCOP: n })}
          step={0.1}
          unit="COP"
          hint="Cooling+dehum COP. Mid-tier 3.0, premium 4.0"
        />
      </FieldGroup>

      <FieldGroup
        title="Dehumidification"
        description={
          "Cannabis flower sets a target RH around 50–60%. The model estimates how much water you have to remove daily and how much electricity that takes. " +
          "TRANSP. RATE is the canopy water release into greenhouse air. " +
          "DEHUM. EFF. is fixture pints removed per kWh — basic units 4–5, condensing/desiccant 7–12+."
        }
      >
        <ToggleField
          label="Enabled"
          value={inputs.dehumidificationEnabled}
          onChange={(b) => setInputs({ dehumidificationEnabled: b })}
        />
        <NumberField
          label="Plant transpiration"
          value={inputs.plantTranspirationGalPerDayPer1000SqFt}
          onChange={(n) => setInputs({ plantTranspirationGalPerDayPer1000SqFt: n })}
          unit="gal/day/1000ft²"
          hint="Canopy water released to air. Mid-flower 30–50 gal/day/1000ft²."
        />
        <NumberField
          label="Irrigation rate"
          value={inputs.irrigationRateGalDay}
          onChange={(n) => setInputs({ irrigationRateGalDay: n })}
          unit="gal/day"
          hint="Total irrigation delivered, before runoff."
        />
        <NumberField
          label="Runoff %"
          value={inputs.runoffPct}
          onChange={(n) => setInputs({ runoffPct: n })}
          unit="%"
          hint="Fraction of irrigation that drains; small portion evaporates from media."
        />
        <NumberField
          label="Dehumidifier efficiency"
          value={inputs.dehumidifierEfficiencyPintsPerKwh}
          onChange={(n) => setInputs({ dehumidifierEfficiencyPintsPerKwh: n })}
          step={0.5}
          unit="pints/kWh"
          hint="Basic units 4–5, mid-tier 6–8, premium condensing 10–12+."
        />
        <NumberField
          label="Vent moisture removal"
          value={inputs.ventilationMoistureRemovalGalDay}
          onChange={(n) => setInputs({ ventilationMoistureRemovalGalDay: n })}
          unit="gal/day"
          hint="Water carried out by ventilation. Drops by ~75% under CO₂ enrichment."
        />
      </FieldGroup>
    </aside>
  );
}
