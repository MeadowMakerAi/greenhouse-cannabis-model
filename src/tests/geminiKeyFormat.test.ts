import { describe, it, expect } from "vitest";
import { isProviderKeyValid } from "../services/providers";

// Regression: Google issues newer AQ.-prefixed Gemini keys (AI Studio 2025+).
// The old validator only matched AIza… and locked those users out of Sage.
describe("gemini key format", () => {
  it("accepts the classic AIza… format", () => {
    expect(isProviderKeyValid("gemini", "AIzaSy" + "a".repeat(33))).toBe(true);
  });

  it("accepts the newer AQ.… format", () => {
    expect(isProviderKeyValid("gemini", "AQ.Ab" + "8".repeat(40))).toBe(true);
  });

  it("still rejects an obviously wrong key", () => {
    expect(isProviderKeyValid("gemini", "sk-not-a-gemini-key")).toBe(false);
    expect(isProviderKeyValid("gemini", "AQ.short")).toBe(false);
  });
});
