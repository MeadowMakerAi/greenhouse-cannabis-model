import { useEffect, useRef, useState } from "react";

/**
 * Landing screen — first-visit orientation before the dashboard loads.
 *
 * GitHub-inspired premium pass (per direct study of github.com 2026):
 *   • Slow-drift animated mesh gradient background (CSS-only, no JS)
 *   • Mouse-tilt parallax on the hero card (3D rotateX/rotateY follow cursor)
 *   • Scroll-driven section reveals via IntersectionObserver
 *   • One dark "Live preview" section breaks the off-white monotony
 *   • Editorial typography (IBM Plex Sans Condensed display + Inter body)
 *   • Real screenshot as the visual anchor, no abstract illustrations
 *
 * Dismissal: localStorage `greenhouse-model:landingDismissed`. Cleared by
 * the dashboard header's GH monogram so users can return to the intro.
 */

const REPO_URL = "https://github.com/MeadowMakerAi/greenhouse-cannabis-model";

/**
 * useReveal — adds `is-visible` class when the element enters the viewport.
 * Mirrors the GitHub landing's "fade-up on scroll" pattern. Each element
 * with `data-reveal` reveals independently; the observer disconnects after
 * first reveal so we don't churn on re-scrolls.
 */
function useReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (!targets.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "-10% 0px -10% 0px", threshold: 0.15 },
    );
    targets.forEach((t) => observer.observe(t));
    return () => observer.disconnect();
  }, []);
}

