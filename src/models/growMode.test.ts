import { describe, it, expect } from "vitest";
import { OUTDOOR_ENVELOPE, envelopeForMode, isOutdoor } from "./growMode";
import { netCanopyTransmissionPct, type GreenhouseEnvelope } from "./solarModel";

// A representative real greenhouse envelope (double-poly with some aging/shade).
const GREENHOUSE: GreenhouseEnvelope = {
  baseTransmissionPct: 88,
  roofTransmissionPct: 90,
  structureShadeLossPct: 8,
  dirtAgingLossPct: 5,
  internalObstructionLossPct: 4,
};

describe("OUTDOOR_ENVELOPE — the no-glazing seam", () => {
  it("is full transmission with zero loss", () => {
    expect(OUTDOOR_ENVELOPE.baseTransmissionPct).toBe(100);
    expect(OUTDOOR_ENVELOPE.roofTransmissionPct).toBe(100);
    expect(OUTDOOR_ENVELOPE.structureShadeLossPct).toBe(0);
    expect(OUTDOOR_ENVELOPE.dirtAgingLossPct).toBe(0);
    expect(OUTDOOR_ENVELOPE.internalObstructionLossPct).toBe(0);
  });

  it("nets to 1.0 transmission — so greenhouseDLI collapses to true outdoor DLI", () => {
    // The honesty contract: open-air light is NOT attenuated by glazing.
    expect(netCanopyTransmissionPct(OUTDOOR_ENVELOPE)).toBeCloseTo(1, 5);
  });

  it("a real greenhouse loses light vs outdoor (helper actually changes the math)", () => {
    // Guards against a no-op: a glass house must transmit < 100%.
    expect(netCanopyTransmissionPct(GREENHOUSE)).toBeLessThan(1);
  });
});

describe("envelopeForMode", () => {
  it("returns the operator envelope unchanged in greenhouse mode", () => {
    expect(envelopeForMode(GREENHOUSE, "greenhouse")).toBe(GREENHOUSE);
  });

  it("returns the no-loss envelope in outdoor mode", () => {
    expect(envelopeForMode(GREENHOUSE, "outdoor")).toBe(OUTDOOR_ENVELOPE);
  });
});

describe("isOutdoor", () => {
  it("distinguishes the two modes", () => {
    expect(isOutdoor("outdoor")).toBe(true);
    expect(isOutdoor("greenhouse")).toBe(false);
  });
});
