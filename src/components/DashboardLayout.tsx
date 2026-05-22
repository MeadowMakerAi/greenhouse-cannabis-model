import { useState } from "react";
import AssumptionPanel from "./AssumptionPanel";
import OutputSummary from "./OutputSummary";
import Warnings from "./Warnings";
import AnnualDLIChart from "./AnnualDLIChart";
import PPFDGapChart from "./PPFDGapChart";
import FixtureKWByMonth from "./FixtureKWByMonth";
import FixtureOptimization from "./FixtureOptimization";
import MarginalLightPanel from "./MarginalLightPanel";
import LightingScenarioChart from "./LightingScenarioChart";
import UnderCanopyLightingPanel from "./UnderCanopyLightingPanel";
import ShadeClothControlPanel from "./ShadeClothControlPanel";
import CO2ResponsePanel from "./CO2ResponsePanel";
import HeatLoadChart from "./HeatLoadChart";
import HeatingPanel from "./HeatingPanel";
import WetBulbRiskChart from "./WetBulbRiskChart";
import VPDChart from "./VPDChart";
import CoolingModePanel from "./CoolingModePanel";
import SeasonalStrategyCalendar from "./SeasonalStrategyCalendar";
import OptimizedSystemPanel from "./OptimizedSystemPanel";
import BuildSheet from "./BuildSheet";
import CultivationSciencePanel from "./CultivationSciencePanel";
import TimeControls from "./TimeControls";
import DailyDynamicsChart from "./DailyDynamicsChart";
import InsightsPanel from "./InsightsPanel";
import LiveGreenhouseScene from "./LiveGreenhouseScene";
import ScenarioPresets from "./ScenarioPresets";
import ShareLinkButton from "./ShareLinkButton";
import GreenhouseIsoView from "./GreenhouseIsoView";
import { useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";
import { fmt1, fmtPct } from "../utils/formatting";

const TABS = [
  { id: "build", label: "★ Build sheet", title: "Build sheet", subtitle: "Procurement-grade BOM with fixture count, kW, $/yr, and HVAC sizing.", index: "★" },
  { id: "optimized", label: "★ Optimized system", title: "Optimized system", subtitle: "Apply recommended fixtures + setpoints with one click.", index: "★" },
  { id: "science", label: "★ Cultivation science", title: "Cultivation science", subtitle: "Yield projection, pathogen pressure, crop steering, alongside the live scene.", index: "★" },
  { id: "live", label: "★ Live simulation", title: "Live simulation", subtitle: "Sun, lights, vents, plant growth follow the time-range player.", index: "★" },
  { id: "dli", label: "1 · Annual DLI", title: "Annual DLI", subtitle: "Outdoor, greenhouse-transmitted, and flower-window DLI by month.", index: "01" },
  { id: "supplemental", label: "2 · Supplemental light", title: "Supplemental light", subtitle: "Monthly PPFD gap to target, installed kW, and fixture optimization.", index: "02" },
  { id: "ledHps", label: "3 · LED vs HPS", title: "LED vs HPS", subtitle: "Annual energy, $/yr, and heat load across fixture choices.", index: "03" },
  { id: "underCanopy", label: "4 · Under-canopy", title: "Under-canopy", subtitle: "Lower-canopy PPFD, kW, heat load, and morphology support.", index: "04" },
  { id: "co2", label: "5 · CO₂ + high DLI", title: "CO₂ + high DLI", subtitle: "Feasibility band, recommended DLI ranges by setpoint, ventilation conflict.", index: "05" },
  { id: "shade", label: "6 · Shade tradeoff", title: "Shade tradeoff", subtitle: "DLI loss vs cooling benefit; supplemental PPFD penalty by month.", index: "06" },
  { id: "humidity", label: "7 · Humidity / wet-bulb", title: "Humidity & wet-bulb", subtitle: "Wet-bulb + dew-point profile against 60/68 °F risk thresholds; VPD vs target.", index: "07" },
  { id: "hvac", label: "8 · HVAC screening", title: "HVAC screening", subtitle: "Cooling tons, dehumidification pints/day, evap-failure months.", index: "08" },
  { id: "calendar", label: "9 · Seasonal calendar", title: "Seasonal calendar", subtitle: "Per-month strategy bullets and surfaced warnings.", index: "09" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const FOCUS_AREAS: Array<{
  id: string;
  title: string;
  body: string;
  primaryTab: TabId;
  tabs: TabId[];
}> = [
  {
    id: "visual",
    title: "Visual model",
    body:
      "Use the live scene to sanity-check sun angle, light state, vents, shade, and canopy geometry before diving into the numbers.",
    primaryTab: "live",
    tabs: ["live", "science"],
  },
  {
    id: "build",
    title: "Build + electrical",
    body:
      "Translate the scenario into fixtures, amperage, branch circuits, installed kW, and procurement-ready layout assumptions.",
    primaryTab: "build",
    tabs: ["build", "optimized", "supplemental", "ledHps"],
  },
  {
    id: "climate",
    title: "Climate + HVAC",
    body:
      "Pressure-test humidity, wet-bulb limits, shade tradeoffs, cooling tons, and dehumidification burden month by month.",
    primaryTab: "humidity",
    tabs: ["dli", "shade", "humidity", "hvac"],
  },
  {
    id: "cultivation",
    title: "Cultivation strategy",
    body:
      "Evaluate under-canopy, CO2, pathogen pressure, and seasonal operating windows to support flower quality and consistency.",
    primaryTab: "science",
    tabs: ["science", "underCanopy", "co2", "calendar"],
  },
];

/** Editorial section header above each tab's content — small-caps index +
 *  title + subtitle, hairline rule below. Anchors the eye and signals
 *  hierarchy. Pattern: editorial magazine spread. */
function TabHeader({ tabId }: { tabId: TabId }) {
  const t = TABS.find((x) => x.id === tabId);
  if (!t) return null;
  return (
    <div className="space-y-2 border-b border-ink-200/80 pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.10em] text-ink-500">
          Current workspace
        </span>
        <span className="text-[11px] text-ink-500">
          What this section is for
        </span>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span
            className="font-display text-leaf-700"
            style={{
              fontSize: "1.5rem",
              fontWeight: 600,
              letterSpacing: "-0.015em",
              lineHeight: 1,
            }}
          >
            {t.index}
          </span>
          <h2
            className="font-display text-ink-900"
            style={{
              fontSize: "1.75rem",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {t.title}
          </h2>
        </div>
        <p className="max-w-xl text-sm leading-snug text-ink-500 proportional-nums">
          {t.subtitle}
        </p>
      </div>
    </div>
  );
}

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-full border border-white/20 bg-ink-900/55 px-3 py-1.5 text-[11px] text-white/92 shadow-e1 backdrop-blur-sm">
      <span className="mr-1 text-white/55">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function WorkspaceCard({
  area,
  active,
  onSelect,
}: {
  area: (typeof FOCUS_AREAS)[number];
  active: boolean;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(area.primaryTab)}
      className={`w-full rounded-xl border p-4 text-left transition-all duration-150 ${
        active
          ? "border-leaf-500/50 bg-leaf-500/[0.06] shadow-e2"
          : "border-ink-200/80 bg-white shadow-e1 hover:-translate-y-px hover:border-ink-300 hover:shadow-e2"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-ink-500">
            Workspace
          </div>
          <div className="mt-1 text-base font-semibold tracking-tight text-ink-900">
            {area.title}
          </div>
        </div>
        <span className={`tag ${active ? "tag-info" : "tag-muted"}`}>
          {active ? "Open now" : "Jump in"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-700 proportional-nums">
        {area.body}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {area.tabs.map((tabId) => {
          const tab = TABS.find((item) => item.id === tabId);
          if (!tab) return null;
          return (
            <span key={`${area.id}-${tabId}`} className="tag tag-muted">
              {tab.title}
            </span>
          );
        })}
      </div>
    </button>
  );
}

function DashboardGuide({
  activeTab,
  onSelect,
}: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}) {
  const { inputs } = useScenario();
  const d = useDerived();
  const warningCount = d.sanityFlags.length + d.warnings.global.length;

  return (
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="card-hero-primary">
        <div className="card-body space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-ink-500">
                Start here
              </div>
              <h2 className="mt-1 text-[1.65rem] font-semibold tracking-tight text-ink-900">
                Lead with the visual model, then move into the right decision
                workspace.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-700 proportional-nums">
                The greenhouse scene is the fastest way to orient yourself:
                sun angle, lights, vents, shade, and canopy geometry in one
                glance. From there, use the named workspaces to answer build,
                climate, and cultivation questions without hunting through the
                dashboard.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onSelect("live")}
                className="btn-primary px-4 py-2 text-sm"
              >
                Open live simulation
              </button>
              <button
                type="button"
                onClick={() => onSelect("science")}
                className="btn px-4 py-2 text-sm"
              >
                Open cultivation science
              </button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white/80 shadow-e1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-200/70 px-4 py-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-ink-700">
                Visual model preview
              </span>
              <span className="text-[11px] text-ink-500">
                Live 3D scene plus HUD telemetry lives in the simulation
                workspaces
              </span>
            </div>
            <div className="relative overflow-hidden bg-ink-900">
              <img
                src="/landing-hero.png"
                alt="Preview of the live greenhouse model showing the 3D structure, canopy, sun, and telemetry overlay."
                className="block h-auto w-full"
              />
              <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 bg-gradient-to-t from-ink-900/85 via-ink-900/55 to-transparent p-3">
                <MetricChip label="Site" value={inputs.weatherStation} />
                <MetricChip
                  label="Peak overhead"
                  value={`${fmt1(d.peakInstalledKW)} kW`}
                />
                <MetricChip
                  label="Net transmission"
                  value={fmtPct(d.transmission)}
                />
                <MetricChip
                  label="Peak cooling"
                  value={`${fmt1(d.peakCoolingTons)} tons`}
                />
                <MetricChip
                  label="Warnings"
                  value={warningCount > 0 ? `${warningCount} flagged` : "clear"}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header-strong">
          <span>Dashboard workspaces</span>
          <span className="text-[11px] font-normal text-ink-500">
            Each card tells you what the section is for
          </span>
        </div>
        <div className="card-body space-y-3">
          {FOCUS_AREAS.map((area) => (
            <WorkspaceCard
              key={area.id}
              area={area}
              active={area.tabs.includes(activeTab)}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ScenePanel({
  title,
  subtitle,
  bleed = false,
}: {
  title: string;
  subtitle?: string;
  bleed?: boolean;
}) {
  const d = useDerived();
  const fixtureCount = d.peakFixtureCount > 0 ? d.peakFixtureCount : 36;
  const gridSpacingFt = d.peakSquareGridSpacingFt > 0 ? d.peakSquareGridSpacingFt : 5.3;
  if (bleed) {
    // Substrate mode: scene IS the surface. Title rides above as
    // editorial chrome, no card outline.
    return (
      <div className="space-y-2">
        <div className="flex items-baseline justify-between border-b border-ink-200/70 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.10em] text-ink-700">
            {title}
          </span>
          {subtitle && (
            <span className="text-[11px] text-ink-500 proportional-nums">
              {subtitle}
            </span>
          )}
        </div>
        <LiveGreenhouseScene
          fixtureCount={fixtureCount}
          gridSpacingFt={gridSpacingFt}
          syncToSim
          bleed
        />
      </div>
    );
  }
  return (
    <div className="card">
      <div className="card-header-strong">
        <span>{title}</span>
        {subtitle && <span className="text-[11px] font-normal normal-case text-ink-500">{subtitle}</span>}
      </div>
      <div className="card-body">
        <LiveGreenhouseScene
          fixtureCount={fixtureCount}
          gridSpacingFt={gridSpacingFt}
          syncToSim
        />
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const [tab, setTab] = useState<TabId>("live");
  const { inputs } = useScenario();
  const d = useDerived();
  const fixtureCount = d.peakFixtureCount > 0 ? d.peakFixtureCount : 36;
  const gridSpacingFt =
    d.peakSquareGridSpacingFt > 0 ? d.peakSquareGridSpacingFt : 5.3;

  return (
    <div className="grid h-screen grid-cols-[360px_1fr] grid-rows-[auto_1fr]">
      {/* Header sits on a raised plane (e2 + bottom shadow) so the content
          beneath it reads as the working surface, not a peer. We use solid
          bg-white/95 instead of bg-white/90 + backdrop-blur because the
          live 3D scene already fights for paint budget on Safari.
          Monogram keeps main's radial-gradient + green-glow treatment
          (inline style — radial + custom multi-layer shadow don't compose
          cleanly as Tailwind utilities for a one-off brand mark). */}
      <header className="col-span-2 relative z-20 border-b border-ink-200/70 bg-white/95 px-5 py-3 shadow-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              aria-label="Show project intro"
              title="Show project intro"
              onClick={() => window.dispatchEvent(new CustomEvent("greenhouse-model:show-landing"))}
              className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white transition-transform duration-150 hover:-translate-y-px focus:outline-none focus:ring-2 focus:ring-leaf-500/60 focus:ring-offset-2"
              style={{
                background:
                  "radial-gradient(120% 120% at 30% 20%, #43a47e 0%, #2f8f6c 55%, #185640 100%)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.25) inset, 0 4px 12px -2px rgba(47,143,108,0.45), 0 1px 2px rgba(13,17,23,0.2)",
              }}
            >
              GH
            </button>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-ink-900">
                Greenhouse Cannabis Model
              </h1>
              <p className="text-[11px] text-ink-500">
                {inputs.siteAddress} · {inputs.weatherStation} · screening-level decision support
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ShareLinkButton />
            <ScenarioPresets />
          </div>
        </div>
      </header>
      {/* Sidebar = recessed trough. Slightly cooler bg + inset top shadow
          so it visibly sits beneath the header plane. We avoid
          overflow-hidden on the wrapper so card hover lifts (shadow-e3)
          near the sidebar edge don't get clipped. AssumptionPanel itself
          provides overflow-y-auto. */}
      <div className="row-start-2 relative border-r border-ink-200/70 bg-ink-100/40">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-3 bg-gradient-to-b from-ink-900/[0.05] to-transparent" />
        <AssumptionPanel />
      </div>
      {/* Main content plane — slight off-white so cards lift visibly. */}
      <main className="row-start-2 overflow-y-auto p-4 surface-page">
        <div className="space-y-4">
          <OutputSummary />
          <DashboardGuide activeTab={tab} onSelect={setTab} />
          <nav className="tab-bar">
            {TABS.map((t) => {
              const isStarred = t.label.startsWith("★");
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`tab-button ${isStarred ? "tab-button-star" : ""} ${active ? "tab-button-active" : ""}`}
                  type="button"
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          <div key={tab} className="tab-content space-y-4">
            <TabHeader tabId={tab} />
            {tab !== "live" && tab !== "science" && (
              <div className="card">
                <div className="card-header-strong">
                  <span>Visual model snapshot</span>
                  <span className="text-[11px] font-normal text-ink-500">
                    Quick reference while you work in the numeric views
                  </span>
                </div>
                <div className="card-body space-y-3">
                  <div className="overflow-hidden rounded-xl border border-ink-200/80 bg-white">
                    <GreenhouseIsoView
                      floorAreaSqFt={inputs.greenhouseFloorAreaSqFt}
                      canopyAreaSqFt={inputs.canopyAreaSqFt}
                      fixtureCount={fixtureCount}
                      gridSpacingFt={gridSpacingFt}
                      glazingPct={inputs.envelope.baseTransmissionPct}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ink-200/70 bg-ink-50/70 px-4 py-3 text-sm text-ink-700">
                    <p className="max-w-2xl leading-relaxed proportional-nums">
                      Need the interactive version? Open the live simulation
                      workspace to inspect sun angle, vent state, shade
                      deployment, and plant growth against the current
                      scenario.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTab("live")}
                      className="btn-primary px-4 py-2 text-sm"
                    >
                      Open live simulation
                    </button>
                  </div>
                </div>
              </div>
            )}
            {tab === "build" && <BuildSheet />}
            {tab === "optimized" && <OptimizedSystemPanel />}
            {tab === "science" && (
              <div className="space-y-4">
                <ScenePanel
                  title="Greenhouse · live 3D model"
                  subtitle="Synced to sim clock — sun, lights, vents, fabric follow the time-range player"
                  bleed
                />
                <CultivationSciencePanel />
              </div>
            )}
            {tab === "live" && (
              <div className="space-y-4">
                <ScenePanel
                  title="Greenhouse · live 3D model"
                  subtitle="Sun · lights · vents · plant growth all follow the simulation clock"
                  bleed
                />
                <TimeControls />
                <DailyDynamicsChart />
              </div>
            )}
            {tab === "dli" && <AnnualDLIChart />}
            {tab === "supplemental" && (
              <div className="space-y-3">
                <PPFDGapChart />
                <FixtureKWByMonth />
                <MarginalLightPanel />
                <FixtureOptimization />
              </div>
            )}
            {tab === "ledHps" && <LightingScenarioChart />}
            {tab === "underCanopy" && <UnderCanopyLightingPanel />}
            {tab === "co2" && <CO2ResponsePanel />}
            {tab === "shade" && <ShadeClothControlPanel />}
            {tab === "humidity" && (
              <div className="space-y-3">
                <WetBulbRiskChart />
                <VPDChart />
              </div>
            )}
            {tab === "hvac" && (
              <div className="space-y-3">
                <HeatLoadChart />
                <HeatingPanel />
                <CoolingModePanel />
              </div>
            )}
            {tab === "calendar" && <SeasonalStrategyCalendar />}
          </div>
          <Warnings />
          <InsightsPanel />
        </div>
      </main>
    </div>
  );
}
