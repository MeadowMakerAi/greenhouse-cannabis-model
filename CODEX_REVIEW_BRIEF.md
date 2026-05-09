# Codex review brief — Cottage Grove greenhouse model

**Project root**: `~/workspaces/ops/cottage-grove/greenhouse-model/`

**Stack**: React 19 + TypeScript + Vite · React Three Fiber + drei + postprocessing · Recharts · Tailwind CSS · Anthropic API (browser-direct, vision + tool use)

**Status**: ~70 source files. 121/121 vitest tests pass. TypeScript clean. Production build clean. Live at `http://127.0.0.1:5180/`.

**What it is**: Screening-level cannabis greenhouse decision-support model for Cottage Grove farm (lat 41.475°, lon −74.245°). Models DLI / PPFD / fixtures / amperage / cooling / heating / dehumidification / yield / pathogen pressure / crop steering, with a live simulation clock that drives a 3D scene + glassmorphic HUD, and a chatbot that ingests spec-sheet PDFs/images via Anthropic Vision and updates model state.

---

## How to review (the technique)

I want you to use the same iterative knowledge-driven review pattern that's been working for me: **reason → search → reason again → search again → consolidate → improve.** Concretely:

1. **Reason first.** Before reading any code, read this brief. Form a mental model of what the project is and where the highest-leverage review surface area sits. Write down what you don't yet understand.

2. **Search/read to fill the first gap.** Pull the specific files I flag below. Don't grep your way around to look smart — go straight to the listed files. Note what you find.

3. **Reason again.** What did the first pass surprise you with? What new questions did it raise? Are there second-order issues (e.g. one bug implies a class of bugs)?

4. **Search again — but deeper this time.** If you found a bug pattern in one file, check sibling files. If the issue is upstream (e.g. wrong type definition), trace it forward. Pull peer-reviewed references or library docs (Anthropic API, R3F, drei, postprocessing) when verifying API contracts.

5. **Consolidate.** Write down findings as a P0 / P1 / P2 list with file:line refs.

6. **Improve.** Submit specific patches for P0. P1 you describe but don't patch — surface them for human triage.

**Specifically: for any change you propose, name the tradeoff.** "This patches the bug but loses the auto-fit on dim change" — that kind of explicit tradeoff. No silent design changes.

**Don't make changes that aren't well-reasoned.** Visual polish is welcome, but every edit should have a stated reason. No improvements are off-limits — but every edit needs a justification a reader can audit.

---

## Architecture quick-reference

### Pure model layer — `src/models/*.ts`
Stateless functions, all unit-tested:
- `dliModel`, `photoperiodModel`, `solarModel` — astronomical + DLI math
- `fixtureModel` — PPFD → kW → fixture count → amps → circuits
- `underCanopyModel` — real PPFD/DLI (not a heuristic score)
- `co2Model`, `psychrometricModel`, `vpdModel`, `evapCoolingModel`
- `heatLoadModel`, `heatingModel` (with thermal screen), `heatPumpModel`
- `dehumidificationModel`, `seasonalStrategyModel`, `shadeModel`
- `pathogenModel`, `yieldModel`, `cropSteeringModel`, `sanityGuards`
- `simulationModel` — sun position, diurnal T/RH, lights schedule, vent state, indoor temp step
- `kelvinModel` — Tanner Helland Kelvin → RGB
- `optimizationModel`, `proactiveInsights`

### Data — `src/data/*.ts`
Editable defaults + reference fixture library (vendor-verified specs from live web fetch 2026-05-09).

### Services — `src/services/*.ts`
- `nasaPowerClient` — verified MJ/m²/day in climatology endpoint (gotcha: divide by 3.6 for kWh)
- `openMeteoClient` — historical hourly fallback
- `nwsClient` — metadata only
- `chatbotService` — Anthropic API + tool-use loop + vision
- `chatbotTools` — 9 tool schemas + system prompt

