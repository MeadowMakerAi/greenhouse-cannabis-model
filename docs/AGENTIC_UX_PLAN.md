# Agentic UX Overhaul — Sage findings spine

## Context

Sage (the in-app cultivation agent) is already mature: streaming, a tool-trace
panel, explain-back on writes, optimistic-apply + Undo, provider fallback, a
cost meter, a draggable dock, and a one-click 5-specialist audit swarm. Six
agentic-OS research reports + two dashboard-pattern memories were mined for
ideas (working notes in Supabase `public.gm_notepad`). The dominant,
cross-source finding (6 of 6 reports) is that Sage's **output is a wall of
text** — the audit swarm returns one markdown string rendered as literal
`whitespace-pre-wrap` plain text (so `##`/`**` show raw), with no structure,
no confidence, no drill-to-tab, and no apply-CTA. This is exactly the
"content-from-model, form-from-code" gap in Alex's own north-star note.

This plan turns Sage's audit output into **typed findings the client renders**
— the highest-consensus, most demoable win — plus two cheap high-consensus
guardrails. Bigger items (server key proxy, persistent memory, goal
decomposition, tiered routing) are sequenced as a roadmap, not built now.

Scope: **agent + UX layer only.** The `grow-core` science package and every
cited coefficient are read-only.

## Build 1 — Structured Sage findings (the spine)

Consensus: OS Blueprint, Frontier, Amelia, Jarvis, SOTA + dashboard memories.

- **`src/services/sageFindings.ts`** (new)
  - `SageFinding` type: `{ id, title, summary, detail?, severity, confidence?, metric?, tab?, patch?, patchLabel? }` (severity reuses the existing `InsightSeverity` union).
  - `parseFindings(raw): SageFinding[] | null` — extract a fenced ```json findings array from the swarm synthesis; return `null` on any failure (caller falls back to the existing markdown report — graceful degradation, the working feature never regresses).
  - `sanitizeFindingPatch(patch)` — allowlist of scenario keys a finding may set (blast-radius cap, system-level not prompt-level, per the security cluster). Anything off-list is dropped.
  - Keyword→tab map so a finding without an explicit `tab` still gets a drill target.
- **`src/services/agentSwarm.ts`** — synthesis prompt asks for the prose report AND a JSON findings array; `runAuditSwarm` returns `{ report, findings, usage }`. `AuditStoppedError` / cancel paths unchanged.
- **`src/services/providers/types.ts`** — add optional `findings?: SageFinding[]` to `ChatMessage`.
- **`src/components/AuditResultsView.tsx`** (new) — renders findings as collapsible cards: severity dot + confidence chip + one-line summary (progressive disclosure — detail behind expand), "View in {tab}" (dispatches `greenhouse-model:select-tab`), "Ask Sage" deep-dive (reuses `greenhouse-model:open-agent` seed), and "Apply" only when a sanitized `patch` is present (calls back into `setInputs`).
- **`src/components/Chatbot.tsx`** — `runAudit` stores `findings` on the assistant message; the message renderer shows `<AuditResultsView>` when `m.findings?.length`, else the current text.
- **`src/components/DashboardLayout.tsx`** — listen for `greenhouse-model:select-tab` → `setTab` (mirrors the existing `show-landing` / `run-audit` event pattern).

## Build 2 — Session spend ceiling

Consensus: Frontier, SOTA, Sovereign, Jarvis. Cheap.

- User-set `sessionBudgetUSD` (localStorage, near the cost meter in `Chatbot.tsx`). Before a swarm run or a send, if accumulated + projected session cost would exceed it, warn and require an explicit confirm. Turns the passive meter into a real guardrail. Reuses `pricing.ts` `estimateCost`.

## Build 3 — Observation feed polish (minimal; eval loop may extend)

Consensus: SOTA, Frontier, Amelia.

- `AgentObservations.tsx`: add a confidence chip and show a compact stack of the top 2–3 cards instead of one card + "+N more". Invalidation already works (insights recompute from scenario via `useMemo`). Keep minimal; let the eval loop decide how far to push.

## Deferred roadmap (not this pass — logged so nothing is lost)

Server-side key proxy + auth/tiers (unlocked by the closed-source pivot; L,
architectural — Alex should drive); persistent provider-agnostic memory
(remember/recall tools + named resumable threads); goal-decomposition guided
workflows; complexity-tiered model routing; per-tab dynamic system prompt;
vision-ingest injection confirm on auto-applied spec data (partial coverage
via Build 1's user-click Apply gate).

## Constraints / guardrails

- `grow-core` coefficients + `CITATIONS.md`: read-only.
- Findings `patch` is allowlisted + user-click-gated + clamped by
  `ScenarioContext.setInputs` — no silent or arbitrary mutation.
- No `any`, no `@ts-ignore` without a naming comment. `npx tsc -b --noEmit` clean.
- **145+ tests stay green.** New: `sageFindings.test.ts` (parse happy-path,
  malformed-JSON → null fallback, patch-sanitization drops off-list keys).

## Verification

1. `npx tsc -b --noEmit` silent.
2. `npx vitest run` ≥ 145 pass (new tests included).
3. `npm run dev` → browser walkthrough (browser-agent): run the audit, confirm
   findings render as cards, expand detail, drill to a tab, apply a patch and
   see the scenario change; trip the spend ceiling and confirm the warning.
4. Loop-1 vs final eval scorecard in `gm_notepad` shows the delta.
