import { useScenario } from "../context/ScenarioContext";
import { fmtInt } from "../utils/formatting";

/**
 * Collapsed inline state for the 3D greenhouse on phones (Phase: mobile
 * scene UX). The heavy R3F/three bundle is NOT mounted here — this is a
 * pure tap target that opens the full-screen overlay, where WebGL loads on
 * demand. Keeps dashboard scroll fast and battery cheap on iPhone.
 *
 * Shows a quick scenario summary so the card still reads as "the model"
 * rather than a blank placeholder.
 */
export default function SceneThumbnailCard({
  onOpen,
}: {
  onOpen: () => void;
}) {
  const { inputs } = useScenario();
  const stats = [
    `${fmtInt(inputs.greenhouseLengthFt)} × ${fmtInt(inputs.greenhouseWidthFt)} ft`,
    `${fmtInt(inputs.canopyAreaSqFt)} ft² canopy`,
    `${fmtInt(inputs.flowerPhotoperiodHours)} h photoperiod`,
  ];

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Open the interactive 3D greenhouse full screen"
      className="group relative block w-full overflow-hidden rounded-2xl border border-leaf-500/30 text-left shadow-e2 transition-transform duration-150 active:scale-[0.99]"
      style={{
        background:
          "radial-gradient(130% 120% at 20% 0%, #2f5d44 0%, #1d3b2c 55%, #122618 100%)",
      }}
    >
      {/* Faux horizon / ground band so the card reads as a greenhouse scene
          without paying for WebGL. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background:
            "linear-gradient(to top, rgba(67,164,126,0.35), transparent)",
        }}
      />
      <div className="relative flex items-center gap-4 p-5">
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-2xl"
          style={{
            background:
              "radial-gradient(120% 120% at 30% 20%, #43a47e 0%, #2f8f6c 55%, #185640 100%)",
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.25) inset, 0 6px 16px -4px rgba(47,143,108,0.5)",
          }}
        >
          🌿
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-leaf-100/90">
            Live 3D greenhouse
          </div>
          <div className="mt-0.5 text-base font-semibold text-white">
            Tap to open full screen
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {stats.map((s) => (
              <span
                key={s}
                className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-medium text-white/85 backdrop-blur-sm"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 text-white transition-colors group-active:bg-white/20">
          {/* expand / fullscreen glyph */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M9 3H5a2 2 0 0 0-2 2v4m18 0V5a2 2 0 0 0-2-2h-4M3 15v4a2 2 0 0 0 2 2h4m12-6v4a2 2 0 0 1-2 2h-4"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>
      <div className="relative border-t border-white/10 px-5 py-2 text-[11px] text-white/70">
        Sun · lights · vents · plant growth — interactive, follows the sim clock
      </div>
    </button>
  );
}
