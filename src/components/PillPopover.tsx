import { useEffect, useRef, type ReactNode } from "react";

/**
 * Anchor-positioned popover used by InputPill — Phase 4 PR 1.
 *
 * - Renders inline (no portal), absolute-positioned beneath the pill
 * - Closes on click-outside or Escape
 * - `align="end"` pins the right edge to the anchor's right edge so
 *   pills near the viewport edge don't overflow horizontally
 * - Width is fixed (360px default) to keep field-density predictable
 * - Trap is intentionally NOT applied — the rest of the dashboard
 *   stays interactive; clicking another pill replaces the open one
 *
 * Visual treatment matches the new editorial paper / warm-card system
 * from PR #5 (paper-50 background, ink hairline border, elevation 3).
 */
export interface PillPopoverProps {
  open: boolean;
  onClose: () => void;
  /** Stable id used for aria-controls / aria-labelledby. */
  id?: string;
  /** Id of the trigger button — wired into aria-labelledby so screen
   *  readers announce the pill's label when the dialog opens. */
  triggerId?: string;
  /** Optional title rendered above the body content. */
  title?: string;
  /** Optional one-line helper rendered under the title. */
  hint?: string;
  /** `"start"` (default) pins to the left edge of the anchor;
   *  `"end"` pins to the right edge. Use `"end"` for pills near the
   *  right side of the viewport. */
  align?: "start" | "end";
  /** Popover width in px. Default 360. */
  width?: number;
  children: ReactNode;
}

export default function PillPopover({
  open,
  onClose,
  id,
  triggerId,
  title,
  hint,
  align = "start",
  width = 360,
  children,
}: PillPopoverProps) {
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popRef.current && !popRef.current.contains(t)) {
        // Click was outside the popover. Check if it was on the pill
        // itself (the anchor) — InputPill handles that case via its own
        // toggle, so we just close.
        const anchor = (popRef.current.parentElement as HTMLElement) ?? null;
        if (anchor && anchor.contains(t)) return;
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // Bind on next tick so the click that opened the popover doesn't
    // immediately close it.
    const timerId = window.setTimeout(() => {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
      // Move focus into the dialog so keyboard users can immediately
      // interact with the first editable control — standard a11y for
      // role="dialog". Fallback to focusing the popover itself if no
      // focusable element is found.
      const first = popRef.current?.querySelector<HTMLElement>(
        'input, select, textarea, button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (first) first.focus();
      else popRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timerId);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const positionStyle =
    align === "end"
      ? { right: 0 as const }
      : { left: 0 as const };

  return (
    <div
      ref={popRef}
      role="dialog"
      aria-modal="false"
      aria-labelledby={triggerId}
      id={id}
      tabIndex={-1}
      className="absolute top-full z-40 mt-2 rounded-xl border border-ink-200/70 bg-paper-50 shadow-e3 focus:outline-none"
      style={{ ...positionStyle, width }}
    >
      {(title || hint) && (
        <div className="border-b border-ink-200/60 px-4 py-3">
          {title ? (
            <div className="text-[11px] font-semibold uppercase tracking-[0.10em] text-ink-700">
              {title}
            </div>
          ) : null}
          {hint ? (
            <div className="mt-0.5 text-[11px] leading-snug text-ink-500">
              {hint}
            </div>
          ) : null}
        </div>
      )}
      <div className="space-y-3 p-4">{children}</div>
    </div>
  );
}
