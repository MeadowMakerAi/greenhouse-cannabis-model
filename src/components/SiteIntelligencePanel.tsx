import { useState } from "react";
import { useSiteIntelligence } from "../context/useSiteIntelligence";
import { useScenario } from "../context/ScenarioContext";

/**
 * Site Intelligence — what the program knows about THIS property from its
 * coordinates. Progressive disclosure: lead with a plain-English brief + hero
 * metrics; the raw numbers and the "ask Sage" deep-dive sit behind. The point
 * is to hide the complexity and hand the grower the conclusion.
 */
export default function SiteIntelligencePanel() {
  const { profile, loading, error } = useSiteIntelligence();
  const { inputs } = useScenario();
  const [showDetail, setShowDetail] = useState(false);

  const askSage = () => {
    const seed = profile
      ? `Given my site profile — USDA zone ${profile.hardinessZone}, ~${profile.frostFreeDays} frost-free days (${profile.lastSpringFrost}–${profile.firstFallFrost}), ${profile.gddBase50} GDD₅₀, ${profile.elevationFt ? Math.round(profile.elevationFt) + " ft elevation" : "elevation n/a"} at ${inputs.latitude.toFixed(3)}, ${inputs.longitude.toFixed(3)} — what does this mean for running a heated cannabis greenhouse here? Where's my shoulder-season heating risk, and which months can I coast on natural light?`
      : `Tell me what my coordinates (${inputs.latitude.toFixed(3)}, ${inputs.longitude.toFixed(3)}) imply for greenhouse cultivation.`;
    window.dispatchEvent(
      new CustomEvent("greenhouse-model:open-agent", { detail: { seed } }),
    );
  };

  return (
    <div className="card border-leaf-500/30">
      <div className="card-header">
        <span>📍 Site intelligence</span>
        <span className="text-[11px] text-ink-500">
          {inputs.siteAddress} · {inputs.latitude.toFixed(3)}, {inputs.longitude.toFixed(3)}
        </span>
      </div>
      <div className="card-body space-y-3">
        {loading && (
          <div className="text-sm text-ink-500">
            Reading the property — elevation + 10-year temperature normals…
          </div>
        )}
        {error && !profile && (
          <div className="text-sm text-warn-500">
            Couldn't reach the climate service ({error}). Site brief unavailable offline.
          </div>
        )}
        {profile && (
          <>
            {/* Lead with the conclusion. */}
            <p className="text-sm leading-relaxed text-ink-800">{profile.brief}</p>

            {/* Hero metrics. */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { label: "USDA zone", value: profile.hardinessZone, sub: `low ${profile.extremeMinF}°F` },
                { label: "Frost-free", value: `${profile.frostFreeDays} d`, sub: `${profile.lastSpringFrost}–${profile.firstFallFrost}` },
                { label: "GDD₅₀ / yr", value: profile.gddBase50.toLocaleString(), sub: `${profile.years}-yr avg` },
                { label: "Elevation", value: profile.elevationFt != null ? `${Math.round(profile.elevationFt)} ft` : "—", sub: "above sea level" },
              ].map((m) => (
                <div key={m.label} className="rounded-lg border border-ink-200/70 bg-ink-50/60 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-ink-500">{m.label}</div>
                  <div className="font-mono text-lg font-semibold tabular-nums text-ink-900">{m.value}</div>
                  <div className="text-[10px] text-ink-500">{m.sub}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={askSage}
                className="rounded-lg bg-leaf-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-leaf-600"
              >
                Ask Sage about my site
              </button>
              <button
                type="button"
                onClick={() => setShowDetail((v) => !v)}
                className="text-[11px] font-medium text-ink-500 hover:text-ink-800"
              >
                {showDetail ? "Hide details" : "What else do we know?"}
              </button>
            </div>

            {showDetail && (
              <div className="rounded-lg border border-ink-200/70 bg-white p-3 text-xs text-ink-700">
                <ul className="space-y-1">
                  <li>· Avg last spring frost <strong>{profile.lastSpringFrost}</strong>, first fall frost <strong>{profile.firstFallFrost}</strong> ({profile.years}-yr normal).</li>
                  <li>· Avg annual extreme minimum <strong>{profile.extremeMinF} °F</strong> → USDA hardiness <strong>{profile.hardinessZone}</strong>.</li>
                  <li>· <strong>{profile.gddBase50.toLocaleString()} GDD₅₀</strong> accumulated per year (base 50 °F, 86 °F cap).</li>
                </ul>
                <p className="mt-2 text-[11px] italic text-ink-500">
                  Derived live from your coordinates (Open-Meteo elevation + ERA5 archive).
                  Next layer (needs a server proxy): USDA SSURGO soil, USGS slope/aspect,
                  and Cropland Data Layer crop neighbors.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
