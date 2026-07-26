import { useEffect, useState } from "react";
// AssumptionPanel is no longer mounted in the layout — Phase 4 PR 3
// retired the left sidebar. The full 70-field panel is now reached via
// the Customize drawer (CustomizeDrawer.tsx), triggered from the top
// pill bar or ⌘K. AssumptionPanel itself is unchanged and is consumed
// directly by CustomizeDrawer.
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
import SiteIntelligencePanel from "./SiteIntelligencePanel";
import SoilPanel from "./SoilPanel";
import SatellitePanel from "./SatellitePanel";
import OptimizedSystemPanel from "./OptimizedSystemPanel";
import BuildSheet from "./BuildSheet";
import EquipmentPalette from "./EquipmentPalette";
import CultivationSciencePanel from "./CultivationSciencePanel";
import TimeControls from "./TimeControls";
import DailyDynamicsChart from "./DailyDynamicsChart";
import InsightsPanel from "./InsightsPanel";
import LiveGreenhouseScene from "./LiveGreenhouseScene";
import ScenarioPresets from "./ScenarioPresets";
import ShareLinkButton from "./ShareLinkButton";
import GreenhouseIsoView from "./GreenhouseIsoView";
import TopPillBar from "./TopPillBar";
import CustomizeDrawer from "./CustomizeDrawer";
import WhatChangedBanner from "./WhatChangedBanner";
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

/**
 * Tabs that survive outdoor (open-air) mode. Everything else assumes a glass
 * envelope — supplemental fixtures, HVAC, indoor climate, the BOM, yield with
 * controlled setpoints — so it's hidden when `mode === "outdoor"`. Outdoor keeps
 * the open-air-valid layers: the live 3D field, natural DLI, and the site /
 * soil / seasonal calendar. (Yield is intentionally deferred — an honest outdoor
 * yield needs a season model + sungrown citations.)
 */
const OUTDOOR_VISIBLE_TABS = new Set<TabId>(["live", "dli", "calendar"]);
function isTabVisibleInMode(
  tabId: TabId,
  mode: "greenhouse" | "outdoor",
): boolean {
  return mode === "greenhouse" || OUTDOOR_VISIBLE_TABS.has(tabId);
}

/** Editorial section header above each tab's content — small-caps index +
 *  title + subtitle, hairline rule below. Anchors the eye and signals
 *  hierarchy. Pattern: editorial magazine spread. */
