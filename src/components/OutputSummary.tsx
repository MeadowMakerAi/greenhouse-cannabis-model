import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { fmtCurrency, fmtInt, fmt1, fmtPct } from "../utils/formatting";
import Citation, { CITATIONS } from "./Citation";
import SensitivitySlider from "./SensitivitySlider";
import { yieldRealismCases } from "../data/yieldRealism";
import type { ReactNode } from "react";

/**
 * KPI strip — power-economics crown + three decision groups.
 *
 * Information architecture (per /somersault round-2, 2026-05-22):
 *   • Crown: power cost per gram — annual electricity cost (lighting,
 *     dehumidification, peak-demand charge) ÷ annual harvest. Heating fuel
 *     (gas/propane) and AC are NOT in it. Electricity ONLY —
 *     it excludes labor, nutrients, growing media, packaging, and
 *     capex. It is one slice of true cost per gram, not the whole
 *     thing. The model is an energy/climate model; it is honest about
 *     sizing the power slice precisely and not pretending to know the
 *     rest. (Honesty correction 2026-05-22 — was mislabeled "operating
 *     cost", which a cultivator reads as full opex.)
 *   • Three groups answer the grower's three questions, in order:
 *       ① Light target — can I hit indoor-grade light, and what
 *         supplement does it take?
 *       ② Harvest — what does it yield?
 *       ③ Power to run it — what does the electricity cost?
 *   Light drives bud density / structure / yield, NOT cannabinoid % —
 *   see cropTargets.ts and CITATIONS "yield-dli".
 */
