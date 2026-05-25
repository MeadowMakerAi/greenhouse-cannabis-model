import { useId, type ReactNode } from "react";
import PillPopover from "./PillPopover";

/**
 * Top-bar input pill — Phase 4 PR 1 of the layout overhaul.
 *
 * One pill = one input concept (location, dimensions, fixture, etc).
 * Each pill shows its label + the current value, click to open a
 * popover with the editable fields for that concept. Pills are
 * ADDITIVE in PR 1 — the existing AssumptionPanel sidebar still
 * holds every field. Pills are a faster front door for the 5-8
 * most-touched inputs.
 *
 * The hypothesis being tested: do users gravitate to the pills?
 * If yes → PR 2 ships (full Customize drawer); if no → we revert
 * the pills and ship a quick-start drawer instead.
 *
 * Visual: paper-card chip with a small-caps label on top, value
 * below in tabular numerals. Active state uses cta-400 ring so the
 * "this is open" cue reads at a glance.
 */
export interface InputPillProps {
  /** Stable id used for aria + the single-open coordinator. */
  id: string;
  /** Whether this pill's popover is currently open. Controlled by
   *  the parent so only one popover is open at a time. */
  isOpen: boolean;
  /** Toggle handler from parent — closes other pills when called. */
  onToggle: () => void;
  /** Small-caps label above the value (e.g. "Location"). */
  label: string;
  /** Current value as a string (e.g. "41.5° N, 74.2° W"). */
  value: string;
  /** Optional 1-line secondary value (e.g. "Montgomery NY"). */
  secondary?: string;
  /** Optional "Start here" tag — surfaces the onboarding cue on the
   *  one pill we want first-timers to start with. */
  startHere?: boolean;
  /** Popover title (defaults to the label). */
  popoverTitle?: string;
  /** Optional one-line popover hint. */
  popoverHint?: string;
  /** `"end"` for pills near the right edge of the viewport. */
  popoverAlign?: "start" | "end";
  /** Popover width in px. */
  popoverWidth?: number;
  /** Field UI rendered inside the popover. */
  children: ReactNode;
}

export default function InputPill({
  id,
  isOpen,
  onToggle,
  label,
  value,
  secondary,
  startHere,
  popoverTitle,
  popoverHint,
  popoverAlign = "start",
  popoverWidth = 360,
  children,
}: InputPillProps) {
  const reactId = useId();
  const triggerId = `pill-trigger-${id}-${reactId}`;
  const popoverId = `pill-popover-${id}-${reactId}`;

  return (
    <div className="relative">
      <button
        type="button"
        id={triggerId}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        className={`group flex min-w-0 max-w-[260px] items-center gap-2 rounded-lg border bg-white/95 px-3 py-1.5 text-left shadow-e1 transition duration-150 hover:-translate-y-px hover:shadow-e2 focus:outline-none focus:ring-2 focus:ring-cta-400/60 focus:ring-offset-1 ${
          isOpen
            ? "border-cta-400 ring-2 ring-cta-400/40"
            : startHere
              ? "border-cta-400/60 ring-1 ring-cta-400/30"
              : "border-ink-200/80"
        }`}
        title={`Edit ${label.toLowerCase()}`}
      >
        <div className="flex min-w-0 flex-col leading-tight">
          <span
            className={`text-[9px] font-semibold uppercase tracking-[0.10em] ${
              startHere ? "text-cta-600" : "text-ink-500"
            }`}
          >
            {label}
            {startHere && (
              <span className="ml-1.5 inline-block align-middle text-[8px] font-bold uppercase tracking-[0.08em] text-cta-600">
                · start here
              </span>
            )}
          </span>
          <span className="truncate font-mono text-xs text-ink-900 tabular-nums">
            {value}
          </span>
          {secondary && (
            <span className="truncate text-[10px] text-ink-500">{secondary}</span>
          )}
        </div>
        <span
          aria-hidden
          className={`text-[10px] text-ink-300 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      <PillPopover
        open={isOpen}
        onClose={onToggle}
        id={popoverId}
        triggerId={triggerId}
        title={popoverTitle ?? label}
        hint={popoverHint}
        align={popoverAlign}
        width={popoverWidth}
      >
        {children}
      </PillPopover>
    </div>
  );
}