export default function LandingScreen({
  onLaunch,
}: {
  onLaunch: () => void;
}) {
  useReveal();

  // Mouse-tilt parallax on the hero card. Track cursor as -1..1 in both
  // axes relative to the card; CSS transform rotates ~6° max in either
  // direction. Lerped via inline style updates; cheap (just opacity +
  // transform, no layout reads).
  const heroCardRef = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const onHeroMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = heroCardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    setTilt({
      ry: (x - 0.5) * 6, // rotate around Y axis (left/right)
      rx: -(y - 0.5) * 6, // rotate around X axis (up/down), inverted
    });
  };
  const onHeroMouseLeave = () => setTilt({ rx: 0, ry: 0 });

  return (
    <div className="landing-root relative min-h-screen overflow-hidden bg-[#f3f5f8]">
      {/* ── Animated mesh gradient background ──
          Four large radials at different positions, slow-drifting via the
          `landing-mesh-drift` keyframe. Replaces the previous static
          radials. Premium signal without GPU cost (no backdrop-filter).
          Mask fades it at top and bottom so it doesn't dominate. */}
      <div className="landing-mesh pointer-events-none absolute inset-0" />

      {/* Subliminal 24px grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(13,17,23,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(13,17,23,0.05) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          maskImage:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.45), rgba(0,0,0,0) 75%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-8 lg:px-10 lg:py-12">
        {/* ── Top bar ── */}
        <header className="flex flex-wrap items-center justify-between gap-3" data-reveal>
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
            <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-ink-900 hover:underline">GitHub</a>
            <span className="text-ink-300">·</span>
            <a href={`${REPO_URL}/blob/main/README.md`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-ink-900 hover:underline">README</a>
            <span className="text-ink-300">·</span>
            <a href={`${REPO_URL}/blob/main/CITATIONS.md`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-ink-900 hover:underline">Citations</a>
          </div>
        </header>

        {/* ── Hero: headline + tilt-parallax visual ── */}
        <section className="mt-10 grid grid-cols-1 gap-10 lg:mt-16 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
          <div className="flex flex-col justify-center" data-reveal>
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
              <span>Screening-level only — validate against stamped engineering before capex.</span>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" onClick={onLaunch} className="btn-primary !px-5 !py-3 !text-sm">
                Launch the model →
              </button>
              <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="btn !px-5 !py-3 !text-sm">
                View the code on GitHub
              </a>
            </div>
          </div>

          {/* Visual anchor with mouse-tilt parallax */}
          <div className="relative flex items-center" data-reveal style={{ perspective: "1400px" }}>
            <div
              ref={heroCardRef}
              onMouseMove={onHeroMouseMove}
              onMouseLeave={onHeroMouseLeave}
              className="relative w-full overflow-hidden rounded-2xl border border-ink-200/70 bg-white transition-transform duration-300 ease-out"
              style={{
                transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
                transformStyle: "preserve-3d",
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
                {/* Specular sheen — gloss that tracks the tilt direction */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(${135 + tilt.ry * 8}deg, rgba(255,255,255,${0.18 - Math.abs(tilt.ry) * 0.01}), transparent 55%)`,
                    mixBlendMode: "overlay",
                    transition: "background 220ms ease-out",
                  }}
                />
              </div>
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

        {/* ── Capability ledger ── */}
        <section className="mt-16" data-reveal>
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
      </div>

      {/* ── Dark band: "Live preview" with featured numbers ──
          Breaks the off-white monotony. Pattern: GitHub's section-pivot
          where every few scroll-segments the bg color shifts dramatically.
          Here it's ink-900 → ink-800 with leaf-500/8 ambient — feels like
          stepping into the simulation. */}
      <section className="relative mt-16 overflow-hidden bg-ink-900 py-20 lg:mt-24 lg:py-28" data-reveal>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: [
              "radial-gradient(at 15% 10%, rgba(47,143,108,0.18), transparent 50%)",
              "radial-gradient(at 85% 90%, rgba(58,90,145,0.14), transparent 55%)",
              "radial-gradient(at 50% 50%, rgba(232,176,74,0.08), transparent 60%)",
            ].join(", "),
          }}
        />
        <div className="relative mx-auto max-w-6xl px-6 lg:px-10">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.10em] text-leaf-400">
                Live preview
              </div>
              <h2
                className="mt-3 font-display text-white"
                style={{
                  fontSize: "clamp(2rem, 4.5vw, 3.5rem)",
                  fontWeight: 600,
                  lineHeight: 1.0,
                  letterSpacing: "-0.025em",
                }}
              >
                Every number on the dashboard is{" "}
                <span className="text-leaf-400">live-computed</span> from your
                inputs.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-300 proportional-nums">
                Change a fixture, the wattage updates. Move the simulation
                clock, the sun moves and the plants grow. Switch climate
                providers, the heating load recomputes. No mock data — every
                value traces to a sourced coefficient in{" "}
                <a
                  href={`${REPO_URL}/blob/main/CITATIONS.md`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline-offset-2 hover:text-white hover:underline"
                >
                  CITATIONS.md
                </a>
                .
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <PreviewStat value="128,084" unit="kWh/yr" label="Annual lighting energy" />
              <PreviewStat value="$20,493" unit="" label="Annual cost @ $0.16/kWh" />
              <PreviewStat value="31.6" unit="kW" label="Peak overhead lighting" />
              <PreviewStat value="23.9" unit="tons" label="Peak cooling load" />
              <PreviewStat value="40" unit="mol/m²/d" label="DLI target" accent="leaf" />
              <PreviewStat value="60%" unit="" label="Net canopy transmission" />
            </div>
          </div>
        </div>
      </section>

      {/* ── How it works — 3 steps, hairline-divided ── */}
      <section className="relative bg-[#f3f5f8] py-20 lg:py-24" data-reveal>
        <div className="mx-auto max-w-6xl px-6 lg:px-10">
          <div className="text-[11px] font-semibold uppercase tracking-[0.10em] text-ink-500">
            How it works
          </div>
          <div className="mt-2 grid gap-x-8 gap-y-6 border-t border-ink-200/80 pt-6 md:grid-cols-3 md:divide-x md:divide-ink-200/70">
            <Step
              n="01"
              title="Set parameters"
              body="Geometry, glazing, photoperiod, DLI target, fixture, climate. Defaults seed Montgomery NY; override any value at runtime."
            />
            <Step
              n="02"
              title="Watch the model compute"
              body="Every input feeds a pure model function in src/models/. Annual energy, peak loads, yield, pathogen pressure update on every change."
            />
            <Step
              n="03"
              title="Validate before capex"
              body="The model is screening-level. Outputs disclose this and refer you to stamped engineering review. CITATIONS.md sources every coefficient."
            />
          </div>
        </div>
      </section>

      {/* ── Footer CTA ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-leaf-700 via-leaf-600 to-leaf-700 py-16 lg:py-20" data-reveal>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(at 30% 30%, rgba(255,255,255,0.16), transparent 55%), radial-gradient(at 70% 80%, rgba(13,17,23,0.18), transparent 55%)",
          }}
        />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-6 lg:flex-row lg:items-center lg:justify-between lg:px-10">
          <div>
            <h2
              className="font-display text-white"
              style={{
                fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)",
                fontWeight: 600,
                lineHeight: 1.05,
                letterSpacing: "-0.02em",
              }}
            >
              Open the model. Start sizing.
            </h2>
            <p className="mt-2 max-w-lg text-base leading-relaxed text-leaf-50/90 proportional-nums">
              Free, open-source, MIT-licensed. Runs entirely in the browser.
              The chatbot is BYO Anthropic key.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onLaunch}
              className="!rounded-lg !border !border-white/20 !bg-white !px-6 !py-3 !text-sm !font-semibold !text-leaf-700 !shadow-e3 transition-all duration-200 hover:-translate-y-0.5 hover:!bg-white/95 hover:!shadow-e4"
            >
              Launch the model →
            </button>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-white/30 px-6 py-3 text-sm font-medium text-white transition hover:bg-white/10"
            >
              GitHub →
            </a>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative bg-[#f3f5f8] py-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-baseline justify-between gap-3 border-t border-ink-200/80 px-6 pt-4 text-[11px] text-ink-500 proportional-nums lg:px-10">
          <div>
            Built with React 19 + TypeScript + React Three Fiber + Tailwind.
            Climate data via NASA POWER + Open-Meteo. Citations in{" "}
            <a href={`${REPO_URL}/blob/main/CITATIONS.md`} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:text-ink-900 hover:underline">CITATIONS.md</a>.
          </div>
          <button
            type="button"
            onClick={onLaunch}
            className="text-ink-500 underline-offset-2 hover:text-ink-900 hover:underline"
          >
            Skip → dashboard
          </button>
        </div>
      </footer>
    </div>
  );
}

function Capability({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.10em] text-leaf-700">{label}</div>
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

function PreviewStat({
  value,
  unit,
  label,
  accent,
}: {
  value: string;
  unit: string;
  label: string;
  accent?: "leaf";
}) {
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 backdrop-blur-sm"
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset" }}
    >
      <div className="text-[10px] font-semibold uppercase tracking-[0.10em] text-ink-300/80">{label}</div>
      <div
        className="mt-1 font-display"
        style={{
          fontSize: "clamp(1.5rem, 2.5vw, 2.25rem)",
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          fontVariantNumeric: "tabular-nums",
          color: accent === "leaf" ? "#5fc69a" : "#ffffff",
        }}
      >
        {value}
        {unit && <span className="ml-1.5 text-xs font-medium text-ink-300">{unit}</span>}
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="md:px-5 md:first:pl-0 md:last:pr-0">
      <div
        className="font-display text-leaf-700"
        style={{ fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1 }}
      >
        {n}
      </div>
      <h3 className="mt-3 text-lg font-semibold text-ink-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-ink-700 proportional-nums">{body}</p>
    </div>
  );
}
