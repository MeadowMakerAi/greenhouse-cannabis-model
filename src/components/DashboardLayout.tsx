import { useState } from "react";
import AssumptionPanel from "./AssumptionPanel";
import OutputSummary from "./OutputSummary";
import Warnings from "./Warnings";
import AnnualDLIChart from "./AnnualDLIChart";
import PPFDGapChart from "./PPFDGapChart";
import FixtureKWByMonth from "./FixtureKWByMonth";
import FixtureOptimization from "./FixtureOptimization";
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
import { useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";

const TABS = [
  { id: "build", label: "★ Build sheet" },
  { id: "optimized", label: "★ Optimized system" },
  { id: "science", label: "★ Cultivation science" },
  { id: "live", label: "★ Live simulation" },
  { id: "dli", label: "1 · Annual DLI" },
  { id: "supplemental", label: "2 · Supplemental light" },
  { id: "ledHps", label: "3 · LED vs HPS" },
  { id: "underCanopy", label: "4 · Under-canopy" },
  { id: "co2", label: "5 · CO₂ + high DLI" },
  { id: "shade", label: "6 · Shade tradeoff" },
  { id: "humidity", label: "7 · Humidity / wet-bulb" },
  { id: "hvac", label: "8 · HVAC screening" },
  { id: "calendar", label: "9 · Seasonal calendar" },
] as const;

type TabId = (typeof TABS)[number]["id"];

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
  const [tab, setTab] = useState<TabId>("build");
  const { inputs } = useScenario();

  return (
    <div className="grid h-screen grid-cols-[360px_1fr] grid-rows-[auto_1fr]">
      {/* Header sits on a raised plane (e2 + bottom shadow) so the content
          beneath it reads as the working surface, not a peer. We use solid
          bg-white/95 instead of bg-white/90 + backdrop-blur because the
          live 3D scene already fights for paint budget on Safari. */}
      <header className="col-span-2 relative z-20 border-b border-ink-200/70 bg-white/95 px-5 py-3 shadow-header">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-leaf-400 via-leaf-500 to-leaf-700 text-base font-bold text-white shadow-e2">
              CG
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-tight text-ink-900">
                Cottage Grove · Greenhouse Cannabis Model
              </h1>
              <p className="text-[11px] text-ink-500">
                {inputs.siteAddress} · {inputs.weatherStation} · screening-level decision support
              </p>
            </div>
          </div>
          <ScenarioPresets />
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
          <InsightsPanel />
          <Warnings />
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
      </main>
    </div>
  );
}
