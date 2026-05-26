import { useState } from "react";

/**
 * One-time "what changed" banner — Phase 4 PR 3.
 *
 * Surfaces above the main content the first time a returning user
 * loads the dashboard after sidebar removal. Explains where the old
 * left-sidebar inputs went (top pill bar + Customize drawer + ⌘K)
 * so the change doesn't feel like a regression.
 *
 * Dismissal is per-browser via localStorage. Versioned key (-v1)
 * so a future layout shift can ship a new banner with -v2 without
 * resurfacing this one.
 *
 * Initial visibility is computed SYNCHRONOUSLY in the useState
 * initializer — this is a client-only Vite app (createRoot, no SSR),
 * so we can safely read localStorage at first render and avoid the
 * "render hidden, then jump visible after useEffect" CLS that the
 * naive useEffect pattern causes. Fix for Codex PR 3 Medium #1.
 */

const DISMISS_KEY = "greenhouse-model:sidebar-moved-banner-dismissed-v1";

function readInitialVisibility(): boolean {
  try {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === null;
  } catch {
    // localStorage blocked (Safari private mode, etc.) — just don't
    // show. Banner is not load-bearing.
    return false;
  }
}

export default function WhatChangedBanner() {
  const [visible, setVisible] = useState<boolean>(readInitialVisibility);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-cta-400/40 bg-cta-50 px-4 py-3 text-sm shadow-e1"
    >
      <div className="flex-1 space-y-0.5">
        <div className="font-semibold text-cta-700">
          Settings moved — the sidebar is now in the Customize panel
        </div>
        <p className="text-[12px] leading-snug text-cta-600">
          The 7 inputs you change most often live in the{" "}
          <span className="font-mono text-[11px]">pill bar above</span>. Every
          other input (~70 fields) is in the{" "}
          <span className="font-semibold">Customize</span> button on the
          right — or hit <span className="font-mono text-[11px]">⌘K</span>{" "}
          from anywhere to open it with search.
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="btn-ghost shrink-0 !text-[11px]"
        aria-label="Dismiss what-changed banner"
      >
        Got it ×
      </button>
    </div>
  );
}