### Context — `src/context/*.tsx`
- `ScenarioContext` — all editable inputs, custom fixtures persisted to localStorage, climate fetcher
- `SimulationContext` — clock with continuous-mode + range-mode RAF tickers
- `useDerived` — memoized monthly model outputs from inputs + climate + fixtures
- `useLiveDynamics` — instantaneous + 24h-trace from sim clock
- `useAllFixtures` — preset + vendor-verified + custom merged

### Components — `src/components/*.tsx`
- `DashboardLayout` — header, sidebar, tab nav
- `AssumptionPanel` — sidebar inputs (~30 fields in groups)
- `OutputSummary` — hero KPI strip
- `InsightsPanel` — proactive recommendations
- `BuildSheet` — procurement-grade BOM
- `OptimizedSystemPanel` — recommendations with apply
- `CultivationSciencePanel` — yield + pathogen + crop steering
- `LiveGreenhouseScene` — **NEW** extracted reusable 3D + HUD + sim controls; rendered on multiple tabs
- `Greenhouse3D` — R3F scene
- `Greenhouse3DHud` — glassmorphic HTML overlay
- `Chatbot` — floating widget with vision/PDF upload
- per-tab science panels (DLI, supplemental, LED vs HPS, etc.)

---

## Review scope — focus your effort here

These are the recently-added or security-sensitive surfaces. Prioritize them.

### P0 candidates (most likely to find issues)

1. **`src/services/chatbotService.ts` + `src/components/Chatbot.tsx`** — Anthropic API call from the browser, tool-use loop, vision content blocks for spec sheet ingestion.
   - Browser-direct API access uses `anthropic-dangerous-direct-browser-access: true` + `x-api-key`. Is this safe given the API key is in localStorage and never sent except to api.anthropic.com? Any leak surfaces?
   - Tool-use loop: when `stop_reason === "tool_use"`, we append assistant content blocks then a `user` message with `tool_result` blocks. Does this preserve message ordering against the current Anthropic spec?
   - PDF blocks use `type: "document"` with `source: { type: "base64", media_type: "application/pdf", data }`. Image blocks use `type: "image"` with the same source structure. Verify these match the current Anthropic API.
   - `fileToBase64` chunks at 0x8000 bytes to avoid stack overflow. Does it correctly handle multi-MB PDFs?
   - The duplicate hidden `<input type="file" />` — is there a bug where ref points to the wrong one?

2. **`src/context/SimulationContext.tsx`** — two requestAnimationFrame loops, mutually exclusive.
   - Race conditions when toggling between continuous-mode and range-mode mid-frame?
   - Wrap math: `dayInc > 365` edge case; backward range where end < start.
   - Is `lastTickRef` reset semantics correct on pause/resume?

3. **`src/context/useLiveDynamics.ts`** — builds 49-point trace + snapshot every render.
   - Performance: this useMemo runs on every animation frame during play. The trace doesn't depend on `hourOfDay` — could it be hoisted?
   - Vent hysteresis state: `prevVent` is local to the loop, not persisted across renders. Visual correctness?

4. **`src/context/ScenarioContext.tsx` `geometryFromDims`** — auto-derives floor/envelope/volume from length × width × eave × peak. Verify the envelope formula:
   ```
   sidewalls (2 × L × eave) + end rectangles (2 × W × eave)
   + end gables (2 × ½ × W × (peak − eave)) + roof slopes (2 × L × √((W/2)² + (peak−eave)²))
   ```
   Watch for off-by-2, missing foundation perimeter, or any case where `peak < eave`.

5. **`src/components/Greenhouse3D.tsx`** — ~700 lines of R3F.
   - All `useMemo` calls at component top level (we caught one inside `.map()` earlier — confirm clean).
   - Performance: ~50 plant meshes + ~40 fixture meshes + ~20 truss segments. Should we use `<instancedMesh>` for plants/fixtures?
   - `<EndGable>` shape: does it correctly seal at the apex?
   - When `peakHeight < eaveHeight + 1`, does the geometry degenerate gracefully?

### P1 candidates (worth checking)

