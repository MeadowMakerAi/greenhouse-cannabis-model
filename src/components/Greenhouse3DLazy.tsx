import { lazy, Suspense, type ComponentProps } from "react";

/**
 * Lazy proxy for the 3D scene. three + drei + postprocessing add ~1 MB to
 * the gzipped bundle and are only needed on the Live simulation and
 * Build sheet tabs. Loading them on-demand keeps the initial dashboard
 * paint fast (~half the JS), and keeps the landing screen responsive on
 * mobile/slow connections.
 *
 * Suspense fallback is a tasteful placeholder, not a spinner — three.js
 * loads in <500 ms on a warm cache and the fallback should feel like a
 * deliberate "scene initializing" beat, not a stutter.
 */
const Greenhouse3D = lazy(() => import("./Greenhouse3D"));

type Greenhouse3DProps = ComponentProps<typeof Greenhouse3D>;

export default function Greenhouse3DLazy(props: Greenhouse3DProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full min-h-[300px] w-full items-center justify-center rounded-md bg-gradient-to-br from-ink-900/90 to-ink-900/70 text-xs text-white/60">
          <div className="flex flex-col items-center gap-2">
            <div className="h-2 w-32 overflow-hidden rounded bg-white/10">
              <div className="h-full w-1/3 animate-pulse bg-leaf-500/60" />
            </div>
            <div>Loading 3D scene…</div>
          </div>
        </div>
      }
    >
      <Greenhouse3D {...props} />
    </Suspense>
  );
}
