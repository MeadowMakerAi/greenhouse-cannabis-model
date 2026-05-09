import { useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";
import { generateProactiveInsights, type Insight } from "../models/proactiveInsights";

const STYLE_BY_SEVERITY: Record<Insight["severity"], { dot: string; ring: string; tag: string; chip: string; bg: string }> = {
  savings: {
    dot: "bg-leaf-500",
    ring: "border-leaf-500/40",
    tag: "tag-info",
    chip: "Opportunity",
    bg: "bg-leaf-500/[0.04]",
  },
  warn: {
    dot: "bg-warn-500",
    ring: "border-warn-500/40",
    tag: "tag-warn",
    chip: "Risk",
    bg: "bg-warn-500/[0.05]",
  },
  info: {
    dot: "bg-sun-500",
    ring: "border-sun-500/40",
    tag: "tag-muted",
    chip: "Note",
    bg: "bg-sun-500/[0.05]",
  },
  celebrate: {
    dot: "bg-leaf-600",
    ring: "border-leaf-600/50",
    tag: "tag-info",
    chip: "Strong",
    bg: "bg-leaf-500/[0.07]",
  },
};

export default function InsightsPanel() {
  const { inputs } = useScenario();
  const d = useDerived();

  const insights = generateProactiveInsights({
    cyclesPerYear: inputs.cyclesPerYear,
    targetDLI: d.target.targetDLI,
    co2Enabled: inputs.co2Enabled,
    co2SetpointPpm: inputs.co2SetpointPpm,
    ventilationMode: inputs.ventilationMode,
    cropTargetId: inputs.cropTargetId as string,
    cultivationPhase: inputs.cultivationPhase,
    thermalScreenEnabled: inputs.thermalScreenEnabled,
    envelopeUValueBTUhrFtF: inputs.envelopeUValueBTUhrFtF,
    evapEfficiencyPct: inputs.evapEfficiencyPct,
    shadeEnabled: inputs.shadeEnabled,
    fixtureSource: d.fixture.source,
    fixturePPE: d.fixture.ppe,
    fixtureSupports120V: d.activeFixtureSupports120V,
    fixtureSupports240V: d.activeFixtureSupports240V,
    serviceVoltagePrimary: inputs.serviceVoltagePrimary,
    yieldDLIFactor: d.yieldProjection.dliFactor,
    yieldTempFactor: d.yieldProjection.tempFactor,
    yieldCO2Factor: d.yieldProjection.co2Factor,
    energyUseIntensity: d.energyUseIntensity_kWhPerGram,
    peakBotrytis: d.peakBotrytis,
    peakPM: d.peakPM,
    peakNetHeatingLoad: d.peakNetHeatingLoad,
    installedRadiantCapacity: inputs.radiantHeatingCapacityBTUhr,
    cropSteeringAlignment: d.cropSteering.alignmentScore,
    evapFailMonths: d.months.filter((m) => !m.evapReachesTarget).length,
    highHumidityMonths: d.months.filter((m) => m.highHumidityRisk).length,
  });

  if (insights.length === 0) {
    return (
      <div className="card border-leaf-500/30 bg-leaf-500/[0.04]">
        <div className="card-header">
          <span>💡 Proactive insights</span>
          <span className="tag tag-info">All clear</span>
        </div>
        <div className="card-body text-sm text-ink-700">
          Nothing flagged at current settings. The scenario is within efficient bands across lighting, climate, electrical, yield, and pathogen pressure.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-header">
        <span>💡 Proactive insights · {insights.length}</span>
        <div className="flex gap-1 text-xs">
          <span className="tag tag-info">
            {insights.filter((i) => i.severity === "savings").length} savings
          </span>
          <span className="tag tag-warn">
            {insights.filter((i) => i.severity === "warn").length} risks
          </span>
        </div>
      </div>
      {/* Body uses the recessed sub-panel style so insight rows visually
          sit *inside* the card rather than tile its surface. */}
      <div className="card-body bg-ink-100/40 space-y-2 shadow-recessed">
        {insights.map((ins) => {
          const s = STYLE_BY_SEVERITY[ins.severity];
          return (
            <div
              key={ins.id}
              className={`grid grid-cols-[10px_1fr] items-start gap-3 rounded-lg border ${s.ring} ${s.bg} bg-white p-3 shadow-e1`}
            >
              <span className={`mt-2 h-2 w-2 rounded-full ${s.dot} shadow-e1`} />
              <div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-semibold text-ink-900">{ins.title}</div>
                  <span className={`tag ${s.tag} flex-shrink-0`}>{s.chip}</span>
                </div>
                <p className="mt-1 text-sm text-ink-700">{ins.body}</p>
                {ins.hint && <p className="mt-1 text-[11px] italic text-ink-500">{ins.hint}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
