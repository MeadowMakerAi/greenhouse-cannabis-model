# Citations & Acknowledgments

This greenhouse model is a synthesis of peer-reviewed plant science, greenhouse engineering standards, atmospheric physics, and open climate data. Every coefficient, equation, and model parameter traces to a citable source — no fabricated numbers. The list below names every institution and reference that the model leans on.

---

## Cannabis plant physiology & yield

**University of Guelph** — Rodriguez-Morrison, Llewellyn & Zheng (2021). *Cannabis yield, potency, and leaf photosynthesis respond differently to increasing light levels in an indoor environment.* Frontiers in Plant Science.
- Linear yield → DLI relationship up to ≈ 70 mol/m²/d, used as the baseline in `yieldModel.ts`.

**University of Mississippi (National Center for Natural Products Research)** — Chandra et al. (2008). *Photosynthetic response of Cannabis sativa L. to variations in photosynthetic photon flux densities, temperature and CO₂ conditions.* Physiology and Molecular Biology of Plants.
- Leaf-level Pn temperature optimum ≈ 30 °C / 86 °F. Drives `tempFactor` in `plantGrowthModel.ts` and the Topt bell in `yieldModel.ts`.
- CO₂ enrichment Pn boost coefficients used in `co2Model.ts` (`co2YieldMultiplier`).

**University of Illinois (FACE consortium)** — Ainsworth, E.A. & Long, S.P. (2005). *What have we learned from 15 years of free-air CO₂ enrichment (FACE)? A meta-analytic review of the responses of photosynthesis, canopy properties and plant production to rising CO₂.* New Phytologist 165(2): 351–372.
- Stomatal-conductance response to elevated CO₂ in C3 crops (~20% reduction at ~550 ppm vs. ~370 ppm ambient, monotonic to ~30–35% at 1200–1500 ppm). Basis for `co2StomatalFactor` in `co2Model.ts`. Net whole-canopy transpiration response is more muted than leaf-level gs because of partially compensating LAI; our coefficient table is the conservative whole-canopy figure used by `dehumidificationModel.ts` and the latent-load term in `heatLoadModel.ts`.
- The coefficient table represents a DAILY-AGGREGATE, WHOLE-CANOPY reduction (already photoperiod-weighted in the FACE empirical fit). Seasonal/monthly aggregates apply it directly. **Known gap:** the per-tick live-tick humidity model in `useLiveDynamics.ts` does NOT yet apply this factor — sub-daily application would need lights-on gating and the moisture balance moved inside the substepped Euler loop (a Plan Mode change). Filed as a follow-up.
- Open-vented and moderate-vented operation gate the factor (CO₂ cannot be physically held at the canopy under high ventilation rates), consistent with the feasibility model in `evaluateCO2`.

---

## Greenhouse climate engineering

**Wageningen University & Research (Netherlands)** — Bot, G.P.A. (1983). *Greenhouse climate: from physical processes to a dynamic model.* Agricultural University Wageningen, PhD thesis.
- The "KASPRO" lineage of greenhouse climate models. Underpins the energy-balance step in `simulationModel.ts > indoorTempStep` and the natural-ventilation framework.

**ASABE (American Society of Agricultural and Biological Engineers)** — ANSI/ASAE EP406.4 (R2018). *Heating, ventilating and cooling greenhouses.*
- Stack-effect ventilation formula (§6.2) implemented in `naturalVentilationCFM`. Discharge coefficient Cd = 0.65, paired-vent harmonic mean for effective area, ΔH between vent centers.

**ASHRAE (American Society of Heating, Refrigerating and Air-Conditioning Engineers)** — Handbook of Fundamentals, Chapter 16 (Ventilation and Infiltration).
- Buoyancy-driven flow framework, sensible-heat ventilation factor (1.08 BTU/hr·CFM·°F).
- ASHRAE 1% / 99% design conditions referenced in `fallbackMontgomeryClimate.ts`.

**UMass Center for Agriculture, Food & the Environment** — *Greenhouse Best Management Practices: Energy Curtains.*
- Thermal-screen night U-value 30–50% reduction; gutter-to-gutter (not above-truss) installation modeled in `Greenhouse3D` and noted in `AssumptionPanel`.

**Ludvig Svensson** — Manufacturer technical specs for thermal screens / shade cloth.
- Reference for screen transmission coefficients and deployment patterns.

---

## Psychrometrics & vapor pressure

**Tetens (1930) / Magnus formula** — *Über einige meteorologische Begriffe.* Zeitschrift für Geophysik. Modern form: August-Roche-Magnus.
- `saturationVaporPressureKPa` in `psychrometricModel.ts`.