6. **Math model edge cases**:
   - `pathogenModel.evaluatePathogenPressure` at RH = 0 or T < 32 °F.
   - `yieldModel.projectYield` extreme inputs (DLI 200, T 50 °F, CO₂ 5000) — does it return absurdly large or negative numbers?
   - `simulationModel.sunPositionAt` at the poles (lat ±90°) — atan2 stable?

7. **`src/components/AssumptionPanel.tsx`** — `geometryFromDims` is also called via `setInputs` patches. If the user types a partial dim that triggers re-derive while another field is mid-edit, do we get input-trampling?

8. **Chatbot tool schemas** — does `set_scenario({patches: {...}})` accept any key including nested ones (`envelope.baseTransmissionPct`)? It currently doesn't because we shallow-merge. Should we deep-merge or validate against a schema?

### Out of scope

- Visual design choices (subjective, user is iterating live).
- Test coverage on non-critical paths (we have 121).
- Greenhouse science benchmark values (verified live against citable peer-reviewed sources — see `~/.claude/projects/-Users-alexanderclaiborne/memory/reference_greenhouse_science_benchmarks.md`).
- Framework choices (R3F, Recharts, Tailwind committed).
- Any change > 100 lines without surfacing first.

---

## Visual improvement is in scope

The user has explicitly OK'd visual UX/UI improvements as long as **every change is well-reasoned**. Specifically:

- The KPI cards in `OutputSummary` have accent stripes + gradient backgrounds. Are the colors balanced? Is the typography hierarchy clear?
- The header has a "CG" brand mark with leaf-gradient. Acceptable design or feels too much like a placeholder?
- The HUD on the 3D scene uses glassmorphism (`backdrop-blur-md bg-white/55`). Readable against bright sky AND dark night?
- The InsightsPanel uses 4 severity colors. Are they perceptually distinct?
- The tab bar uses a "pill" treatment with `tab-button-active`. Is the active state clear enough?
- The simulation clock controls — is the date-range start/end clearly differentiated? The user just gave feedback that it was "hard to find."

If you propose visual changes:
1. Reason about what's underperforming (e.g., "users miss X because…")
2. Search/check competitive references (Linear, Datadog, Notion dashboards) — if you cite them, link
3. Propose a specific change with the tradeoff named

---

## Specific deliverables

1. **P0 list** with file:line refs and patches.
2. **P1 list** described, not patched — for human triage.
3. **Visual improvements** with reasoning + tradeoffs (no silent edits).
4. **Architectural drift notes** — concepts implemented inconsistently (e.g., is `dayOfYear → month` conversion duplicated?).
5. **One-line summary at the top** with a confidence score: "Confidence X/10 that the project is correct overall, with N P0 issues found."

---

## Reference materials checked-in to memory

If you want context on the science:

- `~/.claude/projects/-Users-alexanderclaiborne/memory/reference_greenhouse_science_benchmarks.md` — Chandra/Rodriguez-Morrison/botrytis/PM/crop steering peer-reviewed values
- `~/.claude/projects/-Users-alexanderclaiborne/memory/reference_3d_dashboard_techniques.md` — drei Sky params, Kelvin colors, ACES tone mapping, proactive insight UX
- `~/.claude/projects/-Users-alexanderclaiborne/memory/feedback_nasa_power_unit_trap.md` — MJ vs kWh on POWER climatology endpoint
- `~/.claude/projects/-Users-alexanderclaiborne/memory/feedback_under_canopy_real_ppfd.md` — UC modeled as real PPFD/DLI, not a 0–3 score
- `~/.claude/projects/-Users-alexanderclaiborne/memory/feedback_no_fabrication.md` — ZERO FABRICATION rule (extends to model coefficients, not just data)
- `~/.claude/projects/-Users-alexanderclaiborne/memory/feedback_verify_model_coefficients.md` — model parameters need citable source

Read whichever feels relevant. Don't assume; verify.

---

End of brief. Apply the technique. Find what's actually wrong. Don't pad.
