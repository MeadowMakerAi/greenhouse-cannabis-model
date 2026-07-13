import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { fixtureKWFromPPFD } from "../models/fixtureModel";
import { generateRecommendations, type FixtureCostRow } from "../models/optimizationModel";
import { DAYS_IN_MONTH, MONTH_NAMES, fmt1, fmtCurrency, fmtInt } from "../utils/formatting";
import GreenhousePlanView from "./GreenhousePlanView";
import Greenhouse3D from "./Greenhouse3DLazy";
import { useState } from "react";

const DEHUM_UNIT_CAPACITY_PINTS_DAY = 200; // representative commercial unit (e.g. Anden A210)
const DEHUM_UNIT_NAME = "200-pint/day commercial unit (e.g. Anden A210 class)";

interface RowProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
}

function Row({ label, value, hint }: RowProps) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-baseline gap-3 border-b border-ink-300/20 py-1.5">
      <div className="text-xs uppercase tracking-wide text-ink-500">{label}</div>
      <div>
        <div className="font-mono text-sm text-ink-900">{value}</div>
        {hint && <div className="text-[11px] text-ink-500">{hint}</div>}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  badge,
  hint,
}: {
  title: string;
  badge?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <span>{title}</span>
        {badge && <span className="tag tag-muted">{badge}</span>}
      </div>
      {hint && (
        <p className="px-4 pt-2 text-[11px] leading-snug text-ink-500">{hint}</p>
      )}
      <div className="card-body py-1">{children}</div>
    </div>
  );
}