**Stull, R. (2011)** *Wet-bulb temperature from relative humidity and air temperature.* Journal of Applied Meteorology and Climatology, 50(11). University of British Columbia.
- `wetBulbCStull` in `psychrometricModel.ts` (~0.3 °C accuracy).

---

## Pathogen pressure modeling

**Pennsylvania State University Extension** — *Botrytis blight (gray mold) fact sheets.*
**University of Massachusetts Extension** — *Powdery mildew fact sheets.*
**Punja, Z.K. & Lung, S.** (cannabis pathology research, Simon Fraser University) — *Pathogens and molds affecting cannabis production.*
- Threshold definitions and risk bands in `pathogenModel.ts`.

---

## Solar geometry & atmospheric scattering

**Hosek, L. & Wilkie, A. (2012)** *An Analytic Model for Full Spectral Sky-Dome Radiance.* Charles University, Prague — used by the drei `<Sky />` component for atmospheric scattering in the live 3D scene.

**Spencer, J.W. (1971)** — Fourier-series solar declination approximation, used in `simulationModel.ts > sunPositionAt` for sub-day sun position.

**Helland, T. (2012)** — *How to Convert Temperature (K) to RGB.* Open algorithm used in `kelvinModel.ts` for warm-to-cool sun color shift across the day.

---

## Climate data sources

**NASA POWER (Prediction Of Worldwide Energy Resources)** — Goddard Space Flight Center.
- `services/nasaPowerClient.ts`: long-term monthly climatology (T, RH, dew-point, shortwave radiation in MJ/m²/day) for any global lat/lon.

**Open-Meteo** — open-source weather aggregator built on ECMWF, NOAA, JMA reanalysis data.
- `services/openMeteoClient.ts`: historical hourly fallback for stations outside POWER coverage gaps.

**National Weather Service (NOAA)** — `services/nwsClient.ts`: station metadata + design conditions for U.S. sites.

---

## Crop steering & cultivation reference

**Growlink, TSRGrow, Athena Agriculture** — industry-standard crop steering frameworks (vegetative ↔ generative VPD/EC bands). Not peer-reviewed but in commercial use and published in technical bulletins. Bands referenced in `cropSteeringModel.ts`.

---

## Software science / rendering

**React Three Fiber** + **drei** + **@react-three/postprocessing** (Poimandres) — open-source R3F ecosystem.
**ACES Filmic Tone Mapping** — Academy Color Encoding System reference implementation.
**three.js** — Mr.doob, Ricardo Cabello et al.

---

## Soil & site

**ISRIC — World Soil Information** — Poggio, L., de Sousa, L.M., Batjes, N.H., Heuvelink, G.B.M., Kempen, B., Ribeiro, E. & Rossiter, D. (2021). *SoilGrids 2.0: producing soil information for the globe with quantified spatial uncertainty.* SOIL, 7, 217–240. DOI: 10.5194/soil-7-217-2021.
- Global digital soil map at 250 m. Source for the static soil profile (pH, organic carbon, sand/silt/clay, CEC, bulk density) in `soilClient.ts`. Each property is decoded with the layer's own `d_factor` reported by the API — no hard-coded scaling. Screening-level: a model surface, not a field soil test.

**USDA Natural Resources Conservation Service (NRCS)** — *Soil Survey Manual* (USDA Handbook No. 18), soil textural classes and the texture triangle.
- The 12-class texture triangle implemented in `usdaTextureClass()` (`soilModel.ts`). Boundaries are definitional (a classification standard), not an empirical coefficient.

**Penn State Extension** — *Industrial Hemp Production* agronomy guidance (verified 2026-06: "best adapted to well-drained soil with a pH between 6.0 and 7.0").
- Basis for the pH comfort-band readout in `SoilPanel.tsx`. Corroborated by Oklahoma State Extension (~6–7.5) and University of Kentucky (~6.4).

---

## Acknowledgments

Built solo by **Alex Buckner Claiborne** (alexbcl@mit.edu / @alxclaiborne) using **Claude Opus 4.7 (Anthropic)** as a paired-coding agent. Roughly 70 source files, 128 unit tests, ~9k LOC. Every model parameter and coefficient was verified live against the source above — no values pulled from training data.

The AI-paired coding workflow itself draws on coursework and research culture from **MIT** (CSAIL, BCS, Sloan), where I learned the foundations of how language models, optimization, and human-AI collaboration actually work.
