---
description: Run the three-step verification loop for the greenhouse model — typecheck, tests, and Playwright HUD snapshot. Replaces 6+ manual command sequences per session.
allowed-tools: Bash, mcp__playwright__browser_navigate, mcp__playwright__browser_resize, mcp__playwright__browser_evaluate, mcp__playwright__browser_take_screenshot, Read
---

# /verify-greenhouse — three-step verification

Project-local slash command for the cottage-grove greenhouse model. Runs the
verification triplet that should follow any non-trivial source edit:

1. TypeScript clean (`npx tsc -b --noEmit`)
2. Tests pass (`npx vitest run --reporter=dot`)
3. Visual HUD snapshot via Playwright

The command is structured so you can see all three results in one turn instead
of running them one at a time.

## Step 1 — typecheck + tests in parallel

Run these in a single tool call (parallel Bash invocations):

```bash
npx tsc -b --noEmit 2>&1 | head -30
```

```bash
npx vitest run --reporter=dot 2>&1 | tail -10
```

Report:
- ✅ TS clean if no output, ❌ + first 5 errors if any
- Test count from the vitest summary line ("Tests N passed (N)")

If either fails, stop here. Don't proceed to step 2 — fix the regression first.
A passing snapshot of broken code is worse than no snapshot.

## Step 2 — confirm dev server is up

```bash
lsof -nP -iTCP:5180 -sTCP:LISTEN 2>/dev/null | head -3
```

If port 5180 isn't listening, the user needs to start it manually:
`npm run dev` in the project root. Don't auto-start the server (it runs
foreground; will hang the slash command).

## Step 3 — Playwright snapshot the HUD

Reset any stale browser:

```bash
pkill -9 -f "ms-playwright/mcp-chrome" 2>/dev/null ; sleep 1 ; echo done
```

Navigate, set viewport, switch to Live simulation tab, screenshot the
indoor HUD card.

```python
# Pseudo-flow — use the actual MCP tools:
# 1. browser_navigate http://127.0.0.1:5180/
# 2. browser_resize 1440 x 900
# 3. browser_evaluate to click the "Live simulation" tab button
# 4. browser_evaluate to find the Indoor (canopy) HUD card
# 5. browser_take_screenshot of that card to ~/.playwright-mcp/verify-{timestamp}.png
# 6. Read the PNG to display
```

Specifically verify the indoor card shows finite values:
- Temp in [50, 100] °F
- RH in [25, 90] %
- VPD in [0, 6] kPa with 2 decimal places (no `e+N` scientific notation)
- Lights on/off + dim%
- Vents open/closed
- Canopy PPFD with natural + supplemental breakdown

If any value is `e+N` or out of plausible range, **stop and report**. The
substepped solver guards against this — if it fires, something regressed.

## Step 4 — summary

Print a one-line status:

```
✅ Verification: TS clean · 128/128 tests · HUD reads Temp X°F, RH Y%, VPD Z kPa
```

Or:

```
❌ Verification: <what failed>
```

That's it. Three commands' worth of work in one turn.

## When to use

- After any edit to `src/models/*.ts`, `src/context/useLiveDynamics.ts`,
  `src/context/ScenarioContext.tsx`, or any `src/components/Greenhouse3D*`
- Before any commit that touches the simulation, the HUD, or the 3D scene
- As the last step of a session, before `git commit`, to make sure
  nothing regressed mid-session

## When NOT to use

- For pure documentation edits (`.md` files only) — typecheck + tests
  alone are enough; skip Playwright
- When the dev server isn't running — Playwright will fail; just run
  `npx tsc && npx vitest run` manually
