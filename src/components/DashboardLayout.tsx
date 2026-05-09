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

function ScenePanel({ title, subtitle }: { title: string; subtitle?: string }) {
  const d = useDerived();
  const fixtureCount = d.peakFixtureCount > 0 ? d.peakFixtureCount : 36;
  const gridSpacingFt = d.peakSquareGridSpacingFt > 0 ? d.peakSquareGridSpacingFt : 5.3;
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
      <header className="col-span-2 border-b border-ink-200 bg-white/80 px-5 py-3 shadow-card backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-leaf-500 to-leaf-700 text-base font-bold text-white shadow-card">
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
      <div className="row-start-2 overflow-hidden border-r border-ink-200 bg-ink-50/40">
        <AssumptionPanel />
      </div>
      <main className="row-start-2 overflow-y-auto p-4">
        <div className="space-y-4">
          <OutputSummary />
          <InsightsPanel />
          <Warnings />
          <nav className="flex flex-wrap gap-1.5 rounded-xl border border-ink-200 bg-white p-1.5 shadow-card">
            {TABS.map((t) => {
              const isStarred = t.label.startsWith("★");
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`tab-button ${active ? "tab-button-active" : isStarred ? "tab-button-star" : ""}`}
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
            <div className="space-y-3">
              <ScenePanel
                title="Greenhouse · live 3D model"
                subtitle="Synced to simulation clock — sun, lights, vents, fabric all follow your time-range player"
              />
              <CultivationSciencePanel />
            </div>
          )}
          {tab === "live" && (
            <div className="space-y-3">
              <ScenePanel
                title="Greenhouse · live 3D model"
                subtitle="The full-tab live scene; same component as Build sheet"
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
