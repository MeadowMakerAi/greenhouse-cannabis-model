# Citations & Acknowledgments

This greenhouse model is a synthesis of peer-reviewed plant science, greenhouse engineering standards, atmospheric physics, and open climate data. Every coefficient, equation, and model parameter traces to a citable source — no fabricated numbers. The list below names every institution and reference that the model leans on.

---

## Cannabis plant physiology & yield

**University of Guelph** — Rodriguez-Morrison, Llewellyn & Zheng (2021). *Cannabis yield, potency, and leaf photosynthesis respond differently to increasing light levels in an indoor environment.* Frontiers in Plant Science.
- Linear yield → DLI relationship up to ≈ 70 mol/m²/d, used as the baseline in `yieldModel.ts`.

**University of Mississippi (National Center for Natural Products Research)** — Chandra et al. (2008). *Photosynthetic response of Cannabis sativa L. to variations in photosynthetic photon flux densities, temperature and CO₂ conditions.* Physiology and Molecular Biology of Plants.
- Leaf-level Pn temperature optimum ≈ 30 °C / 86 °F. Drives `tempFactor` in `plantGrowthModel.ts` and the Topt bell in `yieldModel.ts`.
- CO₂ enrichment Pn boost coefficients used in `co2Model.ts`.

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

## Acknowledgments

Built solo by **Alex Buckner Claiborne** (alexbcl@mit.edu / @alxclaiborne) using **Claude Opus 4.7 (Anthropic)** as a paired-coding agent. Roughly 70 source files, 128 unit tests, ~9k LOC. Every model parameter and coefficient was verified live against the source above — no values pulled from training data.

The AI-paired coding workflow itself draws on coursework and research culture from **MIT** (CSAIL, BCS, Sloan), where I learned the foundations of how language models, optimization, and human-AI collaboration actually work.
