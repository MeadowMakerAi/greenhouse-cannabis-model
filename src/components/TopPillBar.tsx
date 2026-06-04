import { useState } from "react";
import { useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";
import { useAllFixtures } from "../context/useAllFixtures";
import { cropTargets } from "../data/cropTargets";
import { dliToPPFD } from "../models/dliModel";
import { fmt1, fmtInt } from "../utils/formatting";
import { NumberField, SelectField, ToggleField } from "./Field";
import InputPill from "./InputPill";

/** Hemisphere-correct lat/lon formatter so European/Asian/Southern users
 *  see "° E" / "° S" instead of always "° W" / "° N". */
function fmtCoord(value: number, axis: "lat" | "lon"): string {
  const abs = Math.abs(value);
  const dir =
    axis === "lat"
      ? value >= 0
        ? "N"
        : "S"
      : value >= 0
        ? "E"
        : "W";
  return `${fmt1(abs)}° ${dir}`;
}

/**
 * Top pill bar — Phase 4 PR 1.
 *
 * Seven pills surface the inputs that get edited every session:
 * Location, Dimensions, Photoperiod & DLI, Fixture, CO₂, Climate,
 * Cycles. Each pill shows the current value and opens a popover for
 * fast editing.
 *
 * This bar is PURELY ADDITIVE in PR 1. The full AssumptionPanel
 * sidebar still exists with all 70 fields and 12 categories. The
 * pills are duplicate, fast-access front doors for the ~5–8 inputs
 * that account for ~80% of session edits.
 *
 * Validation hypothesis: if users immediately gravitate to the pills,
 * Phase 4 PR 2 (full Customize drawer + sidebar removal) ships.
 * If users keep going to the sidebar, we revert this pill bar and
 * ship a quick-start onboarding drawer instead.
 *
 * "Start here" badge surfaces on the Location pill — the canonical
 * first action for a first-time visitor (the same cue we already
 * shipped on the sidebar Site section in PR #5).
 */
/** Pill ids — used by the single-open coordinator below. */
type PillId =
  | "location"
  | "dimensions"
  | "light"
  | "fixture"
  | "co2"
  | "climate"
  | "cycles";

export interface TopPillBarProps {
  /** Open the Customize drawer (the long-tail editing surface that
   *  holds all 70+ fields). Wired by DashboardLayout in PR 2. */
  onCustomizeClick?: () => void;
}

export default function TopPillBar({ onCustomizeClick }: TopPillBarProps = {}) {
  const { inputs, setInputs, climate, refreshClimate } = useScenario();
  const d = useDerived();
  const allFixtures = useAllFixtures();

  // Single-open coordinator — only one popover can be open at a time.
  // Lifted from per-pill state so keyboard activation (Tab + Enter on a
  // second pill while the first is still open) closes the first
  // correctly. Mouse switching A→B used to "work" via the document-
  // level mousedown handler but keyboard had no equivalent.
  const [openPill, setOpenPill] = useState<PillId | null>(null);
  const toggle = (id: PillId) =>
    setOpenPill((current) => (current === id ? null : id));

  const activeFixture = d.fixture;

  // Build the cropTarget options once per render. The cropTargets
  // record is stable so this is cheap.
  const cropTargetOptions = Object.entries(cropTargets).map(
    ([key, val]) => ({
      value: key as keyof typeof cropTargets,
      label: `${val.label} · DLI ${val.targetDLI}`,
    }),
  );

  // Fixture options pull from useAllFixtures so custom-uploaded
  // fixtures (saved to localStorage via CustomFixtureForm) show up
  // alongside the built-in library — matches AssumptionPanel behavior.
  const fixtureOptions = Object.entries(allFixtures).map(([key, f]) => ({
    value: key,
    label: f.label,
  }));

  // Climate source options — refresh handler is wired below
  const climateLabel: Record<typeof climate.source, string> = {
    "nasa-power": "NASA POWER",
    "open-meteo": "Open-Meteo",
    fallback: "Local fallback",
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-ink-200/70 bg-paper-50/70 px-5 py-2.5"
      role="toolbar"
      aria-label="Quick-edit your scenario"
    >
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.10em] text-ink-500">
        Your scenario
      </span>

      {/* LOCATION — first-run starting point */}
      <InputPill
        id="location"
        isOpen={openPill === "location"}
        onToggle={() => toggle("location")}
        label="Location"
        value={`${fmtCoord(inputs.latitude, "lat")}, ${fmtCoord(inputs.longitude, "lon")}`}
        secondary={inputs.siteAddress}
        startHere
        popoverHint="Drives solar geometry + climate lookup. Override directly."
        popoverWidth={380}
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Latitude"
            value={inputs.latitude}
            onChange={(n) => setInputs({ latitude: n })}
            step={0.0001}
            unit="°"
          />
          <NumberField
            label="Longitude"
            value={inputs.longitude}
            onChange={(n) => setInputs({ longitude: n })}
            step={0.0001}
            unit="°"
          />
          <NumberField
            label="Elevation"
            value={inputs.elevationFt}
            onChange={(n) => setInputs({ elevationFt: n })}
            unit="ft"
          />
          <div>
            <label className="field-label">Site name</label>
            <input
              type="text"
              value={inputs.siteAddress}
              onChange={(e) => setInputs({ siteAddress: e.target.value })}
            />
          </div>
        </div>
        <p className="text-[11px] text-ink-500">
          Full site + climate provider settings live in the left sidebar
          under <span className="font-semibold text-ink-700">Site</span>.
        </p>
      </InputPill>

      {/* DIMENSIONS */}
      <InputPill
        id="dimensions"
        isOpen={openPill === "dimensions"}
        onToggle={() => toggle("dimensions")}
        label="Dimensions"
        value={`${fmtInt(inputs.greenhouseLengthFt)} × ${fmtInt(inputs.greenhouseWidthFt)} ft`}
        secondary={`${fmtInt(inputs.eaveHeightFt)} ft eave · ${fmtInt(inputs.canopyAreaSqFt)} ft² canopy`}
        popoverHint="Exterior footprint. Canopy area auto-scales unless overridden."
      >
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Length"
            value={inputs.greenhouseLengthFt}
            onChange={(n) => setInputs({ greenhouseLengthFt: n })}
            unit="ft"
            debounceMs={500}
          />
          <NumberField
            label="Width"
            value={inputs.greenhouseWidthFt}
            onChange={(n) => setInputs({ greenhouseWidthFt: n })}
            unit="ft"
            debounceMs={500}
          />
          <NumberField
            label="Eave"
            value={inputs.eaveHeightFt}
            onChange={(n) => setInputs({ eaveHeightFt: n })}
            unit="ft"
            debounceMs={500}
          />
          <NumberField
            label="Peak"
            value={inputs.peakHeightFt}
            onChange={(n) => setInputs({ peakHeightFt: n })}
            unit="ft"
            debounceMs={500}
          />
        </div>
        <NumberField
          label="Canopy area override"
          value={inputs.canopyAreaSqFt}
          onChange={(n) => setInputs({ canopyAreaSqFt: n })}
          unit="ft²"
          hint="Defaults to ~85% of floor. Set manually to override."
          debounceMs={500}
        />
      </InputPill>

      {/* PHOTOPERIOD & DLI */}
      <InputPill
        id="light"
        isOpen={openPill === "light"}
        onToggle={() => toggle("light")}
        label="Light target"
        value={`DLI ${d.target.targetDLI} · ${fmtInt(dliToPPFD(d.target.targetDLI, inputs.flowerPhotoperiodHours))} µmol/m²/s`}
        secondary={`${inputs.flowerPhotoperiodHours}h · ${cropTargets[inputs.cropTargetId]?.label ?? ""}`}
        popoverHint="DLI is the daily dose; PPFD is the intensity at canopy. Indoor growers think in PPFD; greenhouse growers in DLI. Both shown live."
        popoverWidth={400}
      >
        <SelectField
          label="Crop preset"
          value={inputs.cropTargetId as string}
          onChange={(v) => {
            // Switching preset clears any override so the preset DLI
            // takes effect immediately. If the operator wants the new
            // preset's DLI as a starting point for further tuning,
            // they'll see it populate and can then dial up/down.
            setInputs({
              cropTargetId: v as typeof inputs.cropTargetId,
              customTargetDLIOverride: null,
            });
          }}
          options={cropTargetOptions as { value: string; label: string }[]}
          hint="Each preset sets a default DLI; override below to dial exact."
        />
        <NumberField
          label="DLI target"
          value={d.target.targetDLI}
          onChange={(n) =>
            setInputs({ customTargetDLIOverride: Number.isFinite(n) ? n : null })
          }
          unit="mol/m²/d"
          min={5}
          max={80}
          step={1}
          hint={`At ${inputs.flowerPhotoperiodHours}h photoperiod = ${fmtInt(dliToPPFD(d.target.targetDLI, inputs.flowerPhotoperiodHours))} µmol/m²/s canopy PPFD.`}
        />
        <NumberField
          label="Flower photoperiod"
          value={inputs.flowerPhotoperiodHours}
          onChange={(n) => setInputs({ flowerPhotoperiodHours: n })}
          unit="hours/day"
          min={1}
          max={24}
          hint="Typical: 12h flower, 18h veg."
        />
        {inputs.customTargetDLIOverride !== null && (
          <div className="rounded-md border border-cta-400/30 bg-cta-50 px-2.5 py-1.5 text-[11px] text-cta-700">
            <span className="font-semibold">Custom DLI active.</span>{" "}
            Preset ({cropTargets[inputs.cropTargetId]?.label}) default was{" "}
            <span className="font-mono">
              {cropTargets[inputs.cropTargetId]?.targetDLI} mol/m²/d
            </span>{" "}
            ({fmtInt(dliToPPFD(cropTargets[inputs.cropTargetId]?.targetDLI ?? 0, inputs.flowerPhotoperiodHours))} µmol/m²/s).{" "}
            <button
              type="button"
              className="underline hover:text-cta-600"
              onClick={() => setInputs({ customTargetDLIOverride: null })}
            >
              Reset to preset
            </button>
          </div>
        )}
      </InputPill>

      {/* FIXTURE */}
      <InputPill
        id="fixture"
        isOpen={openPill === "fixture"}
        onToggle={() => toggle("fixture")}
        label="Fixture"
        value={activeFixture.label}
        secondary={`${fmtInt(activeFixture.wattsPerFixture)} W · ${fmt1(activeFixture.ppe)} µmol/J`}
        popoverHint="Active fixture used by the lighting + electrical model."
        popoverWidth={400}
      >
        <SelectField
          label="Active fixture"
          value={inputs.fixtureId as string}
          onChange={(v) =>
            setInputs({ fixtureId: v as typeof inputs.fixtureId })
          }
          options={fixtureOptions}
        />
        <p className="text-[11px] text-ink-500">
          Add custom fixtures (own spec sheet) via the sidebar
          <span className="font-semibold text-ink-700"> Overhead lighting </span>
          section.
        </p>
      </InputPill>

      {/* CO₂ */}
      <InputPill
        id="co2"
        isOpen={openPill === "co2"}
        onToggle={() => toggle("co2")}
        label="CO₂"
        value={
          inputs.co2Enabled
            ? `${fmtInt(inputs.co2SetpointPpm)} ppm`
            : "Off · ambient"
        }
        secondary={inputs.ventilationMode.replace(/_/g, " ")}
        popoverHint="Enrichment only works under sealed / semi-sealed ventilation."
      >
        <ToggleField
          label="CO₂ enrichment enabled"
          value={inputs.co2Enabled}
          onChange={(b) => setInputs({ co2Enabled: b })}
        />
        <NumberField
          label="Setpoint"
          value={inputs.co2SetpointPpm}
          onChange={(n) => setInputs({ co2SetpointPpm: n })}
          unit="ppm"
          min={350}
          max={2000}
          hint="Cannabis saturates near 1500 ppm. OSHA 5,000 ppm 8-hr TWA."
        />
        <SelectField
          label="Ventilation mode"
          value={inputs.ventilationMode}
          onChange={(v) =>
            setInputs({ ventilationMode: v as typeof inputs.ventilationMode })
          }
          options={[
            { value: "open_vented", label: "Open-vented (CO₂ infeasible)" },
            { value: "moderate", label: "Moderate (half benefit)" },
            { value: "low", label: "Low (sealed-ish)" },
            { value: "semi_sealed", label: "Semi-sealed" },
            { value: "sealed", label: "Sealed" },
          ]}
        />
      </InputPill>

      {/* CLIMATE */}
      <InputPill
        id="climate"
        isOpen={openPill === "climate"}
        onToggle={() => toggle("climate")}
        label="Climate"
        value={climateLabel[climate.source]}
        secondary={climate.status === "ok" ? `${climate.data.length} months loaded` : climate.message}
        popoverAlign="end"
        popoverHint="Source for monthly climate normals (temp, RH, dew-point, solar)."
      >
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-ink-500">Status</span>
            <span
              className={`tag ${climate.status === "ok" ? "tag-info" : "tag-warn"}`}
            >
              {climateLabel[climate.source]}
            </span>
          </div>
          <p className="text-[11px] leading-snug text-ink-500">
            {climate.message}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn flex-1 !px-2 !py-1 !text-[11px]"
            onClick={() => refreshClimate("nasa-power")}
          >
            NASA POWER
          </button>
          <button
            type="button"
            className="btn flex-1 !px-2 !py-1 !text-[11px]"
            onClick={() => refreshClimate("open-meteo")}
          >
            Open-Meteo
          </button>
          <button
            type="button"
            className="btn !px-2 !py-1 !text-[11px]"
            onClick={() => refreshClimate("fallback")}
          >
            Fallback
          </button>
        </div>
      </InputPill>

      {/* CYCLES */}
      <InputPill
        id="cycles"
        isOpen={openPill === "cycles"}
        onToggle={() => toggle("cycles")}
        label="Cycles"
        value={`${inputs.cyclesPerYear} / yr`}
        secondary={`${inputs.vegDays}d veg · ${inputs.flowerDays}d flower`}
        popoverAlign="end"
        popoverHint="Annual yield and energy scale linearly with cycles per year."
      >
        <NumberField
          label="Cycles per year"
          value={inputs.cyclesPerYear}
          onChange={(n) => setInputs({ cyclesPerYear: n })}
          unit="cycles"
          min={1}
          max={6}
        />
        <div className="grid grid-cols-2 gap-3">
          <NumberField
            label="Veg days"
            value={inputs.vegDays}
            onChange={(n) => setInputs({ vegDays: n })}
            unit="days"
          />
          <NumberField
            label="Flower days"
            value={inputs.flowerDays}
            onChange={(n) => setInputs({ flowerDays: n })}
            unit="days"
          />
        </div>
      </InputPill>

      {/* Customize drawer trigger — opens the long-tail editing
          surface with all 70+ fields + search. Separately styled from
          the pills so it reads as "go deeper" rather than another
          quick-edit input. PR 2 ships this alongside the existing
          sidebar; PR 3 will retire the sidebar. */}
      {onCustomizeClick && (
        <button
          type="button"
          onClick={onCustomizeClick}
          className="btn-cta-warm ml-auto !text-xs"
          aria-keyshortcuts="Meta+K Control+K"
          title="Customize all 70+ inputs (⌘K)"
        >
          Customize <span className="ml-1.5 opacity-70">⌘K</span>
        </button>
      )}
    </div>
  );
}
