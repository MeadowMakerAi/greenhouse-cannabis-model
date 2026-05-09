import { describe, expect, it } from "vitest";
import { kelvinToRGB, sunKelvinFromElevation, skyParamsFromElevation } from "../models/kelvinModel";

describe("kelvinToRGB", () => {
  it("5500K is approximately neutral white", () => {
    const c = kelvinToRGB(5500);
    expect(c.r).toBeGreaterThan(245);
    expect(c.g).toBeGreaterThan(230);
    expect(c.b).toBeGreaterThan(220);
  });

  it("2000K is warm orange (R high, G mid, B low)", () => {
    const c = kelvinToRGB(2000);
    expect(c.r).toBe(255);
    expect(c.g).toBeLessThan(180);
    expect(c.b).toBeLessThan(80);
  });

  it("10000K is cool blue (R lower, B high)", () => {
    const c = kelvinToRGB(10000);
    expect(c.b).toBe(255);
    expect(c.r).toBeLessThan(220);
  });
});

describe("sunKelvinFromElevation", () => {
  it("noon (60° elev) returns ~5800K", () => {
    expect(sunKelvinFromElevation(60)).toBe(5800);
  });

  it("golden hour (5° elev) returns ~3500K", () => {
    expect(sunKelvinFromElevation(5)).toBeCloseTo(3500, 0);
  });

  it("horizon (0°) returns ~2400K", () => {
    expect(sunKelvinFromElevation(0)).toBe(2400);
  });

  it("monotonic: higher elevation → cooler color", () => {
    expect(sunKelvinFromElevation(45)).toBeGreaterThan(sunKelvinFromElevation(15));
    expect(sunKelvinFromElevation(15)).toBeGreaterThan(sunKelvinFromElevation(5));
    expect(sunKelvinFromElevation(5)).toBeGreaterThan(sunKelvinFromElevation(0));
  });
});

describe("skyParamsFromElevation", () => {
  it("noon (60°) gives clear sky params (low turbidity, low rayleigh)", () => {
    const p = skyParamsFromElevation(60);
    expect(p.turbidity).toBeCloseTo(2, 0);
    expect(p.rayleigh).toBeCloseTo(0.5, 1);
  });

  it("horizon (0°) gives warm hazy params (high turbidity)", () => {
    const p = skyParamsFromElevation(0);
    expect(p.turbidity).toBe(6);
    expect(p.rayleigh).toBeCloseTo(1.2, 1);
  });

  it("below horizon returns dim params", () => {
    const p = skyParamsFromElevation(-10);
    expect(p.turbidity).toBeLessThan(2);
  });
});