function TabHeader({ tabId }: { tabId: TabId }) {
  const { inputs } = useScenario();
  const t = TABS.find((x) => x.id === tabId);
  if (!t) return null;
  // Several tab subtitles name greenhouse-only concepts (lights/vents,
  // greenhouse-transmitted DLI). Open-air has none of those, so swap to
  // mode-accurate copy for the outdoor-visible tabs.
  let subtitle: string = t.subtitle;
  if (inputs.mode === "outdoor") {
    if (t.id === "live")
      subtitle = "Sun and the open-air canopy follow the time-range player.";
    else if (t.id === "dli")
      subtitle = "Open-air canopy DLI and its flower-window slice, by month.";
    else if (t.id === "calendar")
      subtitle = "Site, soil, and the growing-season window.";
  }
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
          {subtitle}
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

  // Customize drawer state — PR 2 of Phase 4. Lifted here so the
  // top pill bar's "Customize" button and the global ⌘K hotkey both
  // toggle the same drawer instance.
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [customizeAutoFocusSearch, setCustomizeAutoFocusSearch] =
    useState(false);

  // ⌘K / Ctrl+K global hotkey — opens the customize drawer with the
  // search input focused. Ignored when the user is in an editable
  // element (so they can still ⌘K text edits in inputs without
  // hijacking). Esc-to-close is handled inside CustomizeDrawer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (!cmd || e.key !== "k") return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editable =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable === true;
      // Even inside editable: if it's our own search input we never
      // re-trigger, but other inputs we leave alone so ⌘K cursor
      // commands in those fields work as expected. This mirrors
      // Linear / GitHub: global ⌘K from anywhere except a focused
      // field.
      if (editable) return;
      e.preventDefault();
      setCustomizeAutoFocusSearch(true);
      setCustomizeOpen(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Switching to outdoor mode can hide the active tab (e.g. you're on "HVAC"
  // then flip to outdoor). Fall back to the live scene so you're never stranded
  // on an invisible tab.
  useEffect(() => {
    if (!isTabVisibleInMode(tab, inputs.mode)) setTab("live");
  }, [inputs.mode, tab]);

  // Deep-link from a Sage audit finding: "View in {tab}" dispatches this event.
  // Validate against the known tab ids; the mode-visibility effect above then
  // falls back to "live" if the target is hidden in the current mode.
  useEffect(() => {
    const onSelectTab = (e: Event) => {
      const next = (e as CustomEvent).detail?.tab as TabId | undefined;
      if (next && TABS.some((t) => t.id === next)) setTab(next);
    };
    window.addEventListener("greenhouse-model:select-tab", onSelectTab);
    return () =>
      window.removeEventListener("greenhouse-model:select-tab", onSelectTab);
  }, []);

  // Render-safe effective tab: if the active tab isn't valid in the current mode
  // (e.g. you were on HVAC then flipped to outdoor), render "live" THIS frame
  // instead of flashing the forbidden greenhouse panel for one paint before the
  // effect above corrects state.
  const activeTab = isTabVisibleInMode(tab, inputs.mode) ? tab : "live";

  const openCustomize = () => {
    setCustomizeAutoFocusSearch(false);
    setCustomizeOpen(true);
  };
  const closeCustomize = () => setCustomizeOpen(false);

  return (
    // Phase 4 PR 3: single-column layout. Sidebar removed; the 3D
    // scene + tab content now fill full viewport width. All input
    // editing lives in the top pill bar (PR 1) + Customize drawer
    // (PR 2). Grid stays 3-row (header / pill bar / content) so the
    // existing row-start references in child components still resolve.
    //
    // Mobile fix: the desktop app-shell (fixed 100vh, only <main> scrolls)
    // collapsed on phones — a tall header + wrapping pill bar squeezed the
    // 1fr content row, and 100vh > the visible viewport hid main's bottom
    // with no body scroll to recover it. So the page is natural-flow and
    // body-scrolls on mobile (min-h, main not its own scroll container),
    // and only restores the fixed-height internal-scroll shell at md+.
    <div className="grid min-h-[100svh] grid-cols-1 grid-rows-[auto_auto_1fr] md:h-screen">
      {/* Header sits on a raised plane (e2 + bottom shadow) so the content
          beneath it reads as the working surface, not a peer. We use solid
          bg-white/95 instead of bg-white/90 + backdrop-blur because the
          live 3D scene already fights for paint budget on Safari.
          Monogram keeps main's radial-gradient + green-glow treatment
          (inline style — radial + custom multi-layer shadow don't compose
          cleanly as Tailwind utilities for a one-off brand mark). */}
      <header className="relative z-20 border-b border-ink-200/70 bg-white/95 px-5 py-3 shadow-header">
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
            {/* Live indicator — Phase 2 visual-system cue. Tells a
                first-time visitor this dashboard is live-computing from
                their inputs, not a static screenshot. Pulses softly to
                draw the eye without competing with the brand mark. */}
            <span
              className="live-indicator hidden md:inline-flex"
              title="Every number recomputes as you change inputs"
            >
              Live · updates as you type
            </span>
          </div>
          <div className="flex items-center gap-2">
            <ShareLinkButton />
            <ScenarioPresets />
          </div>
        </div>
      </header>
      {/* Top pill bar — Phase 4 PR 1 of the layout overhaul.
          Surfaces the 7 most-edited inputs (Location, Dimensions,
          Photoperiod & DLI, Fixture, CO₂, Climate, Cycles) as fast
          click-to-edit pills directly under the masthead. Spans both
          columns so the pills feel like global scenario controls,
          not a sidebar feature. Strictly additive — the full
          AssumptionPanel sidebar still owns every field. */}
      <div className="row-start-2 relative z-10">
        <TopPillBar onCustomizeClick={openCustomize} />
      </div>
      {/* Main content plane — slight off-white so cards lift visibly.
          Now fills full viewport width (sidebar retired in PR 3). */}
      <main className="row-start-3 p-4 surface-page md:overflow-y-auto">
        <div className="space-y-4">
          <WhatChangedBanner />
          <OutputSummary />
          {/* Single navigation — four labeled tab groups. */}
          <nav className="flex flex-col gap-2 rounded-xl bg-ink-100/70 p-1.5 shadow-recessed">
            {TAB_GROUPS.map((group) => {
              const visibleTabIds = group.tabIds.filter((tabId) =>
                isTabVisibleInMode(tabId, inputs.mode),
              );
              // Whole group (e.g. "Build & electrical") drops out of the nav in
              // outdoor mode when none of its tabs apply open-air.
              if (visibleTabIds.length === 0) return null;
              return (
              <div
                key={group.id}
                role="group"
                aria-label={group.label}
                className="flex flex-wrap items-center gap-1.5"
              >
                <span
                  aria-hidden
                  className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-400"
                >
                  {group.label}
                </span>
                {visibleTabIds.map((tabId) => {
                  const t = TABS.find((x) => x.id === tabId);
                  if (!t) return null;
                  const isStarred = t.label.startsWith("★");
                  const active = activeTab === t.id;
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
              );
            })}
          </nav>

          <div key={activeTab} className="tab-content space-y-4">
            <TabHeader tabId={activeTab} />
            {activeTab !== "live" && activeTab !== "science" && inputs.mode === "greenhouse" && (
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
            {activeTab === "build" && (
              <div className="space-y-3">
                <BuildSheet />
                <EquipmentPalette />
              </div>
            )}
            {activeTab === "optimized" && <OptimizedSystemPanel />}
            {activeTab === "science" && (
              <div className="space-y-4">
                <ScenePanel
                  title="Greenhouse · live 3D model"
                  subtitle="Synced to sim clock — sun, lights, vents, fabric follow the time-range player"
                  bleed
                />
                <CultivationSciencePanel />
              </div>
            )}
            {activeTab === "live" && (
              <div className="space-y-4">
                <ScenePanel
                  title={
                    inputs.mode === "outdoor"
                      ? "Open-air · live 3D field"
                      : "Greenhouse · live 3D model"
                  }
                  subtitle={
                    inputs.mode === "outdoor"
                      ? "Sun + plant growth follow the simulation clock — open-air, no climate systems"
                      : "Sun · lights · vents · plant growth all follow the simulation clock"
                  }
                  bleed
                />
                <TimeControls />
                {/* Daily climate dynamics are an indoor-control readout — hidden
                    outdoors where there's no envelope to regulate. */}
                {inputs.mode === "greenhouse" && <DailyDynamicsChart />}
              </div>
            )}
            {activeTab === "dli" && <AnnualDLIChart />}
            {activeTab === "supplemental" && (
              <div className="space-y-3">
                <PPFDGapChart />
                <FixtureKWByMonth />
                <MarginalLightPanel />
                <FixtureOptimization />
              </div>
            )}
            {activeTab === "ledHps" && <LightingScenarioChart />}
            {activeTab === "underCanopy" && <UnderCanopyLightingPanel />}
            {activeTab === "co2" && <CO2ResponsePanel />}
            {activeTab === "shade" && <ShadeClothControlPanel />}
            {activeTab === "humidity" && (
              <div className="space-y-3">
                <WetBulbRiskChart />
                <VPDChart />
              </div>
            )}
            {activeTab === "hvac" && (
              <div className="space-y-3">
                <HeatLoadChart />
                <HeatingPanel />
                <CoolingModePanel />
              </div>
            )}
            {activeTab === "calendar" && (
              <div className="space-y-3">
                <SiteIntelligencePanel />
                <SoilPanel />
                {/* Regional satellite (NASA GIBS / MODIS) — outdoor siting
                    context next to soil. Open-air only; the greenhouse calendar
                    stays unchanged. */}
                {inputs.mode === "outdoor" && <SatellitePanel />}
                {/* Strategy bullets are greenhouse crop-steering (photoperiod,
                    supplemental, shade) — not valid open-air, so hidden outdoors.
                    Site + soil panels above carry the honest frost/season window. */}
                {inputs.mode === "greenhouse" && <SeasonalStrategyCalendar />}
              </div>
            )}
          </div>
          {/* Warnings + insights are derived from greenhouse climate-control
              state; outdoors they'd assert systems that don't exist. */}
          {inputs.mode === "greenhouse" && (
            <>
              <Warnings />
              <InsightsPanel />
            </>
          )}
        </div>
      </main>
      {/* Customize drawer — sibling of the grid so it overlays the
          entire viewport without disrupting layout. Renders nothing
          when closed. */}
      <CustomizeDrawer
        open={customizeOpen}
        onClose={closeCustomize}
        autoFocusSearch={customizeAutoFocusSearch}
      />
    </div>
  );
}
