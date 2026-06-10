/**
 * Grow mode — greenhouse (controlled glass house) vs outdoor (open-air field).
 *
 * The single seam that makes outdoor DLI honest: outdoor mode feeds a no-loss
 * envelope into the (unchanged) grow-core solar model, so the glazing
 * transmission term collapses to 1.0 and `greenhouseDLI === outdoorDLI`. Without
 * this, hiding the glass house in 3D would still leave the DLI math subtracting
 * glazing loss — i.e. greenhouse-attenuated light labeled as open-air, a
 * fabricated number. This module is the honesty fix, kept pure + tested.
 */

import type { GreenhouseEnvelope } from "./solarModel";

export type GrowMode = "greenhouse" | "outdoor";

/**
 * The "no greenhouse" envelope: full transmission, zero structural / aging /
 * obstruction loss. `netCanopyTransmissionPct(OUTDOOR_ENVELOPE)` is 1.0, so the
 * solar model's greenhouse-transmitted DLI equals the true outdoor DLI.
 *
 * These values are definitional (the *absence* of a structure), NOT empirical
 * coefficients, so — unlike everything in CITATIONS.md — they need no source.
 */
export const OUTDOOR_ENVELOPE: GreenhouseEnvelope = {
  baseTransmissionPct: 100,
  roofTransmissionPct: 100,
  structureShadeLossPct: 0,
  dirtAgingLossPct: 0,
  internalObstructionLossPct: 0,
};

/**
 * Resolve the envelope the transmission / solar models should see for a mode.
 * Greenhouse → the operator's real envelope; outdoor → OUTDOOR_ENVELOPE.
 */
export function envelopeForMode(
  envelope: GreenhouseEnvelope,
  mode: GrowMode,
): GreenhouseEnvelope {
  return mode === "outdoor" ? OUTDOOR_ENVELOPE : envelope;
}

/** True when the mode has no glass envelope (open-air field). */
export function isOutdoor(mode: GrowMode): boolean {
  return mode === "outdoor";
}