export default function BuildSheet() {
  const { inputs, climate, customFixtures } = useScenario();
  const all = useAllFixtures();
  const d = useDerived();

  // Compute the optimal fixture (same logic as Optimized System tab)
  const fixtureCosts: FixtureCostRow[] = Object.values(all).map((f) => {
    let kwh = 0;
    let cost = 0;
    let peakKW = 0;
    let peakFixtures = 0;
    d.months.forEach((m, idx) => {
      const sized = fixtureKWFromPPFD({
        supplementalPPFDRequired: m.supplementalPPFDRequired,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        fixture: f,
        photoperiodHours: inputs.flowerPhotoperiodHours,
        electricityRatePerKwh: inputs.electricityRatePerKwh,
        daysInMonth: DAYS_IN_MONTH[idx],
      });
      kwh += sized.monthlyKwh;
      cost += sized.monthlyCostUSD;
      peakKW = Math.max(peakKW, sized.installedKW);
      peakFixtures = Math.max(peakFixtures, sized.fixtureCount);
    });
    return { id: f.id, fixture: f, annualCostUSD: cost, annualKwh: kwh, peakKW, peakFixtures };
  });

  const sortedFixtures = [...fixtureCosts].sort((a, b) => {
    const costDiff = a.annualCostUSD - b.annualCostUSD;
    const denom = Math.max(a.annualCostUSD, b.annualCostUSD);
    if (denom > 0 && Math.abs(costDiff) / denom < 0.01) {
      if (a.fixture.source === "vendor-verified" && b.fixture.source !== "vendor-verified") return -1;
      if (b.fixture.source === "vendor-verified" && a.fixture.source !== "vendor-verified") return 1;
    }
    return costDiff;
  });
  const optimal = sortedFixtures[0];

  // Re-size with the *optimal* fixture so the build sheet shows what to actually procure
  let optInstalledKW = 0;
  let optFixtureCount = 0;
  let optAnnualKwh = 0;
  let optAnnualCost = 0;
  let optAmpsTotal240 = 0;
  let optAmpsTotal120 = 0;
  let optCircuits20A_240 = 0;
  let optCircuits20A_120 = 0;
  let optCircuits30A_240 = 0;
  d.months.forEach((m, idx) => {
    if (!optimal) return;
    const sized = fixtureKWFromPPFD({
      supplementalPPFDRequired: m.supplementalPPFDRequired,
      canopyAreaSqFt: inputs.canopyAreaSqFt,
      fixture: optimal.fixture,
      photoperiodHours: inputs.flowerPhotoperiodHours,
      electricityRatePerKwh: inputs.electricityRatePerKwh,
      daysInMonth: DAYS_IN_MONTH[idx],
    });
    optInstalledKW = Math.max(optInstalledKW, sized.installedKW);
    optFixtureCount = Math.max(optFixtureCount, sized.fixtureCount);
    optAnnualKwh += sized.monthlyKwh;
    optAnnualCost += sized.monthlyCostUSD;
    if (sized.supports240V) {
      optAmpsTotal240 = Math.max(optAmpsTotal240, sized.totalAmps240V);
      optCircuits20A_240 = Math.max(optCircuits20A_240, sized.circuits20A_240V);
      optCircuits30A_240 = Math.max(optCircuits30A_240, sized.circuits30A_240V);
    }
    if (sized.supports120V) {
      optAmpsTotal120 = Math.max(optAmpsTotal120, sized.totalAmps120V);
      optCircuits20A_120 = Math.max(optCircuits20A_120, sized.circuits20A_120V);
    }
  });

  const optCoveragePerFixture =
    optFixtureCount > 0 ? inputs.canopyAreaSqFt / optFixtureCount : 0;
  const optGridSpacing = optCoveragePerFixture > 0 ? Math.sqrt(optCoveragePerFixture) : 0;
  const optDensityPer100 =
    inputs.canopyAreaSqFt > 0 ? (optFixtureCount / inputs.canopyAreaSqFt) * 100 : 0;
  const optWattsPerSqFt =
    inputs.canopyAreaSqFt > 0 ? (optInstalledKW * 1000) / inputs.canopyAreaSqFt : 0;

  // Dehumidifier unit count
  const peakPintsPerDay = Math.max(...d.months.map((m) => m.dehumidPintsPerDay));
  const dehumUnitCount = Math.ceil(peakPintsPerDay / DEHUM_UNIT_CAPACITY_PINTS_DAY);
  const annualDehumKwh = d.months.reduce(
    (a, m) => a + m.dehumidKwhPerDay * 30,
    0,
  );

  // Cooling tonnage with 15% margin
  const peakCoolingBTUhr = Math.max(...d.months.map((m) => m.totalCoolingBTUhr));
  const recommendedCoolingTons = Math.ceil((peakCoolingBTUhr * 1.15) / 12000);

  // Heating capacity with 15% margin
  const recommendedHeatingBTUhr =
    d.peakNetHeatingLoad > 0 ? Math.ceil((d.peakNetHeatingLoad * 1.15) / 1000) * 1000 : 0;

  // Shade active months
  const shadeActiveMonths = d.months
    .filter((m) => m.shadeActive)
    .map((m) => m.monthLabel)
    .join(", ");

  // Recommendations for warnings
  const recs = generateRecommendations({
    fixtureCosts,
    currentFixtureId: inputs.fixtureId,
    currentAnnualCostUSD:
      fixtureCosts.find((r) => r.id === inputs.fixtureId)?.annualCostUSD ?? 0,
    targetDLI: d.target.targetDLI,
    highHumidityMonths: d.months.filter((m) => m.highHumidityRisk).length,
    ventilationMode: inputs.ventilationMode,
    co2Enabled: inputs.co2Enabled,
    co2SetpointPpm: inputs.co2SetpointPpm,
    shadeEnabled: inputs.shadeEnabled,
    shadeDeployMode: inputs.shadeDeployMode,
    peakSupplementalPPFD: Math.max(...d.months.map((m) => m.supplementalPPFDRequired)),
    targetTopCanopyPPFD: d.target.targetTopCanopyPPFD,
    peakNetHeatingLoadBTUhr: d.peakNetHeatingLoad,
    installedRadiantCapacityBTUhr: inputs.radiantHeatingCapacityBTUhr,
    envelopeUValueBTUhrFtF: inputs.envelopeUValueBTUhrFtF,
    annualHeatingFuelMMBtu: d.annualHeatingFuelMMBtu,
    peakCoolingBTUhr,
    evapCoolingEnabled: inputs.evapCoolingEnabled,
    evapEfficiencyPct: inputs.evapEfficiencyPct,
    evapFailureMonths: d.months.filter((m) => !m.evapReachesTarget).length,
    peakDehumidPintsPerDay: peakPintsPerDay,
    dehumidEfficiencyPintsPerKwh: inputs.dehumidifierEfficiencyPintsPerKwh,
    indoorTargetDryBulbF: inputs.indoorTargetDryBulbF,
  });
  const recCO2 = recs.find((r) => r.id === "co2-enable");

  void MONTH_NAMES;
  void customFixtures;

  return (
    <div className="space-y-3">
      <div className="card border-leaf-500/40 bg-leaf-500/[0.03]">
        <div className="card-header">
          <span>Build sheet · optimized stack for current targets</span>
          <span className="tag tag-info">Procurement-ready</span>
        </div>
        <div className="card-body">
          <p className="text-sm text-ink-700">
            Single-page summary of what to actually buy and install. Numbers are derived from your current canopy, DLI target, climate, electrical service, and the fixture optimization. Edit assumptions in the sidebar; this page reflows automatically. The visualizations below are schematic — they scale to your inputs but are not architectural drawings.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="Site" badge={climate.source}>
          <Row label="Address" value={inputs.siteAddress} />
          <Row
            label="Coordinates"
            value={`${inputs.latitude.toFixed(6)}, ${inputs.longitude.toFixed(6)}`}
            hint={inputs.coordinateStatus}
          />
          <Row label="Elevation" value={`${inputs.elevationFt} ft`} />
          <Row label="Weather anchor" value={inputs.weatherStation} />
          <Row label="Climate source" value={climate.message} />
        </Section>

        <Section title="Cultivation target">
          <Row
            label="DLI target"
            value={`${d.target.targetDLI} mol/m²/d · ${fmtInt(d.target.targetTopCanopyPPFD)} PPFD`}
            hint={d.target.label}
          />
          <Row
            label="Photoperiod"
            value={`${inputs.flowerPhotoperiodHours} h · ${inputs.flowerWindowStartHr}:00 → ${inputs.flowerWindowEndHr}:00`}
          />
          <Row label="Crop stage" value={inputs.cropStage} />
          <Row label="Blackout curtains" value={inputs.blackoutEnabled ? "Yes" : "No"} />
        </Section>

        <Section title="Greenhouse geometry">
          <Row
            label="Canopy area"
            value={`${fmtInt(inputs.canopyAreaSqFt)} ft² · ${fmt1(inputs.canopyAreaSqFt / 10.7639)} m²`}
            hint="Active flowering footprint"
          />
          <Row
            label="Floor area"
            value={`${fmtInt(inputs.greenhouseFloorAreaSqFt)} ft²`}
            hint="Including aisles + equipment zones"
          />
          <Row
            label="Envelope area"
            value={`${fmtInt(inputs.greenhouseEnvelopeAreaSqFt)} ft²`}
            hint="Roof + sidewall skin"
          />
          <Row
            label="Volume"
            value={`${fmtInt(inputs.greenhouseVolumeCuFt)} ft³`}
          />
        </Section>

        <Section title="Envelope">
          <Row
            label="Net transmission"
            value={`${(d.transmission * 100).toFixed(0)}%`}
            hint="Outdoor PAR → canopy after glazing, structure, soiling, obstruction"
          />
          <Row
            label="Glazing"
            value={`${inputs.envelope.baseTransmissionPct}% material × ${inputs.envelope.roofTransmissionPct}% roof factor`}
          />
          <Row
            label="U-value"
            value={`${inputs.envelopeUValueBTUhrFtF.toFixed(2)} BTU/hr·ft²·°F`}
            hint={
              inputs.envelopeUValueBTUhrFtF >= 1.0
                ? "Single-layer poly or glass — heat-loss heavy"
                : "Double-layer / thermal-screen retrofit"
            }
          />
        </Section>
      </div>

      <Section
        title={`Lighting · OPTIMAL FIXTURE (${optimal?.fixture.source ?? "-"})`}
        badge={optimal?.fixture.vendor ?? "preset"}
      >
        {optimal && (
          <>
            <Row
              label="Fixture model"
              value={
                <strong>
                  {optimal.fixture.vendor ? `${optimal.fixture.vendor} ${optimal.fixture.model}` : optimal.fixture.label}
                </strong>
              }
              hint={optimal.fixture.notes}
            />
            <Row
              label="Quantity"
              value={
                <strong>
                  {fmtInt(optFixtureCount)} fixtures
                </strong>
              }
              hint={`${optimal.fixture.wattsPerFixture} W each · ${optimal.fixture.ppe.toFixed(2)} µmol/J`}
            />
            <Row
              label="Total installed"
              value={`${fmt1(optInstalledKW)} kW · ${fmt1(optWattsPerSqFt)} W/ft² · ${fmt1(optWattsPerSqFt * 10.7639)} W/m²`}
            />
            <Row
              label="Layout"
              value={`1 fixture per ${fmt1(optCoveragePerFixture)} ft² · ${fmt1(optGridSpacing)}′ square grid · ${fmt1(optDensityPer100)} per 100 ft²`}
              hint="Square-grid edge length; rectangular layouts (e.g., 4×6′) work too"
            />
            <Row
              label="Driver voltage"
              value={`${optimal.fixture.minVoltage}–${optimal.fixture.maxVoltage}V · PF ${(optimal.fixture.powerFactor ?? 0.95).toFixed(2)}`}
              hint={
                optimal.fixture.minVoltage > 120
                  ? "⚠ NOT compatible with 120V branches — plan dedicated 240V circuits"
                  : "Compatible with both 120V and 240V branches"
              }
            />
            <Row
              label="Branch @ 240V"
              value={
                optimal.fixture.minVoltage <= 240 && optimal.fixture.maxVoltage >= 240
                  ? `${fmt1(optAmpsTotal240)} A total · ${optCircuits20A_240} × 20A or ${optCircuits30A_240} × 30A circuits`
                  : "Driver does not support 240V"
              }
            />
            <Row
              label="Branch @ 120V"
              value={
                optimal.fixture.minVoltage <= 120 && optimal.fixture.maxVoltage >= 120
                  ? `${fmt1(optAmpsTotal120)} A total · ${optCircuits20A_120} × 20A circuits`
                  : "Driver does not support 120V — service upgrade or alternate fixture required"
              }
            />
            <Row
              label="Annual energy"
              value={`${fmtInt(optAnnualKwh)} kWh · ${fmtCurrency(optAnnualCost)}/yr @ $${inputs.electricityRatePerKwh.toFixed(2)}/kWh`}
            />
            {optimal.fixture.verifiedSource && (
              <Row
                label="Spec verified"
                value={
                  <a
                    href={optimal.fixture.verifiedSource}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-leaf-600 underline"
                  >
                    {optimal.fixture.verifiedAt} · source
                  </a>
                }
              />
            )}
          </>
        )}
      </Section>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Section title="Under-canopy lighting" badge={inputs.underCanopyEnabled ? "Enabled" : "Disabled"}>
          {inputs.underCanopyEnabled ? (
            <>
              <Row label="UC PPFD at zone" value={`${fmtInt(inputs.underCanopyPPFD)} µmol/m²/s`} />
              <Row label="Coverage" value={`${inputs.underCanopyCoveragePct}% of canopy footprint`} />
              <Row
                label="UC DLI delivered"
                value={`${fmt1(d.months[0]?.underCanopyDLI ?? 0)} mol/m²/d at lit zone`}
              />
              <Row
                label="Whole-plant uplift"
                value={`+${fmt1(d.months[0]?.wholePlantDLIUplift ?? 0)} mol/m²/d (${((d.months[0]?.wholePlantDLIUpliftFraction ?? 0) * 100).toFixed(0)}% of top-canopy)`}
              />
              <Row
                label="UC peak power"
                value={`${fmt1(Math.max(...d.months.map((m) => m.underCanopyKW)))} kW`}
              />
              <Row
                label="UC annual energy"
                value={`${fmtInt(d.months.reduce((a, m) => a + m.underCanopyKwhMonth, 0))} kWh`}
              />
            </>
          ) : (
            <p className="text-sm text-ink-700 px-2 py-2">
              Under-canopy lighting disabled. Lower-canopy bud development relies on natural penetration only.
            </p>
          )}
        </Section>

        <Section title="CO₂ enrichment">
          {inputs.co2Enabled ? (
            <>
              <Row label="Setpoint" value={`${inputs.co2SetpointPpm} ppm`} />
              <Row label="Control mode" value={inputs.co2ControlMode.replace("_", " / ")} />
              <Row label="Ventilation" value={inputs.ventilationMode.replace("_", " ")} />
              <Row
                label="Recommended DLI band"
                value={`${fmt1(d.co2.recommendedDLIRangeMin)}–${fmt1(d.co2.recommendedDLIRangeMax)} mol/m²/d`}
              />
            </>
          ) : recCO2 ? (
            <div className="rounded bg-warn-500/10 p-2 text-sm text-warn-500 mx-2 my-2">
              ⚠ {recCO2.title}: target DLI {d.target.targetDLI} suggests CO₂ enrichment.{" "}
              Recommended: {recCO2.recommendedValue}.
            </div>
          ) : (
            <Row label="Status" value="Disabled" hint="Ambient CO₂ ~420 ppm; sufficient for the current DLI target" />
          )}
        </Section>

        <Section title="Heating">
          <Row
            label="Recommended capacity"
            value={`${fmtInt(recommendedHeatingBTUhr)} BTU/hr (peak load + 15%)`}
            hint={`Peak net heating load: ${fmtInt(d.peakNetHeatingLoad)} BTU/hr`}
          />
          <Row label="Currently specified" value={`${fmtInt(inputs.radiantHeatingCapacityBTUhr)} BTU/hr`} />
          <Row label="Efficiency" value={`${(inputs.radiantEfficiency * 100).toFixed(0)}%`} />
          <Row label="Annual fuel input" value={`${fmt1(d.annualHeatingFuelMMBtu)} MMBtu/yr`} />
          <Row
            label="Lighting heat offset"
            value={`${fmtInt(Math.max(...d.months.map((m) => m.lightingHeatOffsetBTUhr)))} BTU/hr peak`}
            hint="60% of nighttime overhead lighting offsets envelope loss"
          />
        </Section>

        <Section title="Cooling">
          <Row
            label="Recommended capacity"
            value={`${recommendedCoolingTons} tons (peak + 15%)`}
            hint={`Peak load: ${fmt1(peakCoolingBTUhr / 12000)} tons / ${fmtInt(peakCoolingBTUhr)} BTU/hr`}
          />
          <Row
            label="Evap cooling"
            value={`${inputs.evapEfficiencyPct}% pad efficiency · ${inputs.evapCoolingEnabled ? "enabled" : "disabled"}`}
          />
          <Row
            label="Evap-fail months"
            value={
              d.months.filter((m) => !m.evapReachesTarget).length === 0
                ? "None — evap reaches target year-round"
                : d.months
                    .filter((m) => !m.evapReachesTarget)
                    .map((m) => m.monthLabel)
                    .join(", ")
            }
            hint="Months where wet-bulb prevents evap from hitting indoor target"
          />
          <Row
            label="Indoor target temp"
            value={`${inputs.indoorTargetDryBulbF}°F day setpoint`}
          />
        </Section>

        <Section title="Dehumidification">
          <Row
            label="Peak removal"
            value={`${fmtInt(peakPintsPerDay)} pints/day`}
            hint="Worst month of canopy transpiration vs ventilation moisture removal"
          />
          <Row
            label="Recommended units"
            value={
              <strong>
                {dehumUnitCount} × {DEHUM_UNIT_NAME}
              </strong>
            }
            hint={`${DEHUM_UNIT_CAPACITY_PINTS_DAY} pints/day per unit assumed; sub other models proportionally`}
          />
          <Row
            label="Unit efficiency"
            value={`${inputs.dehumidifierEfficiencyPintsPerKwh} pints/kWh`}
          />
          <Row
            label="Annual energy"
            value={`${fmtInt(annualDehumKwh)} kWh/yr`}
          />
        </Section>

        <Section title="Shade">
          {inputs.shadeEnabled ? (
            <>
              <Row label="Cloth" value={`${100 - inputs.shadeTransmissionPct}% shade (${inputs.shadeTransmissionPct}% transmission)`} />
              <Row label="Deploy mode" value={inputs.shadeDeployMode.replace("_", " ")} />
              <Row
                label="Active months"
                value={shadeActiveMonths || "Trigger-based — depends on outdoor conditions"}
              />
            </>
          ) : (
            <Row label="Status" value="Disabled" />
          )}
        </Section>

        <Section
          title="Blackout / light-deprivation"
          hint="Motorized opaque curtain system that seals the volume against natural light during the dark phase of the photoperiod. Required for any cannabis flower cycle that doesn't naturally fall into a 12-hr-dark window. Acts as a secondary thermal layer when deployed."
        >
          {inputs.blackoutEnabled ? (
            (() => {
              // Fabric area = horizontal sheet at gutter level + permanent
              // perimeter light-lock skirt (long sidewalls + gable ends).
              const length = inputs.greenhouseLengthFt;
              const width = inputs.greenhouseWidthFt;
              const eave = inputs.eaveHeightFt;
              const horizontalSqFt = length * width;
              const sidewallSqFt = 2 * length * eave;
              const endwallSqFt = 2 * width * eave;
              const fabricSqFt = Math.round(horizontalSqFt + sidewallSqFt + endwallSqFt);
              // Drive: 1 motor per ~5000 sq ft of fabric, minimum 1.
              const driveCount = Math.max(1, Math.ceil(fabricSqFt / 5000));
              // Track: 2 × length (gutter rails) + 2 × width (endwall rails) +
              // bunching allowance (~10 %) for sidewall guide tracks.
              const trackLinearFt = Math.round((2 * length + 2 * width) * 1.1);
              // Cost band: fabric $3.50/sf, motors $2k each, track $25/ft, controls $4k.
              const fabricCost = fabricSqFt * 3.5;
              const motorCost = driveCount * 2000;
              const trackCost = trackLinearFt * 25;
              const controlsCost = 4000;
              const totalLow = Math.round(
                (fabricCost + motorCost + trackCost + controlsCost) * 0.85,
              );
              const totalHigh = Math.round(
                (fabricCost + motorCost + trackCost + controlsCost) * 1.25,
              );
              const modeLabel =
                inputs.blackoutDeployMode === "auto"
                  ? `Auto — follows lights window (close ${inputs.blackoutPreCloseMin} min before lights-off)`
                  : inputs.blackoutDeployMode === "scheduled"
                  ? `Scheduled — close ${inputs.blackoutScheduledCloseHour}:00, open ${inputs.blackoutScheduledOpenHour}:00`
                  : inputs.blackoutDeployMode === "always"
                  ? "Always closed (fully artificial flowering)"
                  : "Disabled (mode override)";
              return (
                <>
                  <Row label="Fabric" value={inputs.blackoutFabricLabel} hint="Industry-standard light-tight blackout. Sub <0.05 % PAR transmission." />
                  <Row label="Deploy mode" value={modeLabel} />
                  <Row
                    label="Fabric area"
                    value={`${fmtInt(fabricSqFt)} ft²`}
                    hint={`${fmtInt(Math.round(horizontalSqFt))} ft² horizontal gutter-to-gutter + ${fmtInt(Math.round(sidewallSqFt))} ft² sidewalls + ${fmtInt(Math.round(endwallSqFt))} ft² endwalls`}
                  />
                  <Row label="Drive motors" value={`${driveCount} (≈1 per 5,000 ft² of fabric)`} />
                  <Row label="Track" value={`${fmtInt(trackLinearFt)} linear ft`} />
                  <Row
                    label="Closed U-value"
                    value={`${inputs.blackoutClosedUValue.toFixed(2)} BTU/hr·ft²·°F`}
                    hint={`Glazing alone is ${inputs.envelopeUValueBTUhrFtF.toFixed(2)}; blackout drops it ~${Math.round((1 - inputs.blackoutClosedUValue / inputs.envelopeUValueBTUhrFtF) * 100)} % when deployed (acts as a thermal layer).`}
                  />
                  <Row
                    label="Capex band"
                    value={`$${fmtInt(totalLow)} – $${fmtInt(totalHigh)}`}
                    hint="Fabric + motors + track + controls. Excludes structural reinforcement (often needed for the gutter rail)."
                  />
                </>
              );
            })()
          ) : (
            <Row label="Status" value="Not specified" hint="Required for cannabis flower outside the natural 12-hr-dark window. Enable in the photoperiod panel." />
          )}
        </Section>

        <Section title="Site electrical service">
          <Row
            label="Service voltage"
            value={`Single-phase ${inputs.serviceVoltagePrimary}/${inputs.serviceVoltageSecondary}V`}
            hint="No 277V or three-phase available without service upgrade"
          />
          <Row label="Branch breaker rating" value={`${inputs.branchCircuitAmps}A`} />
          <Row
            label="Lighting branch demand"
            value={
              optimal && optimal.fixture.minVoltage <= 240 && optimal.fixture.maxVoltage >= 240
                ? `${fmt1(optAmpsTotal240)} A @ 240V over ${optCircuits20A_240} × 20A circuits (or ${optCircuits30A_240} × 30A)`
                : "—"
            }
          />
          <Row label="Power factor (assumed)" value={inputs.servicePowerFactor.toFixed(2)} />
        </Section>
      </div>

      <Section title="Annual energy & cost summary">
        <Row label="Total lighting kWh" value={`${fmtInt(d.annualKwh)} kWh/yr`} hint="Overhead + under-canopy" />
        <Row label="Total dehumid. kWh" value={`${fmtInt(annualDehumKwh)} kWh/yr`} />
        <Row label="Total heating fuel" value={`${fmt1(d.annualHeatingFuelMMBtu)} MMBtu/yr`} />
        <Row label="Annual lighting cost" value={fmtCurrency(d.annualCost)} />
        <Row
          label="If switched to optimal"
          value={
            optimal && optimal.id !== inputs.fixtureId
              ? `${fmtCurrency(optAnnualCost)} (saves ${fmtCurrency(d.annualCost - optAnnualCost)}/yr)`
              : `${fmtCurrency(optAnnualCost)} (already optimal)`
          }
        />
      </Section>

      <Section title="Yield projection · screening estimate" badge={`${inputs.cyclesPerYear} cycles/yr`}>
        <Row
          label="Per cycle"
          value={`${fmtInt(d.yieldProjection.gramsPerM2PerCycle)} g/m²`}
          hint={`Baseline ${d.yieldProjection.baselineGramsPerM2PerCycle} g/m²/cycle (Rodriguez-Morrison 2021 fit)`}
        />
        <Row
          label="Annual"
          value={`${fmtInt(d.yieldProjection.gramsPerM2PerYear)} g/m²/yr`}
        />
        <Row
          label="Total annual harvest"
          value={`${fmt1(d.yieldProjection.totalAnnualKg)} kg · ${fmt1(d.yieldProjection.totalAnnualLbs)} lbs`}
        />
        <Row
          label="Yield factors"
          value={`DLI ×${fmt1(d.yieldProjection.dliFactor)} · Temp ×${fmt1(d.yieldProjection.tempFactor)} · CO₂ ×${fmt1(d.yieldProjection.co2Factor)}`}
          hint="Multiplied against baseline g/m²/cycle"
        />
        <Row
          label="Energy use intensity"
          value={`${d.energyUseIntensity_kWhPerGram.toFixed(2)} kWh/g`}
          hint="Total electrical / dried flower mass; greenhouse 0.5–1.5 typical, indoor 1.5–3.5"
        />
        <Row
          label="Pathogen pressure (peak month)"
          value={`Botrytis ${Math.round(d.peakBotrytis)}/100 · PM ${Math.round(d.peakPM)}/100`}
          hint="≥60 = high pressure; check Cultivation Science tab for monthly profile"
        />
      </Section>

      <Section title="Greenhouse · top-down plan view (schematic)">
        <GreenhousePlanView
          floorAreaSqFt={inputs.greenhouseFloorAreaSqFt}
          canopyAreaSqFt={inputs.canopyAreaSqFt}
          fixtureCount={optFixtureCount}
          gridSpacingFt={optGridSpacing}
          fixtureLabel={optimal?.fixture.label ?? d.fixture.label}
          greenhouseLengthFt={inputs.greenhouseLengthFt}
          greenhouseWidthFt={inputs.greenhouseWidthFt}
          benchLayout={inputs.benchLayout}
        />
      </Section>

      <Section title="Greenhouse · interactive 3D model · live sim sync">
        <Live3DScene
          floorAreaSqFt={inputs.greenhouseFloorAreaSqFt}
          canopyAreaSqFt={inputs.canopyAreaSqFt}
          fixtureCount={optFixtureCount}
          gridSpacingFt={optGridSpacing}
          glazingPct={inputs.envelope.baseTransmissionPct}
          latitudeDeg={inputs.latitude}
          thermalScreenActive={inputs.thermalScreenEnabled}
          shadeActive={inputs.shadeEnabled}
          shadeTransmissionPct={inputs.shadeTransmissionPct}
          syncToSim
        />
      </Section>
    </div>
  );
}

