import { useSoil } from "../context/useSoil";
import { useScenario } from "../context/ScenarioContext";

/**
 * Soil — what the program knows about the ground under THIS property, from its
 * coordinates. Static profile (SoilGrids 250 m) + live surface moisture/temp
 * (Open-Meteo). Lead with the texture + pH conclusion; raw values sit behind.
 * Screening-level: a 250 m global model, not a field soil test.
 */
export default function SoilPanel() {
  const { profile, live, loading, unavailable } = useSoil();
  const { inputs } = useScenario();

  const fmt = (v: number | null, digits = 1, unit = "") =>
    v == null ? "—" : `${v.toFixed(digits)}${unit}`;

  const askSage = () => {
    const seed = profile
      ? `My SoilGrids profile here (${inputs.latitude.toFixed(3)}, ${inputs.longitude.toFixed(3)}) is ${profile.texture ?? "unknown-texture"} soil, pH ${fmt(profile.phH2O)}, organic carbon ${fmt(profile.socGkg, 0)} g/kg, CEC ${fmt(profile.cecCmolKg, 0)} cmol/kg. For a cannabis crop, what does this ground imply for amendments, drainage, and whether I'd be better off in pots/media than native soil?`
      : `What does the soil at ${inputs.latitude.toFixed(3)}, ${inputs.longitude.toFixed(3)} imply for cannabis cultivation?`;
    window.dispatchEvent(
      new CustomEvent("greenhouse-model:open-agent", { detail: { seed } }),
    );
  };

  const moisturePct = (m: number | null) =>
    m == null ? "—" : `${(m * 100).toFixed(0)}%`;

  return (
    <div className="card border-leaf-500/30">
      <div className="card-header">
        <span>🌱 Soil</span>
        <span className="text-[11px] text-ink-500">
          {inputs.latitude.toFixed(3)}, {inputs.longitude.toFixed(3)} · SoilGrids 250 m
        </span>
      </div>
      <div className="card-body space-y-3">
        {loading && (
          <div className="text-sm text-ink-500">
            Reading the ground — SoilGrids profile + live surface moisture…
          </div>
        )}
        {!loading && unavailable && (
          <div className="text-sm text-warn-500">
            Couldn't reach the soil services. Soil layer unavailable offline.
          </div>
        )}
        {!loading && !unavailable && (
          <>
            {/* Lead with the conclusion. */}
            <p className="text-sm leading-relaxed text-ink-800">
              {profile?.texture ? (
                <>
                  This site sits on <strong>{profile.texture}</strong> soil
                  {profile.phH2O != null && (
                    <>
                      {" "}at pH <strong>{fmt(profile.phH2O)}</strong>
                    </>
                  )}
                  {profile.phH2O != null &&
                    (profile.phH2O < 6
                      ? " — acidic; cannabis prefers ~6.0–7.0, so expect to lime."
                      : profile.phH2O > 7.2
                        ? " — alkaline of cannabis's ~6.0–7.0 band."
                        : " — within cannabis's ~6.0–7.0 comfort band.")}
                </>
              ) : (
                "Live surface soil only at this location — SoilGrids profile not returned."
              )}
            </p>

            {/* Hero metrics. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "Texture", value: profile?.texture ?? "—", sub: "USDA class" },
                { label: "pH (H₂O)", value: fmt(profile?.phH2O ?? null), sub: "0–5 cm" },
                {
                  label: "Surface moist.",
                  value: moisturePct(live?.moisture0to1 ?? null),
                  sub: "0–1 cm now",
                },
                {
                  label: "Soil temp",
                  value: fmt(live?.soilTempC ?? null, 0, " °C"),
                  sub: "surface now",
                },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-ink-200/70 bg-ink-50/60 px-3 py-2"
                >
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">
                    {m.label}
                  </div>
                  <div className="font-mono text-lg font-semibold tabular-nums text-ink-900">
                    {m.value}
                  </div>
                  <div className="text-[10px] text-ink-500">{m.sub}</div>
                </div>
              ))}
            </div>

            {profile && (
              <div className="rounded-lg border border-ink-200/70 bg-white p-3 text-xs text-ink-700">
                <ul className="space-y-1">
                  <li>
                    · Texture from <strong>{fmt(profile.sandPct, 0)}%</strong>{" "}
                    sand / <strong>{fmt(profile.siltPct, 0)}%</strong> silt /{" "}
                    <strong>{fmt(profile.clayPct, 0)}%</strong> clay.
                  </li>
                  <li>
                    · Organic carbon <strong>{fmt(profile.socGkg, 0)} g/kg</strong>,
                    CEC <strong>{fmt(profile.cecCmolKg, 0)} cmol(c)/kg</strong>,
                    bulk density <strong>{fmt(profile.bulkDensityKgDm3, 2)} kg/dm³</strong>.
                  </li>
                </ul>
                <p className="mt-2 text-[11px] italic text-ink-500">
                  Static profile: SoilGrids 2.0 (ISRIC), a 250 m global model —
                  screening-level, not a field soil test. Live moisture/temp:
                  Open-Meteo. Send a sample to a lab before amending.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={askSage}
              className="rounded-lg bg-leaf-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-leaf-600"
            >
              Ask Sage about my soil
            </button>
          </>
        )}
      </div>
    </div>
  );
}
