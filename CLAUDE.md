# Greenhouse Cannabis Model — project context

Proprietary decision-support model for cannabis greenhouse design. React 19 +
TypeScript + Vite + R3F. Default profile: Montgomery NY (lat 41.475384,
lon −74.244553). Live demo runs at http://127.0.0.1:5180/ via `npm run dev`.

## Identity

**Proprietary, closed-source, hosted product** (decision 2026-07-12 — reversed
the earlier open-source/MIT plan; the model is now too valuable to give away).
It *will* be released — free or low-cost to **use** via the hosted app — but
the source code is not distributed. LICENSE is all-rights-reserved; `package.json`
is `UNLICENSED`.

**Architecture consequence:** the client-only / BYO-key constraint was a
*consequence* of the open-source plan, NOT a hard requirement. Closed + hosted
means a server is now allowed — auth, usage tiers, a key-proxying backend, and
paid third-party APIs behind serverless functions are all on the table. Prefer
the client-only path when it's simpler, but do not treat "no server" as a rule.
This unblocks the property-diligence feature via a server proxy (Path B).

The dashboard and chatbot are still written for **any cultivator**, not a
specific farm — keep site-specific identifiers out of user-facing surfaces
(default `siteAddress` = `Montgomery, NY`); defaults live in
`src/data/greenhouseDefaults.ts`, configurable at runtime. (This is a
product-generality choice, no longer an open-source one.)

The model is **screening-level decision support** — every output should
disclose this and refer the user to a sealed CFD / engineering-stamped
design before capex.

**Settled principle (Decision Log):** *Re-derive inherited constraints when their
originating business decision changes.* (2026-07-12: the closed-source pivot
dissolved the client-only / no-server / CSP-locked constraint stack — those were
consequences of the open-source plan, not technical requirements. Don't
reflexively re-impose them.)

## Iron rules

- **ZERO FABRICATION** for model coefficients, citations, and benchmark
  values. Every coefficient in `src/models/*.ts` traces to `CITATIONS.md`.
  If a coefficient can't be sourced, it doesn't go in the model — leave a
  TODO that says NOT OBSERVED.
- **128/128 tests must pass** before commit. Run `npx vitest run` after
  every model-layer change. New models require new tests.
- **TypeScript clean.** `npx tsc -b --noEmit` must produce zero errors before
  commit. No `any`, no `@ts-ignore` without a comment naming the workaround.
- **No site-specific identifiers** in user-facing strings (header, HUD,
  chatbot system prompt, README, CITATIONS). The default `siteAddress`
  is `Montgomery, NY` only.

## Numerical stability — load-bearing decisions

- **Indoor temp simulation uses substepped explicit Euler.** 15-min outer
  step is divided into 15 × 1-min inner steps in `useLiveDynamics.computeAt`.
  Vent state, vent CFM, heating, cooling all recompute every substep.
  **Don't change to single-step without re-deriving stability bound** —
  the natural-ventilation formula has a √ΔT feedback that's unstable on a
  coarse Euler integrator with ~200 kW lighting heat input. See the
  in-file comment block referencing the Codex P0 finding.
- **VPD is clamped to [0, 6] kPa** with `isFinite` fall-through to 0.
  Cannabis canopy VPD never physically exceeds ~6 kPa; values above are
  numerical artifacts.
- **Indoor temp clamped to [−20, 140]°F** per substep. Same rationale.

## Verification workflow

After any source edit:

1. `npx tsc -b --noEmit` (must be silent)
2. `npx vitest run --reporter=dot` (must show 128/128 or higher)
3. For UI / 3D / HUD changes: Playwright snapshot via the project slash
   command `/verify-greenhouse` (loads dev server + screenshots HUD)

The `/verify-greenhouse` command at `.claude/commands/verify-greenhouse.md`
runs all three in sequence.

## Architectural drift to watch

These are surfaces where bugs have been caught more than once — pay attention
when editing:

- **Fixture grid math** appears in two places: `Greenhouse3D.tsx` and
  `GreenhousePlanView.tsx`. Both use the same "derive rows + cols from
  gridSpacingFt, search for best-fit if mismatch ≥ 3" pattern. Keep them
  in sync. Don't add a third copy — extract a util before duplicating.
- **Day-of-year formatting** lives in three components:
  `TimeControls.tsx`, `LiveGreenhouseScene.tsx`, `Greenhouse3DHud.tsx`.
  All use the same `cumStart` array. Codex P1 flagged this; centralize
  before adding a fourth.
- **Canopy area auto-scales** with greenhouse length × width when those
  dimensions change. Logic lives in `ScenarioContext.setInputs`.
  Manual override of `canopyAreaSqFt` in the same patch wins.

## Codex review

The repo includes `CODEX_REVIEW_BRIEF.md` — the methodology brief for
adversarial GPT review. Use `/codex challenge` against this brief before
shipping any structural change. The brief teaches the
reason→search→reason→search pattern explicitly.

When Codex flags a P0, treat it as a P0. Most recent run found 5 real P0s
(API key in localStorage, `set_scenario` shallow-merge, DOY wrap, snapshot
drift, peak<eave geometry guard). All five are now settled:

- DOY wrap, snapshot drift, peak<eave geometry guard: patched in `dc38c18`.
- `set_scenario` shallow-merge: chatbot tool handler now deep-merges nested
  envelope patches before calling `setInputs`, so a single-field envelope
  patch no longer wipes sibling fields.
- API key in localStorage: this was the production decision for the *earlier*
  open-source BYO-key model. Current containment stack (still in force):
  · CSP `connect-src` allowlists only `api.anthropic.com` (+ NASA POWER /
    Open-Meteo / NWS for climate data) — XSS can't exfiltrate the key
    elsewhere.
  · `isAnthropicKeyFormat` rejects non-Anthropic keys at submit time.
  · `isPublicHostname` triggers an extra warning when the dashboard runs
    on a non-localhost origin.
  · Session-only toggle in the chatbot lets paranoid users opt for
    `sessionStorage` (cleared on tab close) instead of `localStorage`.
  **Superseded by the 2026-07-12 closed-source/hosted pivot:** a server-side
  key proxy (own key, or per-account keys behind auth) is now the preferred
  end state — client-side BYO-key can remain a fallback/self-host mode. The
  containment stack above stays until the proxy ships. Server-side proxy is
  NO LONGER out of scope.

## Bibliography is the source of truth

Every science citation lives in `CITATIONS.md`. When adding a new model or
coefficient, add the citation there *first*, then implement. If the source
isn't in `CITATIONS.md`, the coefficient doesn't ship.

## Launch context

`LAUNCH.md` contains the launch playbook, including the bundled MIT-cert +
open-source release LinkedIn post, the MJBizDaily pitch template, and the
asset stack. The launch is a real near-term deliverable, not aspirational.

## Default tooling preferences for this project

- **Codex review** before any structural change > 50 lines
- **Playwright** for UI verification, not screenshots from dev tools
- **Plan Mode** before any change that touches the simulation feedback loops
  (`useLiveDynamics`, `simulationModel`, `plantGrowthModel`)
- **Worktrees** when 2+ independent changes are queued — don't stack
