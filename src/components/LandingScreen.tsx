/**
 * Landing screen — first-visit orientation before the dashboard loads.
 *
 * Editorial layout (per /somersault round-2 synthesis):
 *   • Hero headline in IBM Plex Sans Condensed at display weight,
 *     deliberately broken across three lines so the title reads as
 *     a magazine cover, not a SaaS welcome banner.
 *   • One real screenshot of the live 3D scene as the visual anchor —
 *     no abstract gradient blobs, no marketing illustrations.
 *   • Capability ledger underneath: what the model computes, in three
 *     short rows, hairline-divided, tabular figures.
 *   • Screening-level disclaimer chip (matches the OutputSummary one).
 *   • Two CTAs: primary "Launch the model →" (dismisses + persists),
 *     secondary "View the code on GitHub" (opens repo).
 *
 * Dismissal: localStorage `greenhouse-model:landingDismissed`. Cleared by
 * the dashboard footer's "Show intro" affordance so users can return.
 */

const REPO_URL = "https://github.com/MeadowMakerAi/greenhouse-cannabis-model";

export default function LandingScreen({
  onLaunch,
}: {
  onLaunch: () => void;
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f3f5f8]">
      {/* Background: three layered radials + a subtle vertical falloff so
          the page reads as a lit room, not a flat sheet. Same palette as
          the dashboard's body background but stronger. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: [
            "radial-gradient(at 0% 0%, rgba(47, 143, 108, 0.14), transparent 55%)",
            "radial-gradient(at 100% 100%, rgba(58, 90, 145, 0.10), transparent 55%)",
            "radial-gradient(ellipse at center, transparent 50%, rgba(13, 17, 23, 0.06) 100%)",
          ].join(", "),
        }}
      />
      {/* Subliminal 24px grid behind the content — Vercel/Geist signature. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(13,17,23,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(13,17,23,0.05) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.5), rgba(0,0,0,0) 75%)",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-8 lg:px-10 lg:py-12">
        {/* ── Top bar — identity + meta ── */}
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-base font-bold text-white"
              style={{
                background:
                  "radial-gradient(120% 120% at 30% 20%, #43a47e 0%, #2f8f6c 55%, #185640 100%)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.25) inset, 0 4px 12px -2px rgba(47,143,108,0.45), 0 1px 2px rgba(13,17,23,0.2)",
              }}
            >
              GH
            </div>
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.10em] text-ink-500">
                Greenhouse cannabis model
              </div>
              <div className="text-[11px] text-ink-500 proportional-nums">
                v0.1.0 · MIT · open source
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-ink-500">
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-ink-900 hover:underline"
            >
              GitHub
            </a>
            <span className="text-ink-300">·</span>
            <a
              href={`${REPO_URL}/blob/main/README.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-ink-900 hover:underline"
            >
              README
            </a>
            <span className="text-ink-300">·</span>
            <a
              href={`${REPO_URL}/blob/main/CITATIONS.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-ink-900 hover:underline"
            >
              Citations
            </a>
          </div>
        </header>

        {/* ── Hero: headline + visual anchor ── */}
        <section className="mt-10 grid flex-1 grid-cols-1 gap-10 lg:mt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
          <div className="flex flex-col justify-center">
            <h1
              className="font-display text-ink-900"
              style={{
                fontSize: "clamp(3rem, 9vw, 7rem)",
                fontWeight: 600,
                lineHeight: 0.92,
                letterSpacing: "-0.035em",
              }}
            >
              <span className="block">Greenhouse</span>
              <span className="block">cannabis</span>
              <span className="block text-leaf-700">model.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-700 proportional-nums">
              A screening-level decision-support tool for cannabis greenhouse
              design. Set your geometry, climate, and fixtures in the
              sidebar; watch DLI, supplemental light, HVAC load, yield, and
              a live 3D scene update in real time.
            </p>
            <div className="mt-4 inline-flex w-fit items-center gap-2 rounded-full border border-warn-500/30 bg-warn-500/5 px-3 py-1 text-[11px] font-medium text-warn-600">
              <span>⚠</span>
              <span>
                Screening-level only — validate against stamped engineering
                before capex.
              </span>
            </div>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onLaunch}
                className="btn-primary !px-5 !py-3 !text-sm"
              >
                Launch the model →
              </button>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn !px-5 !py-3 !text-sm"
              >
                View the code on GitHub
              </a>
            </div>
          </div>

          {/* Visual anchor: real screenshot of the live 3D scene */}
          <div className="relative flex items-center">
            <div
              className="relative w-full overflow-hidden rounded-2xl border border-ink-200/70 bg-white"
              style={{
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.9) inset, 0 1px 2px rgba(13,17,23,0.04), 0 12px 28px -12px rgba(13,17,23,0.18), 0 32px 56px -28px rgba(47,143,108,0.18)",
              }}
            >
              <div className="relative overflow-hidden">
                <img
                  src="/landing-hero.png"
                  alt="Live 3D greenhouse simulation at solar noon, showing fixture grid, plant canopy, sun, and HUD telemetry."
                  className="landing-hero-img block h-auto w-full"
                  loading="eager"
                />
              </div>
              {/* Caption strip */}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-ink-200/60 bg-white/85 px-4 py-2 text-[11px] text-ink-500 backdrop-blur-sm">
                <span className="font-semibold uppercase tracking-[0.10em] text-ink-700">
                  Live simulation
                </span>
                <span className="proportional-nums">
                  Solar noon · Jun 21 · Montgomery NY · 41.475°
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Capability ledger — what the model computes ── */}
        <section className="mt-12 lg:mt-16">
          <div className="text-[11px] font-semibold uppercase tracking-[0.10em] text-ink-500">
            The model computes
          </div>
          <div className="mt-2 grid gap-x-6 gap-y-3 border-t border-ink-200/80 pt-4 sm:grid-cols-3 sm:divide-x sm:divide-ink-200/70">
            <Capability
              label="Light + electrical"
              items={[
                "DLI delivered (mol/m²/d)",
                "Supplemental PPFD + fixture count",
                "Installed kW + service voltage",
                "Annual lighting energy + cost",
              ]}
            />
            <Capability
              label="Climate + HVAC"
              items={[
                "Cooling tons (sensible + latent)",
                "Heating load with thermal screen",
                "Dehumidification pints/day",
                "Wet-bulb / VPD season profile",
              ]}
            />
            <Capability
              label="Cultivation science"
              items={[
                "Yield projection by phase",
                "Botrytis + powdery-mildew pressure",
                "Crop steering alignment",
                "Live 3D simulation clock",
              ]}
            />
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="mt-10 flex flex-wrap items-baseline justify-between gap-3 border-t border-ink-200/80 pt-4 text-[11px] text-ink-500 proportional-nums lg:mt-12">
          <div>
            Built with React 19 + TypeScript + React Three Fiber + Tailwind.
            Climate data via NASA POWER + Open-Meteo. Citations in{" "}
            <a
              href={`${REPO_URL}/blob/main/CITATIONS.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-2 hover:text-ink-900 hover:underline"
            >
              CITATIONS.md
            </a>
            .
          </div>
          <button
            type="button"
            onClick={onLaunch}
            className="text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
          >
            Skip → dashboard
          </button>
        </footer>
      </div>
    </div>
  );
}

function Capability({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.10em] text-leaf-700">
        {label}
      </div>
      <ul className="mt-2 space-y-1 text-sm text-ink-700 proportional-nums">
        {items.map((item, i) => (
          <li key={i} className="flex items-baseline gap-2">
            <span className="text-ink-300">·</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
