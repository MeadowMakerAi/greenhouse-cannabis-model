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

/**
 * The 13 tabs, segmented into four labeled clusters. This IS the
 * navigation — it replaces the former parallel system (a "START HERE"
 * banner + standalone workspace cards that duplicated the tab bar).
 * Every tab appears exactly once; the tab bar renders one labeled row
 * per group. The visual model leads as group 1, honoring its central
 * role without a redundant preview banner.
 */
const TAB_GROUPS: { id: string; label: string; tabIds: TabId[] }[] = [
  { id: "visual", label: "Visual model", tabIds: ["live", "science"] },
  {
    id: "build",
    label: "Build & electrical",
    tabIds: ["build", "optimized", "supplemental", "ledHps"],
  },
  {
    id: "climate",
    label: "Climate & HVAC",
    tabIds: ["dli", "shade", "humidity", "hvac"],
  },
  {
    id: "cultivation",
    label: "Cultivation",
    tabIds: ["underCanopy", "co2", "calendar"],
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
          {/* Single navigation — four labeled tab groups. */}
          <nav className="flex flex-col gap-2 rounded-xl bg-ink-100/70 p-1.5 shadow-recessed">
            {TAB_GROUPS.map((group) => (
              <div
                key={group.id}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                  {group.label}
                </span>
                {group.tabIds.map((tabId) => {
                  const t = TABS.find((x) => x.id === tabId);
                  if (!t) return null;
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
              </div>
            ))}
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