export default function OutputSummary() {
  const { inputs, setInputs } = useScenario();
  const d = useDerived();

  const annualGrams = d.yieldProjection.totalAnnualKg * 1000;
  const costPerGram =
    annualGrams > 0 ? d.annualEnergyPlusDemand / annualGrams : 0;
  const annualLb = d.yieldProjection.totalAnnualKg * 2.2046;
  const realism = yieldRealismCases[inputs.yieldRealismCase];
  // Natural sun delivered to the flower window, averaged across the year.
  const naturalDLI =
    d.months.reduce((a, m) => a + m.flowerWindowDLI, 0) / d.months.length;
  const onTarget = d.target.targetDLI > 0;

  // Outdoor mode swaps the power-economics crown for natural-light outputs:
  // electricity/HVAC/fixtures don't exist open-air, so a $/gram crown would read
  // ~$0 and mislead. Natural DLI is the honest headline (no glazing loss).
  const outdoor = inputs.mode === "outdoor";
  const peakOutdoorDLI = d.months.length
    ? Math.max(...d.months.map((m) => m.outdoorDLI))
    : 0;
  const annualMeanOutdoorDLI = d.months.length
    ? d.months.reduce((a, m) => a + m.outdoorDLI, 0) / d.months.length
    : 0;
  const peakMonth = d.months.reduce(
    (best, m) => (m.outdoorDLI > best.outdoorDLI ? m : best),
    d.months[0] ?? { outdoorDLI: 0, monthLabel: "—" },
  );

  return (
    <section className="relative overflow-hidden">
      {/* Decision-support disclaimer — every output discloses its level
          per the project's CLAUDE.md. */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.10em] text-ink-500">
          <span>Key outputs</span>
          <span
            className="inline-flex items-center gap-1 rounded-full border border-leaf-500/30 bg-leaf-50 px-1.5 py-[1px] text-[9px] font-medium normal-case tracking-normal text-leaf-700"
            title="Every coefficient sourced — Guelph, Wageningen, Mississippi, UBC, ASABE, ASHRAE, NASA POWER. Click the [src] tag next to any number, or see CITATIONS.md in the repo."
          >
            📖 peer-reviewed coefficients
          </span>
        </div>
        <div
          className="rounded-full border border-warn-500/30 bg-warn-500/5 px-2 py-0.5 text-[10px] font-medium text-warn-600"
          title="Outputs are decision-support only. Validate against stamped engineering before any capex commitment."
        >
          ⚠ Screening-level — verify before capex
        </div>
      </div>

      {/* Subliminal blueprint grid behind the panel — felt before seen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(13,17,23,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(13,17,23,0.04) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.7), rgba(0,0,0,0) 85%)",
        }}
      />

      {outdoor ? (
        <div className="relative">
          {/* ── Crown: natural light (open-air) ── */}
          <div className="pb-4">
            <div className="kpi-eyebrow">
              <span className="text-leaf-700">☀</span> Natural light · open-air
            </div>
            <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
              <div
                className="kpi-hero"
                title="Peak-month daily light integral on an open-air canopy at this latitude — full sun, no greenhouse glazing loss. DLI is the whole day's light added up (mol/m²/day)."
              >
                {fmt1(peakOutdoorDLI)}
                <span className="kpi-hero-unit"> DLI peak</span>
              </div>
              <div className="kpi-context-lead mb-1">
                {fmt1(annualMeanOutdoorDLI)} mol/m²/day annual mean · peaks in{" "}
                <span className="font-medium text-ink-700">
                  {peakMonth.monthLabel}
                </span>
              </div>
            </div>
            <div className="kpi-context mt-1 proportional-nums">
              Open-air sunlight at the canopy — no glazing loss. Outdoor mode
              models natural light, soil, and the frost / growing-season window.{" "}
              <span className="font-medium text-ink-700">Not yet modeled:</span>{" "}
              yield, water, and outdoor pathogen pressure — those need a season
              model and sun-grown citations.
            </div>
          </div>
        </div>
      ) : (
      <div className="relative">
        {/* ── Crown: power cost per gram ── */}
        <div className="pb-4">
          <div className="kpi-eyebrow">
            <span className="text-leaf-700">●</span> Power cost per gram
          </div>
          <div className="mt-1 flex flex-wrap items-end gap-x-4 gap-y-1">
            <div
              className="kpi-hero"
              title="Annual electricity cost ÷ annual dry-flower harvest. The electricity here is lighting + dehumidifiers + the utility peak-demand charge. It does NOT include heating (usually gas or propane — shown on the Build sheet) or air conditioning (most greenhouses vent or evap-cool instead of running AC). It also excludes labor, nutrients, growing media, packaging, testing, and build-out (capex). So your true all-in cost per gram is meaningfully higher — this is the one slice an energy/climate model can size precisely."
            >
              ${costPerGram.toFixed(2)}
              <span className="kpi-hero-unit">/gram</span>
            </div>
            <div className="kpi-context-lead mb-1">
              {fmt1(d.gramsPerSqFtPerCycle)} g/ft² per cycle ·{" "}
              {fmtInt(annualLb)} lb/yr · at{" "}
              <span className="font-medium text-ink-700">
                {realism.label}
              </span>{" "}
              yield
            </div>
          </div>
          <div className="kpi-context mt-1 proportional-nums">
            Electricity only — lighting, dehumidifiers, and the utility
            peak-demand charge ÷ annual harvest.{" "}
            <span className="font-medium text-ink-700">Not</span> heating
            (usually gas/propane, shown on the Build sheet) or AC — most
            greenhouses vent or evap-cool rather than run air conditioning.{" "}
            <span className="font-medium text-ink-700">Not</span> labor,
            nutrients, growing media, packaging, or build-out (capex). True
            cost per gram is higher — this is the power slice the model sizes
            precisely.
          </div>
        </div>

        {/* Hairline rule + leaf accent tick */}
        <div className="relative h-px bg-ink-200/80">
          <div className="absolute left-0 top-0 h-px w-24 bg-leaf-600" />
        </div>

        {/* ── Three decision groups ── */}
        <div className="grid grid-cols-1 gap-x-6 gap-y-6 pt-4 sm:grid-cols-3 sm:gap-x-0 sm:divide-x sm:divide-ink-200/70">
          <Group title="① Light target">
            <Stat
              value={onTarget ? `${d.target.targetDLI}` : "—"}
              unit="DLI target"
              citationId="yield-dli"
              tooltip="DLI is the whole day's light added up (mol/m²/day). PPFD is the brightness at one instant (µmol/m²/s) — what a PAR meter reads. This is the minimum light for indoor-grade bud density; above it, more light means more yield, not more potency."
            />
            <Line>
              {onTarget
                ? `≈${d.target.targetTopCanopyPPFD} µmol/m²/s at the canopy on a 12-h flower day — ${d.target.label}.`
                : d.target.label}
            </Line>
            <Line>
              Sunlight delivers ~{fmt1(naturalDLI)} DLI into the flower window.
              Supplemental lighting closes the gap to target.
            </Line>
            <Line>
              {fmt1(d.peakInstalledKW)} kW of supplemental lighting at the peak
              month.
            </Line>
          </Group>

          <Group title="② Harvest">
            <Stat
              value={fmt1(d.gramsPerSqFtPerCycle)}
              unit="g/ft² per cycle"
              citationId="yield-dli"
              warn={d.yieldTierNeedsEvidence}
            />
            <Line>
              ≈{fmtInt(annualLb)} lb of dry flower per year across{" "}
              {inputs.cyclesPerYear} cycles.
            </Line>
            <Line>{d.yieldTierLabel}.</Line>
            <Line>
              Planning at{" "}
              <span className="font-medium text-ink-700">{realism.label}</span>{" "}
              yield — set the scenario in the sidebar. The model's dialed-in
              ceiling is higher.
            </Line>
            <Line>
              {fmt1(d.energyUseIntensity_kWhPerGram)} kWh of power per gram
              harvested.
            </Line>
          </Group>

          <Group title="③ Power to run it">
            <Stat
              value={fmtCurrency(d.annualEnergyPlusDemand)}
              unit="/yr"
              warn={d.demandFractionOfBill > 0.4}
              tooltip="Total yearly electricity: the energy you use (lighting + dehumidifiers) plus the peak-demand charge — a surcharge the utility adds each month for your single highest 15-minute power draw, on top of the energy itself. For lights-heavy grows that surcharge is often 20–40% of the bill. Heating fuel and AC are not in this number."
            />
            <Line>
              Electricity only: lighting + dehumidifiers + peak-demand charges
              ({fmtPct(d.demandFractionOfBill)} of the bill). Heating fuel and
              AC aren't here — heating is usually gas/propane (see the Build
              sheet), and most greenhouses cool by venting, not AC. Labor,
              nutrients, and media aren't included either.
            </Line>
            <div className="space-y-1.5 pt-1">
              <SensitivitySlider
                label="Electricity rate"
                value={inputs.electricityRatePerKwh}
                min={0.06}
                max={0.32}
                step={0.005}
                unit="/kWh"
                format={(v) => `$${v.toFixed(3)}`}
                onChange={(v) => setInputs({ electricityRatePerKwh: v })}
              />
              <SensitivitySlider
                label="Demand charge"
                value={inputs.demandChargePerKwMonth}
                min={0}
                max={30}
                step={0.5}
                unit="/kW-mo"
                format={(v) => `$${v.toFixed(1)}`}
                onChange={(v) => setInputs({ demandChargePerKwMonth: v })}
              />
            </div>
          </Group>
        </div>
      </div>
      )}
    </section>
  );
}

/** A titled decision column. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <div className="kpi-eyebrow text-ink-700">{title}</div>
      <div className="mt-1.5 space-y-1">{children}</div>
    </div>
  );
}

/** The headline number inside a group. */
function Stat({
  value,
  unit,
  citationId,
  warn,
  tooltip,
}: {
  value: string;
  unit?: string;
  citationId?: keyof typeof CITATIONS;
  warn?: boolean;
  tooltip?: string;
}) {
  return (
    <div className="flex items-baseline gap-1.5" title={tooltip}>
      <span
        className={`kpi-vital ${warn ? "text-warn-600" : "text-ink-900"}`}
      >
        {value}
        {unit && <span className="kpi-vital-unit">{unit}</span>}
      </span>
      {citationId && <Citation id={citationId} />}
    </div>
  );
}

/** A plain-language supporting line under a group's headline number. */
function Line({ children }: { children: ReactNode }) {
  return <div className="kpi-context proportional-nums">{children}</div>;
}
