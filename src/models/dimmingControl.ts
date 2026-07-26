/**
 * Real-time supplemental-lighting dim law — light-meter / PPFD-setpoint control.
 *
 * Pure function shared by useLiveDynamics (the live 24h sim) and its test so the
 * two cannot drift. The "light meter" is the instantaneous natural canopy PPFD;
 * the fixtures top the canopy up to the target setpoint and fade as sunlight
 * rises.
 *
 * dim = fraction of INSTALLED fixture output needed to fill the gap to target,
 * capped at 100% (you cannot exceed installed capacity). supplemental =
 * dim × installed full output, so the canopy holds flat at target while the
 * fixtures have headroom and rides down to natural-only once the sun alone
 * exceeds target (the caller switches lights off there).
 *
 * "Installed full output" is the fixtures' NAMEPLATE canopy PPFD, so dim is a
 * fraction of nameplate power — i.e. literally "what % the Gavitas run at."
 * The caller scales lighting heat by the same dim × nameplate-kW basis.
 *
 * NOTE this is a PPFD-setpoint (hold-at-target) controller, not a DLI-
 * integrating one: it clips midday overshoot and does not compensate for it,
 * so daily DLI can fall below the sizing target on dark days. A predictive
 * DLI-sum mode (Cornell LASSI style) is a future option.
 */
export interface DimInput {
  /** Canopy PPFD setpoint (µmol/m²/s). */
  targetPPFD: number;
  /** Instantaneous natural canopy PPFD — the light-meter reading. */
  naturalPPFD: number;
  /** Full-power (nameplate) canopy PPFD the installed fixtures deliver — the
   *  physical "100%". */
  installedFullPPFD: number;
  /** Whether the fixtures are commanded on (in photoperiod and not already
   *  bright-sufficient). */
  on: boolean;
}

export interface DimResult {
  /** 0..1 fraction of installed (nameplate) fixture power. */
  dimLevel: number;
  /** Supplemental canopy PPFD delivered at this dim level. */
  supplementalPPFD: number;
}

export function supplementalDim({
  targetPPFD,
  naturalPPFD,
  installedFullPPFD,
  on,
}: DimInput): DimResult {
  const deficit = Math.max(0, targetPPFD - naturalPPFD);
  const dimLevel =
    on && installedFullPPFD > 0 ? Math.min(1, deficit / installedFullPPFD) : 0;
  return { dimLevel, supplementalPPFD: dimLevel * installedFullPPFD };
}
