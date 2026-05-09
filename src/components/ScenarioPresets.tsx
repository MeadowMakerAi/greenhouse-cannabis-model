import { useScenario, defaultScenario } from "../context/ScenarioContext";

const presets = {
  premiumHybrid: {
    label: "Premium LED Hybrid (default)",
    patch: { ...defaultScenario },
  },
  lowCapexHPS: {
    label: "Low capex HPS",
    patch: {
      fixtureId: "doubleEndedHPS" as const,
      underCanopyEnabled: false,
      co2Enabled: false,
      shadeEnabled: true,
      cropTargetId: "minimumFlower" as const,
      ventilationMode: "moderate" as const,
    },
  },
  sealedPremium: {
    label: "Sealed/semi-sealed CO₂",
    patch: {
      fixtureId: "ledPremium" as const,
      underCanopyEnabled: true,
      co2Enabled: true,
      co2SetpointPpm: 1200,
      cropTargetId: "co2Enhanced" as const,
      ventilationMode: "semi_sealed" as const,
      shadeEnabled: true,
    },
  },
  solarFirst: {
    label: "Solar-first conservative",
    patch: {
      cropTargetId: "minimumFlower" as const,
      fixtureId: "ledHighEfficiency" as const,
      underCanopyEnabled: false,
      co2Enabled: false,
      shadeEnabled: true,
      ventilationMode: "moderate" as const,
    },
  },
};

export default function ScenarioPresets() {
  const { setInputs, reset } = useScenario();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-ink-500">Scenario</span>
      {Object.entries(presets).map(([key, p]) => (
        <button
          key={key}
          type="button"
          onClick={() => setInputs(p.patch)}
          className="rounded border border-ink-300 bg-white px-2 py-1 text-xs hover:bg-leaf-500/5"
        >
          {p.label}
        </button>
      ))}
      <button
        type="button"
        onClick={reset}
        className="rounded border border-ink-300 bg-white px-2 py-1 text-xs hover:bg-warn-500/10"
      >
        Reset
      </button>
    </div>
  );
}
