import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import {
  DLI_BANDS,
  INDOOR_QUALITY_FLOOR,
  YIELD_CEILING,
  classifyDLI,
} from "../models/dliTargets";
import { co2YieldMultiplier } from "../models/co2Model";
import { dliFactor, inverseDLIFactor } from "../models/yieldModel";
import { fmt1, fmtInt } from "../utils/formatting";
import { dliToPPFD } from "../models/dliModel";

/**
 * Indoor-quality DLI ruler. Three literature-anchored bands (floor /
 * leaf-saturation / ceiling) rendered as a horizontal band chart, with
 * the operator's current target plotted on it. Below the ruler, a
 * second line shows the CO₂ yield-equivalent — i.e. the ambient-CO₂
 * DLI that would produce the same yield as the current target under
 * the chosen CO₂ enrichment.
 *
 * The goal here is to give the operator something to MATCH against —
 * sourced numbers, not vibes. Hovering each band shows its citation.
 */

// Visual scale: render the ruler up to 1.05 × ceiling so a "high
// target" still fits with breathing room.
const SCALE_MAX = YIELD_CEILING.dli * 1.05;

function pct(dli: number): number {
  return Math.min(100, Math.max(0, (dli / SCALE_MAX) * 100));
}

export default function DLIBandTile() {
  const { inputs } = useScenario();
  const d = useDerived();
  const target = d.target.targetDLI;
  const photoperiod = inputs.flowerPhotoperiodHours;
  const position = classifyDLI(target);
  const positionLabel = {
    "below-floor": "Below indoor-quality floor — under-lighting vs. indoor benchmark",
    "in-floor-band": "Above the indoor-quality floor",
    "in-optimal-band": "In the high-output band (leaf approaching saturation)",
    "in-ceiling-band": "At the observed cannabis yield ceiling",
    "above-ceiling": "Above any peer-reviewed cannabis yield observation",
  }[position];

  // CO₂ yield-equivalent: at elevated CO₂, the same DLI produces more
  // yield. Express that as "this is what an ambient-CO₂ DLI would have
  // to be to match." Uses the project's piecewise yieldModel curve
  // (linear up to DLI 70, half-slope above) so the equivalent doesn't
  // drift from what projectYield actually predicts. Without the
  // inverse helper, naive `target × co2Mult` would lie above the
  // DLI-70 kink.
  const co2Mult = co2YieldMultiplier(
    inputs.co2SetpointPpm,
    inputs.co2Enabled,
    target,
    inputs.ventilationMode,
  );
  const targetYieldFactor = dliFactor(target);
  const equivYieldFactor = targetYieldFactor * co2Mult;
  const yieldEquivDLI = inverseDLIFactor(equivYieldFactor);
  const co2Bonus = co2Mult > 1.0;

  return (
    <div className="card">
      <div className="card-header">
        <span>Indoor-quality DLI ruler</span>
        <span className="text-[11px] font-normal text-ink-500">
          12 h flower photoperiod basis
        </span>
      </div>
      <div className="card-body space-y-3">
        <p className="text-xs leading-snug text-ink-600">
          The three peer-reviewed cannabis DLI anchors. Match or exceed the
          floor to hit indoor-quality density and yield characteristics.
          Above the leaf-saturation onset, per-photon efficiency falls.
          Above the ceiling there is no published evidence of additional
          gain. Sourced bands and citations are listed below the ruler.
        </p>

        {/* The ruler */}
        <div
          className="space-y-1.5"
          role="img"
          aria-label={`DLI ruler. Your target is ${fmt1(target)} mol/m²/day, ${positionLabel}.${co2Bonus && yieldEquivDLI > target ? ` CO₂ yield-equivalent ${fmt1(yieldEquivDLI)} mol/m²/day at ambient.` : ""}`}
        >
          <div className="relative h-7 w-full overflow-hidden rounded-md border border-ink-200 bg-ink-50">
            {/* Band fills, layered left → right */}
            {DLI_BANDS.map((band, i) => {
              const prevDli = i === 0 ? 0 : DLI_BANDS[i - 1].dli;
              const leftPct = pct(prevDli);
              const widthPct = pct(band.dli) - leftPct;
              const shade = ["bg-leaf-200", "bg-leaf-400", "bg-leaf-600"][i];
              const bandAria = `${band.label}: ${fmt1(band.dli)} mol/m²/day at 12-hour photoperiod, equivalent to ${fmtInt(band.ppfdAt12h)} µmol/m²/s. Source: ${band.source}.`;
              return (
                <div
                  key={band.label}
                  className={`absolute top-0 h-full ${shade}`}
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  title={bandAria}
                  aria-label={bandAria}
                  role="presentation"
                />
              );
            })}
            {/* Operator target marker */}
            <div
              className="absolute top-0 h-full w-[3px] bg-ink-900"
              style={{ left: `calc(${pct(target)}% - 1.5px)` }}
              title={`Your target: ${fmt1(target)} mol/m²/d (≈ ${fmtInt(dliToPPFD(target, photoperiod))} µmol/m²/s @ ${photoperiod}h)`}
              role="presentation"
            />
            {/* CO₂ yield-equivalent marker, only if elevated */}
            {co2Bonus && yieldEquivDLI > target && (
              <div
                className="absolute top-0 h-full w-[2px] bg-amber-500"
                style={{ left: `calc(${pct(yieldEquivDLI)}% - 1px)` }}
                title={`CO₂-equivalent yield: ${fmt1(yieldEquivDLI)} mol/m²/d at ambient would produce the same yield as your ${fmt1(target)} mol/m²/d at ${fmtInt(inputs.co2SetpointPpm)} ppm CO₂.`}
                role="presentation"
              />
            )}
          </div>

          {/* Band tick labels */}
          <div className="relative h-4 text-[10px] text-ink-500" aria-hidden="true">
            {DLI_BANDS.map((band) => (
              <div
                key={band.label}
                className="absolute -translate-x-1/2 whitespace-nowrap"
                style={{ left: `${pct(band.dli)}%` }}
              >
                {fmt1(band.dli)}
              </div>
            ))}
          </div>
        </div>

        {/* Accessible band legend — same information as the hover
            tooltips, but readable by keyboard / screen reader / on
            touch where there's no hover. Each row pairs a color
            swatch with the band's label, DLI/PPFD values, and
            source citation. */}
        <table className="w-full text-xs">
          <caption className="sr-only">Indoor-quality DLI band reference</caption>
          <thead>
            <tr className="border-b border-ink-200 text-left text-ink-500">
              <th scope="col" className="py-1 pr-2 font-medium">Band</th>
              <th scope="col" className="py-1 pr-2 font-medium">DLI</th>
              <th scope="col" className="py-1 pr-2 font-medium">PPFD @ 12h</th>
              <th scope="col" className="py-1 font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {DLI_BANDS.map((band, i) => {
              const shade = ["bg-leaf-200", "bg-leaf-400", "bg-leaf-600"][i];
              return (
                <tr key={band.label} className="border-b border-ink-100 last:border-0">
                  <td className="py-1.5 pr-2">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className={`inline-block h-2.5 w-2.5 rounded-sm ${shade}`}
                        aria-hidden="true"
                      />
                      <span className="text-ink-800">{band.label}</span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums text-ink-900">
                    {fmt1(band.dli)} mol/m²/d
                  </td>
                  <td className="py-1.5 pr-2 font-mono tabular-nums text-ink-700">
                    {fmtInt(band.ppfdAt12h)} µmol/m²/s
                  </td>
                  <td className="py-1.5 text-ink-600">{band.source}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Current target + position narrative */}
        <div className="rounded-md border border-ink-200 bg-white p-2 text-sm">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-ink-500">
              Your target
            </span>
            <span className="font-mono tabular-nums text-base font-semibold">
              {fmt1(target)} mol/m²/d
              <span className="ml-1 text-xs font-normal text-ink-500">
                ≈ {fmtInt(dliToPPFD(target, photoperiod))} µmol/m²/s @ {photoperiod}h
              </span>
            </span>
          </div>
          <div className="mt-1 text-xs text-ink-600">{positionLabel}</div>
        </div>

        {/* CO₂ equivalent line */}
        {inputs.co2Enabled && co2Bonus && yieldEquivDLI > target && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-xs uppercase tracking-wide text-amber-700">
                CO₂ yield-equivalent
              </span>
              <span className="font-mono tabular-nums text-base font-semibold text-amber-900">
                ≈ {fmt1(yieldEquivDLI)} mol/m²/d at ambient
              </span>
            </div>
            <div className="mt-1 text-xs text-amber-800">
              At {fmtInt(inputs.co2SetpointPpm)} ppm CO₂ in {inputs.ventilationMode.replace("_", " ")} mode, your {fmt1(target)} DLI produces the yield of a {fmt1(yieldEquivDLI)} DLI plant at ambient ({(co2Mult * 100 - 100).toFixed(0)}% lift). CO₂ raises yield-per-photon, not the DLI ceiling itself.
            </div>
          </div>
        )}

        {inputs.co2Enabled && !co2Bonus && (
          <div className="rounded-md border border-ink-200 bg-ink-50 p-2 text-xs text-ink-700">
            CO₂ is enabled but the current configuration ({inputs.ventilationMode.replace("_", " ")} ventilation
            {target < INDOOR_QUALITY_FLOOR.dli ? ", target DLI below indoor-quality floor" : ""})
            yields no usable enrichment benefit at the canopy. See the CO₂ warnings panel.
          </div>
        )}

        {/* Bibliography pointer */}
        <div className="text-[10px] leading-snug text-ink-500">
          Full bibliography in CITATIONS.md.
        </div>
      </div>
    </div>
  );
}
