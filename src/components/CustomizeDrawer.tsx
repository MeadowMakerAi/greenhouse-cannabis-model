import { useEffect, useRef, useState } from "react";
import AssumptionPanel from "./AssumptionPanel";

/**
 * Customize drawer — Phase 4 PR 2.
 *
 * Right-side slide-out that holds the FULL AssumptionPanel sidebar
 * inside a focused dialog with search across all 12 sections + 70+
 * fields. Triggered by the "Customize" button in the top pill bar or
 * by ⌘K / Ctrl+K from anywhere on the page.
 *
 * In PR 2 the sidebar still renders alongside this drawer so users
 * can validate either editing surface without losing the other. PR 3
 * removes the sidebar and lets this drawer own the long-tail editing
 * surface.
 *
 * Search implementation (v1, DOM-based):
 *   On non-empty query, walks the rendered AssumptionPanel DOM and
 *   hides any `.sidebar-section` whose title + body field labels
 *   don't contain the query. Matching sections are forced open and
 *   matching `.field-label` text is highlighted. This is a low-risk
 *   reach-into-DOM pattern that avoids refactoring AssumptionPanel's
 *   internal JSX. A manifest-based approach is a future refinement.
 *
 * Scroll position is preserved across opens via a ref + a stored
 * scrollTop captured at unmount. Search query is reset on close so
 * the next open starts unfiltered.
 */
export interface CustomizeDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Pre-fill the search query when opened (used by ⌘K). */
  autoFocusSearch?: boolean;
}

const HIGHLIGHT_CLASS = "customize-search-hit";
const HIDDEN_CLASS = "customize-search-miss";

export default function CustomizeDrawer({
  open,
  onClose,
  autoFocusSearch = false,
}: CustomizeDrawerProps) {
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const lastScrollTop = useRef<number>(0);
  const [query, setQuery] = useState("");

  // Restore scroll position when the drawer opens; capture it when it
  // closes. Means power-users editing deep in the panel don't lose
  // their place on quick close/reopen.
  //
  // IMPORTANT: AssumptionPanel ITSELF is the scroll container (its
  // root <aside> has overflow-y-auto). Our wrapper div is just a
  // flex sizing parent; scrollTop on the wrapper is always 0. We
  // therefore find the inner scrollable element on mount and bind
  // to that. Fix for Codex P1 (scroll-memory-wired-to-wrong-element).
  useEffect(() => {
    if (!open) return;
    const wrap = bodyRef.current;
    if (!wrap) return;
    // The aside inside AssumptionPanel is the actual scroll surface.
    // Querying for it on mount is robust to any future restructuring
    // (we only need ONE scrollable descendant; if there are several,
    // the topmost one is the panel's overflow container).
    const inner = wrap.querySelector<HTMLElement>(
      "aside, [data-customize-scroll-root]",
    );
    const scrollEl: HTMLElement = inner ?? wrap;
    scrollEl.scrollTop = lastScrollTop.current;
    return () => {
      lastScrollTop.current = scrollEl.scrollTop;
    };
  }, [open]);

  // Focus management: focus the search input on open (per Cmd+K
  // workflow). Esc closes the drawer.
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => {
      if (autoFocusSearch && searchRef.current) {
        searchRef.current.focus();
      } else if (drawerRef.current) {
        drawerRef.current.focus();
      }
    }, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, autoFocusSearch, onClose]);

  // Apply / unapply the search filter to the rendered AssumptionPanel
  // inside the body. Runs every time `query` or `open` changes; the
  // AssumptionPanel render cadence is fast enough that re-querying is
  // cheap (a few dozen elements).
  useEffect(() => {
    if (!open) return;
    const el = bodyRef.current;
    if (!el) return;
    const sections = el.querySelectorAll<HTMLDetailsElement>(
      ".sidebar-section",
    );
    const q = query.trim().toLowerCase();
    sections.forEach((section) => {
      const title =
        section
          .querySelector(".sidebar-section-title")
          ?.textContent?.toLowerCase() ?? "";
      const labels = Array.from(
        section.querySelectorAll<HTMLLabelElement>(".field-label, label"),
      );
      const labelTexts = labels.map((l) => l.textContent?.toLowerCase() ?? "");
      const sectionMatch =
        q.length === 0 ||
        title.includes(q) ||
        labelTexts.some((t) => t.includes(q));
      if (!sectionMatch) {
        section.classList.add(HIDDEN_CLASS);
      } else {
        section.classList.remove(HIDDEN_CLASS);
        if (q.length > 0) {
          // Force the section open so matched fields are visible —
          // but remember the user's prior collapse state so we can
          // restore it when search clears. Fix for Codex P1
          // (search-force-open-never-restored).
          if (!section.open) {
            section.setAttribute("data-search-forced-open", "1");
            section.open = true;
          }
        }
      }
      // Per-label highlighting
      labels.forEach((label, i) => {
        const text = labelTexts[i];
        if (q.length > 0 && text.includes(q)) {
          label.classList.add(HIGHLIGHT_CLASS);
        } else {
          label.classList.remove(HIGHLIGHT_CLASS);
        }
      });
    });
    return () => {
      // On cleanup, clear all our classes AND restore the user's
      // pre-search collapse state on any section we force-opened.
      sections.forEach((section) => {
        section.classList.remove(HIDDEN_CLASS);
        section
          .querySelectorAll(`.${HIGHLIGHT_CLASS}`)
          .forEach((l) => l.classList.remove(HIGHLIGHT_CLASS));
        if (section.getAttribute("data-search-forced-open") === "1") {
          section.open = false;
          section.removeAttribute("data-search-forced-open");
        }
      });
    };
  }, [query, open]);

  // Reset search when drawer closes so reopening starts fresh
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop — click to close, low opacity so the live 3D scene
          behind stays visible (the editing-in-context cue) */}
      <div
        className="fixed inset-0 z-40 bg-ink-900/15 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Customize all scenario inputs"
        tabIndex={-1}
        className="fixed inset-y-0 right-0 z-50 flex h-screen w-[480px] max-w-[100vw] flex-col border-l border-ink-200/70 bg-paper-50 shadow-e4 outline-none animate-customize-in"
      >
        {/* Header — search + close */}
        <header className="flex flex-col gap-2 border-b border-ink-200/70 bg-white px-4 py-3">
          <div className="flex items-baseline justify-between">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-ink-900">
                Customize your scenario
              </h2>
              <p className="text-[11px] text-ink-500">
                All 70+ inputs across 12 sections. Search by name or scroll
                through the categories.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost !text-[11px]"
              aria-label="Close customize drawer (Esc)"
            >
              Esc to close
            </button>
          </div>
          <div className="relative">
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search inputs… (try “co2”, “dimensions”, “fixture”)"
              className="!pl-8"
              aria-label="Search inputs by name"
            />
            <span
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[12px] text-ink-300"
              aria-hidden
            >
              🔍
            </span>
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-ink-500 hover:text-ink-900"
                aria-label="Clear search"
              >
                clear
              </button>
            )}
          </div>
        </header>

        {/* Body — AssumptionPanel as-is. Search filter is applied via
            DOM in the useEffect above. */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto">
          <AssumptionPanel />
        </div>

        {/* Footer — keyboard hint */}
        <footer className="border-t border-ink-200/70 bg-white px-4 py-2 text-[10px] uppercase tracking-[0.10em] text-ink-500">
          <span>
            ⌘K to search · Esc to close · 70+ fields across 12 sections
          </span>
        </footer>
      </aside>
    </>
  );
}
