import { describe, it, expect } from "vitest";
import {
  extractFindings,
  sanitizeFindingPatch,
  FINDING_PATCH_ALLOWLIST,
} from "../services/sageFindings";

describe("extractFindings", () => {
  it("parses a fenced json findings block and strips it from the report", () => {
    const raw = [
      "Top priority: add a thermal screen.",
      "",
      "```json",
      '{"findings":[{"title":"No thermal screen","summary":"~50% night heat on the table","severity":"savings","confidence":"high","tab":"hvac"}]}',
      "```",
    ].join("\n");
    const { findings, cleanedReport } = extractFindings(raw);
    expect(findings).not.toBeNull();
    expect(findings).toHaveLength(1);
    expect(findings![0].title).toBe("No thermal screen");
    expect(findings![0].severity).toBe("savings");
    expect(findings![0].tab).toBe("hvac");
    // The prose survives; the raw JSON does not leak to the user.
    expect(cleanedReport).toContain("thermal screen");
    expect(cleanedReport).not.toContain("```json");
    expect(cleanedReport).not.toContain('"findings"');
  });

  it("falls back to the raw report when the json is malformed", () => {
    const raw = "Some report.\n```json\n{not valid json}\n```";
    const { findings, cleanedReport } = extractFindings(raw);
    expect(findings).toBeNull();
    expect(cleanedReport).toBe(raw);
  });

  it("returns null findings when no block is present", () => {
    const raw = "Just a normal prose audit with no machine block.";
    const { findings, cleanedReport } = extractFindings(raw);
    expect(findings).toBeNull();
    expect(cleanedReport).toBe(raw);
  });

  it("coerces an invalid severity to info and infers a tab from text", () => {
    const raw =
      '```json\n{"findings":[{"title":"VPD swing","summary":"Wet-bulb margin is thin in July","severity":"bogus"}]}\n```';
    const { findings } = extractFindings(raw);
    expect(findings).not.toBeNull();
    expect(findings![0].severity).toBe("info");
    // "wet-bulb" keyword routes to the humidity tab.
    expect(findings![0].tab).toBe("humidity");
  });

  it("drops findings with neither title nor summary", () => {
    const raw = '```json\n{"findings":[{"severity":"warn"},{"title":"Keep me","summary":"ok"}]}\n```';
    const { findings } = extractFindings(raw);
    expect(findings).toHaveLength(1);
    expect(findings![0].title).toBe("Keep me");
  });

  it("parses a brace-scanned block when there is no code fence", () => {
    const raw =
      'Report text. {"findings":[{"title":"A","summary":"b","severity":"info"}]}';
    const { findings, cleanedReport } = extractFindings(raw);
    expect(findings).toHaveLength(1);
    expect(cleanedReport).toBe("Report text.");
  });
});

describe("sanitizeFindingPatch", () => {
  it("keeps allowlisted primitive keys and drops everything else", () => {
    const patch = sanitizeFindingPatch({
      thermalScreenEnabled: true, // allowlisted boolean
      co2SetpointPpm: 1200, // allowlisted number
      siteAddress: "hack", // NOT allowlisted
      envelope: { baseTransmissionPct: 70 }, // object, dropped
      canopyAreaSqFt: null, // null, dropped
    });
    expect(patch).toEqual({ thermalScreenEnabled: true, co2SetpointPpm: 1200 });
  });

  it("returns undefined when nothing survives", () => {
    expect(sanitizeFindingPatch({ siteAddress: "x", latitude: 40 })).toBeUndefined();
    expect(sanitizeFindingPatch(null)).toBeUndefined();
    expect(sanitizeFindingPatch([1, 2, 3])).toBeUndefined();
  });

  it("never allows site coordinates or nested envelope through", () => {
    // Guard the blast-radius contract: an injected patch can't relocate the
    // site or rewrite the envelope object.
    expect(FINDING_PATCH_ALLOWLIST.has("latitude")).toBe(false);
    expect(FINDING_PATCH_ALLOWLIST.has("longitude")).toBe(false);
    expect(FINDING_PATCH_ALLOWLIST.has("envelope")).toBe(false);
  });
});