import { useLiveDynamics } from "../context/useLiveDynamics";
import { useSimulation } from "../context/SimulationContext";
import { dayOfYearToMonth } from "../models/simulationModel";
import {
  getFixtureFormFactor,
  getFixtureKelvin,
} from "../models/fixtureModel";
import Greenhouse3DHud from "./Greenhouse3DHud";

function formatHour(h: number) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  return `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
function formatDOY(doy: number) {
  const cumStart = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const m = dayOfYearToMonth(doy);
  return `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][m]} ${doy - cumStart[m]}`;
}

function Live3DScene(props: {
  floorAreaSqFt: number;
  canopyAreaSqFt: number;
  fixtureCount: number;
  gridSpacingFt: number;
  glazingPct: number;
  latitudeDeg: number;
  thermalScreenActive?: boolean;
  shadeActive?: boolean;
  shadeTransmissionPct?: number;
  syncToSim?: boolean;
}) {
  const { inputs } = useScenario();
  const live = useLiveDynamics();
  const sim = useSimulation();
  // Pull the active fixture from useDerived so the BuildSheet 3D scene
  // reacts to fixture-dropdown changes the same way LiveGreenhouseScene does.
  const derived = useDerived();
  const activeFixture = derived.fixture;
  const fixtureFormFactor = getFixtureFormFactor(activeFixture);
  const fixtureKelvin = getFixtureKelvin(activeFixture);
  const [month, setMonth] = useState(5);
  const [ridgeAzimuth, setRidgeAzimuth] = useState(0);
  const [resetSignal, setResetSignal] = useState(0);
  const [showVentsOpen, setShowVentsOpen] = useState(false);
  const [showThermal, setShowThermal] = useState<boolean | null>(null);
  const [showShade, setShowShade] = useState<boolean | null>(null);
  // Resolve overrides — null means "use scenario state"
  const thermalActive = showThermal ?? props.thermalScreenActive ?? false;
  const shadeActive = showShade ?? props.shadeActive ?? false;
  return (
    <div className="space-y-2">
      {/* Simulation play controls — drive the 3D scene's sun, lights, vents */}
      {props.syncToSim && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-leaf-500/30 bg-leaf-500/[0.04] p-2 text-xs text-ink-700">
          <button
            type="button"
            onClick={sim.togglePlay}
            disabled={sim.rangePlaying}
            className={`rounded px-3 py-1 text-xs font-semibold ${
              sim.playing ? "bg-warn-500 text-white" : "bg-leaf-500 text-white hover:bg-leaf-600"
            } disabled:opacity-50`}
          >
            {sim.playing ? "❚❚ Pause" : "▶ Play"}
          </button>
          {sim.rangePlaying ? (
            <button
              type="button"
              onClick={sim.stopRangePlay}
              className="rounded bg-warn-500 px-3 py-1 text-xs font-semibold text-white hover:opacity-90"
            >
              ❚❚ Stop range
            </button>
          ) : (
            <button
              type="button"
              onClick={sim.startRangePlay}
              className="rounded bg-leaf-500 px-3 py-1 text-xs font-semibold text-white hover:bg-leaf-600"
            >
              ▶ Play range
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              sim.setRangeStart(sim.dayOfYear, 4);
              sim.setRangeEnd(sim.dayOfYear, 22);
            }}
            className="rounded border border-ink-300 bg-white px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            title="Set range to 4am-10pm of current day"
          >
            Day
          </button>
          <button
            type="button"
            onClick={() => {
              sim.setRangeStart(sim.dayOfYear, 0);
              sim.setRangeEnd(sim.dayOfYear + 7, 0);
            }}
            className="rounded border border-ink-300 bg-white px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            title="Set range to 1 week from current day"
          >
            Week
          </button>
          <button
            type="button"
            onClick={() => {
              sim.setRangeStart(1, 0);
              sim.setRangeEnd(365, 24);
            }}
            className="rounded border border-ink-300 bg-white px-2 py-0.5 text-[11px] hover:bg-leaf-500/5"
            title="Set range to full year"
          >
            Year
          </button>
          <span className="ml-1 font-mono text-ink-900">
            {formatDOY(sim.dayOfYear)} · {formatHour(sim.hourOfDay)}
          </span>
          <span className="text-[11px] text-ink-500">
            sun {fmt1(live.snapshot.sun.elevationDeg)}° · lights {live.snapshot.lights.on ? `${(live.snapshot.lights.dimLevel * 100).toFixed(0)}%` : "off"}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-ink-700">
        {!props.syncToSim && (
          <label className="flex items-center gap-2">
            <span className="font-medium">Sun: month</span>
            <input
              type="range"
              min={0}
              max={11}
              step={1}
              value={month}
              onChange={(e) => setMonth(parseInt(e.target.value, 10))}
              className="w-32"
            />
            <span className="font-mono text-ink-900">
              {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][month]}
            </span>
          </label>
        )}
        <label className="flex items-center gap-2">
          <span className="font-medium">Ridge azimuth</span>
          <input
            type="range"
            min={-90}
            max={90}
            step={5}
            value={ridgeAzimuth}
            onChange={(e) => setRidgeAzimuth(parseInt(e.target.value, 10))}
            className="w-32"
          />
          <span className="font-mono text-ink-900">{ridgeAzimuth}°</span>
        </label>
        {!props.syncToSim && (
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={showVentsOpen} onChange={(e) => setShowVentsOpen(e.target.checked)} />
            <span>Roof vents open</span>
          </label>
        )}
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={thermalActive} onChange={(e) => setShowThermal(e.target.checked)} />
          <span>Thermal screen</span>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={shadeActive} onChange={(e) => setShowShade(e.target.checked)} />
          <span>Shade cloth</span>
        </label>
        <button
          type="button"
          className="rounded border border-ink-300 px-2 py-0.5 text-xs hover:bg-leaf-500/5"
          onClick={() => setResetSignal((s) => s + 1)}
        >
          Reset view
        </button>
        <span className="text-[11px] text-ink-500">Drag · scroll · right-drag to pan</span>
      </div>
      <div className="relative">
        <Greenhouse3D
          {...props}
          greenhouseLengthFt={inputs.greenhouseLengthFt}
          greenhouseWidthFt={inputs.greenhouseWidthFt}
          benchLayout={inputs.benchLayout}
          eaveHeightFt={inputs.eaveHeightFt}
          peakHeightFt={inputs.peakHeightFt}
          month={month}
          ridgeAzimuthDeg={ridgeAzimuth}
          resetCameraSignal={resetSignal}
          thermalScreenActive={thermalActive}
          shadeActive={shadeActive}
          roofVentFraction={
            props.syncToSim ? live.snapshot.ventOpen : showVentsOpen ? 1 : 0
          }
          liveSunAzimuthDeg={props.syncToSim ? live.snapshot.sun.azimuthDeg : undefined}
          liveSunElevationDeg={props.syncToSim ? live.snapshot.sun.elevationDeg : undefined}
          lightsDimLevel={
            props.syncToSim
              ? live.snapshot.lights.on
                ? live.snapshot.lights.dimLevel
                : 0
              : 1
          }
          fixtureFormFactor={fixtureFormFactor}
          fixtureKelvin={fixtureKelvin}
          fixtureWatts={activeFixture.wattsPerFixture}
          fixtureType={activeFixture.type}
          fixtureLabel={activeFixture.label}
          plantDensity={inputs.plantDensity}
        />
        {props.syncToSim && <Greenhouse3DHud ridgeAzimuthDeg={ridgeAzimuth} />}
      </div>
      <p className="text-[11px] text-ink-500">
        WebGL scene with real geometry: gable structure with truss spacing every 6 ft, glazed sidewalls and roof slopes (transmission tied to your glazing %), oriented light bars hanging 5 ft below ridge with light footprints projected to canopy plane, plant clusters on the canopy floor, and a sun positioned at solar noon for the selected month based on your site latitude. Camera is interactive. Use "Reset view" to re-frame after changing canopy/floor area. Geometry derived from area inputs assuming 1.5:1 length:width and 14′ peak height — replace with measured drawings to override.
      </p>
    </div>
  );
}
