# Spec-Ingestion Golden Set — extraction QA runbook

Sage's spec→sim extraction is LLM-driven, so it can't be gated in CI like the
pure math (which IS unit-tested — see `src/tests/scenarioAdvisor.test.ts`).
This runbook makes extraction quality **measurable**: run each case through the
live chat after any prompt/model change and score against the expected patch.

**Pass bar:** every `expected` field applied via `set_scenario` with the right
value; every `must_flag` item named in Sage's have/missing/conflict summary;
**zero invented values** (a field the spec doesn't state must be flagged
missing, never guessed — ZERO-FABRICATION).

---

## Case 1 — clean paste, no lights (the Alex scenario)

**Input (paste into chat):**

> Gothic-arch greenhouse, 120' x 60', 10' gutters, 18' peak. Double-poly
> inflated roof. Natural gas unit heaters, 750,000 BTU total. Located in
> Montgomery NY. 400A 3-phase 480V service. No lighting installed yet.

**Expected `set_scenario` patch:**

| field | value |
|---|---|
| greenhouseLengthFt | 120 |
| greenhouseWidthFt | 60 |
| eaveHeightFt | 10 |
| peakHeightFt | 18 |
| envelope.baseTransmissionPct | 70 (double poly, per prompt table) |
| envelopeUValueBTUhrFtF | 0.7 (double poly) |
| radiantHeatingCapacityBTUhr | 750000 |

**Must flag:** no fixtures → must offer `recommend_lighting` and confirm the
target assumption ("~1000 PPFD / DLI ~40 for indoor-quality flower?") before
proposing. Must NOT invent an electricity rate or canopy area.

## Case 2 — messy email fragment, partial + conflicting

**Input:**

> fwd from the builder: "…poly house is 96x30, sidewall 8ft… we'll run your
> CO2 burner off the same gas line. vents on both sidewalls stay automatic…"
> also I have 12 Gavita 1700e already

**Expected:** dims applied (96/30/8); `set_active_fixture` or fixture noted =
gavitaPro1700eLED. **Must flag:** CO₂ + vented house conflict (enrichment
vents away); peak height not stated (must ask, not assume); 12 fixtures vs
required count for any stated target (12 is likely undersized for 2880 ft² —
quote the PPFD gap from real sizing, don't hand-wave).

## Case 3 — fixture datasheet only (image/PDF)

**Input:** any LED datasheet PDF/image (e.g. PPF 1870 µmol/s, 645 W, 120-277 V).

**Expected:** `add_custom_fixture` with wattsPerFixture=645, ppf_umol_s=1870,
type=LED, voltage range as stated. PPE auto-derives (≈2.9) — Sage must not
state a PPE the datasheet doesn't imply. **Must flag:** greenhouse itself still
at defaults (dimensions, glazing, location) via `assess_completeness`.

## Case 4 — benched proforma with rolling benches (the Huifa anchor)

**Input (paste into chat):**

> Huifa 90 x 120 greenhouse proforma. Gutter-connect, 12' gutters, 16' peak,
> double-poly. 36 rolling benches, 5' x 40' each, ebb-and-flow, on a single
> movable aisle system. Gavita 1700e LED throughout with a Growlink controller.
> Montgomery NY.

**Expected `set_scenario` patch:**

| field | value |
|---|---|
| greenhouseLengthFt | 120 |
| greenhouseWidthFt | 90 |
| eaveHeightFt | 12 |
| peakHeightFt | 16 |
| layoutMode | "benched" |
| benchType | "rolling" |
| benchWidthFt | 5 |
| benchLengthFt | 40 |
| benchAisleWidthFt | (from spec if stated, else default 3) |
| lightingControllerCapable | true (Growlink controller + dimmable Gavita) |

**Must NOT set** `canopyAreaSqFt` — it derives from the benches. **Must flag:**
run `assess_completeness` and reconcile the stated **36 benches** against what
actually fits the 120×90 footprint at 5×40 + aisles; if the solver's bench
count differs from 36, say so (spec may assume tighter aisles or multi-bay).
Canopy = bench tops (36 × 5 × 40 = 7,200 ft² if all fit). Dynamic trim is ON
(dimmable + controller) — note the supplemental lights dim to fill the gap.

## Case 5 — fixed benches, aisle per row

**Input:**

> 30x96 poly house, 8ft sidewall. Rolling? No — fixed rock-wool benches, 4ft
> wide, 3ft aisle between every bench, running the length of the house.

**Expected:** `layoutMode: "benched"`, `benchType: "fixed"`, `benchWidthFt: 4`,
`benchAisleWidthFt: 3`, `benchOrientation: "length-run"`. **Must flag:** fixed
benches burn an aisle between every row — quote the canopy a **rolling** system
would recover in the same footprint (one shared aisle), since that's the cheap
density win. Peak height not stated → ask, don't assume.

## Case 6 — open floor, non-dimmable HPS on a timer

**Input:**

> 40x100 house, plants straight on the floor in fabric pots, no benches. 600W
> DE HPS on a mechanical time clock, 208V. No dimming.

**Expected:** dims applied (100/40); `layoutMode` stays "open" (no benches →
canopy is the typed/derived-from-floor value, NOT bench-derived); fixture = a
DE HPS; `lightingControllerCapable: false`. **Must flag:** HPS isn't dimmable
AND it's on a dumb timer → **no dynamic trim**, lights run full power the whole
photoperiod and waste bright-hour surplus as heat. Quote what dimmable LEDs +
a controller would save (energy + cooling). This is the "why is my electric so
high" case.

---

Add a case whenever a real ingestion fails: paste the exact input, write the
expected patch, and note what went wrong. The set grows from real failures,
not hypotheticals.
