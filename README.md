# Greenhouse Cannabis Model

Open-source, screening-level decision-support model for cannabis greenhouse
design. Live 3D simulation, yield projection, HVAC sizing, ventilation
physics, and plant growth on a 24-hour clock — every coefficient traced to
a peer-reviewed source. Built solo with Claude Opus 4.7 as a paired-coding
agent.

> ⚠ **Screening-level only.** Outputs are decision support, not stamped
> engineering. Validate against a sealed CFD / engineering review before
> any capex commitment.

## Quick start

```bash
npm install
npm run dev          # http://localhost:5180
npm test             # 128 unit tests across the model layer
npm run build        # type-check + production bundle
```

Default scenario: a hybrid LED greenhouse profile in Montgomery NY (lat
41.475, lon −74.245). Override every input at runtime — site address,
geometry, fixture library, crop schedule, electrical service, climate
provider — via the assumption panel.

## What it answers

1. How much natural canopy PPFD reaches the plants each month, after the
   greenhouse envelope?
2. How much supplemental overhead PPFD is required to hit a chosen DLI
   target (30 / 40 / 50 mol/m²/d)?
3. What's the resulting installed kW, fixture count, grid spacing,
   amperage, branch circuit count?
4. How does fixture choice (LED vs HPS, vendor A vs vendor B) change
   energy / cost / heat load / wet-bulb risk?
5. How big is the cooling load, dehumidification load, heating load
   month by month?
6. What's the projected yield given DLI, indoor temp, CO₂?
7. What's the pathogen pressure (botrytis / powdery mildew) by month?
8. When does outdoor wet-bulb make evaporative cooling fail?

## Live 3D simulation

The model includes a real-time 3D scene driven by the simulation clock:

- Sun position from astronomical first-principles (Spencer 1971)
- Atmospheric scattering via drei `<Sky />` (Hosek-Wilkie 2012)
- Tanner Helland Kelvin → RGB for sun color across the day
- ACES Filmic tone mapping
- Atrium-style continuous ridge vents (paired N+S leaves, ASAE EP406.4
  stack-effect physics)
- Phase-aware plant growth: clone seedling → veg bush → flowering with
  cola development scaling with cumulative DLI / temp / CO₂
- Glassmorphic HUD overlay with date, time, GPS, sun azimuth/elevation,
  outdoor + indoor T/RH/VPD, vent state, light state, canopy PPFD

## Science citations

Every model coefficient traces to a citable source. See
[`CITATIONS.md`](./CITATIONS.md) for the full bibliography (Guelph,
Mississippi, Wageningen, ASAE/ASHRAE, UMass, Penn State, Simon Fraser,
UBC, Charles University Prague, NASA POWER, NOAA NWS, Open-Meteo).

Key references:

- **Yield-DLI curve**: Rodriguez-Morrison, Llewellyn & Zheng 2021 (Guelph)
- **Photosynthesis Topt**: Chandra et al. 2008 (Mississippi)
- **Greenhouse climate energy balance**: Bot 1983 (Wageningen / KASPRO lineage)
- **Stack-effect ventilation**: ANSI/ASAE EP406.4 + ASHRAE Handbook Ch. 16
- **Vapor pressure**: Magnus / Tetens; **wet-bulb**: Stull 2011 (UBC)

## Chatbot — bring your own API key

The dashboard includes an optional AI assistant powered by Anthropic
Claude. The chatbot can read the current scenario, modify it, swap or
add fixtures, run side-by-side comparisons, and **ingest greenhouse or
fixture spec sheets via vision (PDF / image)** to auto-update model
parameters.

The chatbot is **disabled by default and never auto-calls Anthropic**.
You provide your own API key, stored only in your browser's localStorage.

### Security model

- **Browser-direct call to api.anthropic.com only.** A
  [Content Security Policy](./index.html) restricts `connect-src` to
  Anthropic + the climate APIs + the local dev server. Even if a
  hostile script ran in the page (XSS, malicious browser extension),
  the browser would refuse to send the key to attacker.com.
- **Runtime URL allow-list** in `chatbotService.ts` — refuses to
  transmit the key to any host other than `api.anthropic.com` over
  HTTPS, regardless of how the request URL was constructed.
- **`sk-ant-` format check** before the first transmission catches
  paste-the-wrong-secret mistakes (a GitHub PAT, a Stripe key) before
  they're sent.
