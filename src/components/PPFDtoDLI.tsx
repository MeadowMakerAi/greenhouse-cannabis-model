import { ppfdToDLI, dliToPPFD } from "../models/dliModel";
import { fmt1, fmtInt } from "../utils/formatting";

/**
 * Tiny primitive: show both PPFD and DLI side-by-side at a given
 * photoperiod, with a tooltip explaining the conversion. Use this
 * anywhere either value would otherwise appear alone — operators
 * think in one unit or the other depending on whether they came from
 * an indoor (PPFD-native) or greenhouse (DLI-native) background.
 *
 * Pass either `ppfd` OR `dli`; the other value is computed.
 *
 *   DLI [mol/m²/d] = PPFD [µmol/m²/s] × photoperiod [hr] × 0.0036
 */
export interface PPFDtoDLIProps {
  ppfd?: number;
  dli?: number;
  photoperiodHours: number;
  /** Tight inline display vs. larger stacked display. */
  variant?: "inline" | "stacked";
  className?: string;
}

const FORMULA_TOOLTIP =
  "DLI (mol/m²/day) = PPFD (µmol/m²/s) × photoperiod hours × 0.0036. " +
  "Same light, two units: PPFD is intensity at a moment, DLI is the total daily dose.";

export default function PPFDtoDLI({
  ppfd,
  dli,
  photoperiodHours,
  variant = "inline",
  className,
}: PPFDtoDLIProps) {
  const effectivePPFD =
    ppfd ?? (dli !== undefined ? dliToPPFD(dli, photoperiodHours) : 0);
  const effectiveDLI =
    dli ?? (ppfd !== undefined ? ppfdToDLI(ppfd, photoperiodHours) : 0);

  if (variant === "stacked") {
    return (
      <div
        className={`flex flex-col gap-0.5 ${className ?? ""}`}
        title={FORMULA_TOOLTIP}
      >
        <div className="font-mono tabular-nums text-lg leading-tight">
          {fmt1(effectiveDLI)}
          <span className="ml-1 text-xs text-ink-500">mol/m²/d</span>
        </div>
        <div className="font-mono tabular-nums text-sm leading-tight text-ink-600">
          ≈ {fmtInt(effectivePPFD)}
          <span className="ml-1 text-xs text-ink-500">
            µmol/m²/s @ {photoperiodHours}h
          </span>
        </div>
      </div>
    );
  }

  return (
    <span
      className={`whitespace-nowrap font-mono tabular-nums ${className ?? ""}`}
      title={FORMULA_TOOLTIP}
    >
      {fmt1(effectiveDLI)} mol/m²/d
      <span className="mx-1 text-ink-400">·</span>
      {fmtInt(effectivePPFD)} µmol/m²/s
    </span>
  );
}
