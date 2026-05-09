# Montgomery NY Greenhouse Cannabis Light + Climate Model

Screening-level decision-support tool for evaluating year-round greenhouse
flower production at **170 Neely Road, Montgomery, NY**. Built as an
interactive React dashboard.

This is an **engineering planning model**, not a stamped HVAC design or a
crop simulation. It is meant to make assumptions visible, comparable, and
edit-in-place so an operator and designer can argue from the same numbers.

## Run

```bash
npm install
npm run dev          # start the dashboard on Vite
npm test             # vitest run for model unit tests
npm run build        # type-check + production bundle
```

Default scenario: `Premium Hybrid Greenhouse — Montgomery NY`. Switch
scenarios with the preset buttons in the header (Low-Capex HPS, Sealed
CO₂, Solar-First).

## What the model answers

1. How much natural light reaches canopy each month?
2. How much supplemental overhead PPFD is needed to hit a chosen DLI target?
3. How does under-canopy lighting change total photon delivery and
   lower-canopy morphology support?
4. How do LED vs HPS choices affect installed kW, heat load, and operating
   cost?
5. How does shade cloth reduce solar gain — and at what DLI cost?
6. When does outdoor wet-bulb / dew-point make evaporative cooling
   ineffective?
7. How much mechanical cooling and dehumidification are implied?
8. How do CO₂ targets shift recommended DLI / PPFD ranges?
9. What is the best seasonal operating strategy?

## Data sources

* **NASA POWER** monthly climatology (`ALLSKY_SFC_SW_DWN`, `T2M`, `T2M_MIN`,
  `T2M_MAX`, `RH2M`, `T2MDEW`). Loaded automatically on first render; falls
  back silently if unreachable.
* **Open-Meteo Historical Weather API** as a backup, aggregated over the
  last 11 reference years.
* **NWS API** (`api.weather.gov`) for forecast-office / observation-station
  metadata only.
* **Fallback monthly normals** for Orange County / Stewart Field, blended
  from public NOAA normals and TMY3 reanalysis. Marked as planning data
  only — replace before any engineering decision.

The active source and last-loaded message are shown in the assumption
panel; you can force-switch between providers.

## Coordinate handling

Default lat/lon for 170 Neely Rd is approximate and labelled
`"Approximate — verify before engineering use"`. Override the value
directly in the assumption panel; climate refresh uses the latest values.

## Equations and key conversions

```text
DLI [mol/m²/d] = PPFD [µmol/m²/s] · photoperiod [hr] · 0.0036
PPFD            = DLI / (photoperiod · 0.0036)

Outdoor PAR DLI ≈ shortwave kWh/m²/d · 7.35 mol PAR / kWh    (range 6.8–8.0)

Net canopy transmission =
  glazing% · roof% · (1 − structure%) · (1 − soiling%) · (1 − obstruction%)

Required photon flux µmol/s = supplemental PPFD · canopy m²
Electrical watts             = photon flux / (PPE · optical utilization)
Lighting heat (BTU/hr)       = installed kW · 3412.142

Saturation vapor pressure (kPa) = 0.6108 · exp((17.27·T) / (T + 237.3))
VPD = SVP(leafC) − SVP(airC) · RH%/100

Wet-bulb (Stull 2011 approximation) — accurate to ~0.3 °C at typical RH.

Evaporative supply = T_dry − efficiency · (T_dry − T_wet)
Cooling tons       = total cooling BTU/hr / 12000
```

## Important caveats

* No measured PAR sensor data, no real envelope drawings, no fixture
  photometric files. Replace every number with measured values before
  using this for engineering procurement.
* Hourly partitioning of monthly DLI into the flowering window uses a
  sinusoidal day-length model — accurate enough for screening, not for
  control-strategy simulation.
* The HVAC and dehumidification estimates are screening-level. They do
  not substitute for a stamped engineering design that includes design-
  day weather, real airflow, crop density, and equipment specifications.
* CO₂ enrichment is treated as a feasibility / target-range question,
  not as a yield boost. The model deliberately refuses to translate CO₂
  into estimated yield uplift.

## Architecture

```text
src/
  components/      Dashboard layout, tabs, charts, assumption panel
  context/         Scenario state + memoized derived calculations
  data/            Editable defaults — crop targets, fixture library,
                   greenhouse defaults, fallback climate
  models/          Pure, unit-tested calculation functions
  services/        NASA POWER, Open-Meteo, NWS clients
  utils/           Unit conversions, formatting, math
  tests/           Vitest unit tests for the model layer
```

All meaningful constants live in `data/` — no hidden defaults inside
chart components. Calculations are pure functions in `models/` and have
unit tests in `tests/`.

## Tabs

1. **Annual DLI** — outdoor / greenhouse / shaded / flower-window DLI
   with 30/40/50 reference bands.
2. **Supplemental light** — monthly PPFD gap, installed kW, LED vs HPS
   comparison cards with annual energy and peak heat load.
3. **Under-canopy** — separate lower-canopy DLI, heat load, kW, and a
   morphology support score (0–3).
4. **CO₂** — feasibility, recommended DLI/PPFD ranges by setpoint,
   ventilation conflict warnings, monthly operating windows.
5. **Shade tradeoff** — DLI loss vs cooling benefit, supplemental PPFD
   penalty, active-month chips.
6. **Humidity / wet-bulb** — wet-bulb and dew-point profile against
   60/68 °F risk thresholds; VPD vs flower targets.
7. **HVAC screening** — cooling tons, dehumidification pints/day,
   evaporative supply temperature, evap-failure months.
8. **Seasonal calendar** — per-month strategy bullets and surfaced
   warnings.

## Status

* TypeScript compile: clean.
* Vitest: 36 tests across DLI, fixture, psychrometric, evap cooling,
  photoperiod, CO₂, and solar models.
* Vite production build: succeeds.
* Dev server starts and serves all routes 200; live in-browser interaction
  was not verified by Claude — confirm panels render the first time you
  launch.

## What this model is **not**

* Not a stamped HVAC design.
* Not a full crop simulation.
* Not a replacement for PAR sensor mapping.
* Not a replacement for greenhouse engineering.
* Not a guarantee of cannabis yield or quality.