- **Public-hostname warning.** If you deploy this dashboard to a public
  URL (Vercel, custom domain), the key-entry panel adds an extra
  hardened warning. Keys belong to dedicated, spend-capped Anthropic
  accounts — not your production key.
- **One-click "Forget everything"** — clears the API key, the chat
  history, and the model preference from localStorage in a single click.

### Recommended posture for forks / public deploys

1. Create a dedicated Anthropic key for this dashboard at
   [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys).
2. Set a daily spend cap (e.g. $5/day) at
   [console.anthropic.com/settings/limits](https://console.anthropic.com/settings/limits).
3. Don't reuse a production key. Don't paste any key on a screen-share.
4. If you fork this repo to a public Vercel/Netlify/etc deploy, treat
   the key entry surface as untrusted by default and configure your
   Anthropic key with the lowest reasonable rate limits.

## Architecture

```text
src/
  components/      Dashboard layout, tabs, charts, 3D scene, HUD, chatbot
  context/         Scenario state + memoized derived calculations
  data/            Editable defaults — fixture library, climate fallbacks
  models/          Pure, unit-tested calculation functions
                   — DLI, fixtures, cooling, heating, dehum, yield,
                     pathogen, crop steering, plant growth, simulation,
                     ventilation, psychrometrics, vpd, sky, kelvin
  services/        Anthropic chatbot, NASA POWER, Open-Meteo, NWS clients
  tests/           128 vitest unit tests for the model layer
```

The science layer (`src/models/`) is pure TypeScript with no dependencies
on React. You can copy any model file into another project and call it
directly. All values are unitful and documented at the function level.

## Numerical stability

The indoor temperature simulation uses **substepped explicit Euler**
(15-min outer step, 15 × 1-min inner steps in `useLiveDynamics.computeAt`).
This is load-bearing: the natural-ventilation formula has a √ΔT feedback
term that's unstable on a coarse Euler integrator with ~200 kW lighting
heat input. See the in-file comment block for the derivation.

VPD is clamped to [0, 6] kPa with `isFinite` fall-through; indoor temp to
[−20, 140] °F per substep. Defense in depth against future regressions.

## Tabs

1. **Build sheet** — procurement-grade BOM with fixtures, branch circuits,
   amperage, electrical compliance flags
2. **Optimized system** — recommendations with apply-this-suggestion CTAs
3. **Cultivation science** — yield, pathogen, crop steering panel
4. **Live simulation** — full 3D scene + 24h dynamics chart + clock
   controls
5. **Annual DLI** — outdoor / greenhouse / shaded / flower-window DLI
6. **Supplemental light** — monthly PPFD gap, installed kW, fixture count
7. **LED vs HPS** — efficacy, energy, heat, voltage compatibility
8. **Under-canopy** — real PPFD/DLI delivered to lower canopy
9. **CO₂** — feasibility, recommended DLI/PPFD ranges by setpoint
10. **Shade tradeoff** — DLI loss vs cooling benefit
11. **Humidity / wet-bulb** — wet-bulb + dew-point + VPD vs flower targets
12. **HVAC screening** — cooling tons, dehumidification pints/day
13. **Seasonal calendar** — per-month strategy bullets

## License

MIT. Use it. Fork it. Calibrate it for your facility. The science citations
in [`CITATIONS.md`](./CITATIONS.md) are public; the implementation is yours
to copy.

## What this model is **not**

- Not a stamped HVAC design
- Not a full crop simulation (no leaf-level photosynthesis ODE)
- Not a replacement for PAR sensor mapping at canopy
- Not a replacement for greenhouse engineering
- Not a guarantee of cannabis yield or quality

Outputs are screening-level. Every number is decision-support, not a
specification. Validate against measured data + stamped engineering before
any capex commitment.

## Status

- TypeScript compile: clean
- Vitest: **128/128 tests pass**
- Vite production build: succeeds
- Live demo: `npm run dev` → <http://localhost:5180>

## Acknowledgments

Built solo by Alex Buckner Claiborne with Claude Opus 4.7 (Anthropic) as
a paired-coding agent. The AI workflow itself draws on coursework from
MIT (CSAIL, BCS, Sloan) — the foundations of how language models,
optimization, and human-AI collaboration actually work.
