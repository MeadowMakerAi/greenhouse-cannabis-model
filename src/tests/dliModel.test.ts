import { describe, expect, it } from "vitest";
import { ppfdToDLI, dliToPPFD, solarKwhToPARDLI } from "../models/dliModel";

describe("dliModel", () => {
  it("ppfdToDLI(1000, 12) ≈ 43.2", () => {
    expect(ppfdToDLI(1000, 12)).toBeCloseTo(43.2, 2);
  });

  it("dliToPPFD(40, 12) ≈ 925.93", () => {
    expect(dliToPPFD(40, 12)).toBeCloseTo(925.93, 1);
  });

  it("dliToPPFD handles zero photoperiod", () => {
    expect(dliToPPFD(40, 0)).toBe(0);
  });

  it("solarKwhToPARDLI default factor 7.35", () => {
    expect(solarKwhToPARDLI(5)).toBeCloseTo(36.75, 2);
  });

  it("ppfdToDLI is monotonic in PPFD", () => {
    expect(ppfdToDLI(700, 12)).toBeLessThan(ppfdToDLI(1000, 12));
  });

  it("ppfdToDLI ↔ dliToPPFD round trip", () => {
    const ppfd = 900;
    const dli = ppfdToDLI(ppfd, 12);
    expect(dliToPPFD(dli, 12)).toBeCloseTo(ppfd, 6);
  });
});
