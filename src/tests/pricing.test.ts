import { describe, it, expect } from "vitest";
import { estimateCost, formatCost } from "../services/pricing";
import type { ChatUsage } from "../services/providers/types";

const u = (model: string, inputTokens: number, outputTokens: number): ChatUsage => ({
  model,
  inputTokens,
  outputTokens,
});

describe("estimateCost", () => {
  it("prices a paid Anthropic model from the table", () => {
    // Sonnet 5 intro: $2/M in, $10/M out. 1M in + 1M out = $12.
    const est = estimateCost(u("claude-sonnet-5", 1_000_000, 1_000_000));
    expect(est?.usd).toBeCloseTo(12, 6);
    expect(est?.isFree).toBe(false);
  });

  it("prices GPT-5.6 Terra correctly", () => {
    // $2.50/M in, $15/M out.
    const est = estimateCost(u("gpt-5.6-terra", 100_000, 10_000));
    expect(est?.usd).toBeCloseTo((100_000 * 2.5 + 10_000 * 15) / 1_000_000, 9);
  });

  it("marks free-tier / local models as free with $0", () => {
    for (const m of ["gemini-2.0-flash", "llama-3.3-70b-versatile", "llama3.2", "deepseek/deepseek-chat-v3.1:free"]) {
      const est = estimateCost(u(m, 500, 500));
      expect(est?.isFree, m).toBe(true);
      expect(est?.usd, m).toBe(0);
    }
  });

  it("returns usd=null for an unpriced/unknown model (no fabricated number)", () => {
    const est = estimateCost(u("some-future-model-x", 1000, 1000));
    expect(est?.usd).toBeNull();
    expect(est?.isFree).toBe(false);
  });

  it("returns null when usage is missing", () => {
    expect(estimateCost(undefined)).toBeNull();
  });
});

describe("formatCost", () => {
  it("formats free, unpriced, tiny, and normal amounts", () => {
    expect(formatCost({ usd: 0, isFree: true, inputTokens: 0, outputTokens: 0 })).toBe("free");
    expect(formatCost({ usd: null, isFree: false, inputTokens: 0, outputTokens: 0 })).toBe("—");
    expect(formatCost({ usd: 0.00005, isFree: false, inputTokens: 0, outputTokens: 0 })).toBe("<$0.0001");
    expect(formatCost({ usd: 0.0056, isFree: false, inputTokens: 0, outputTokens: 0 })).toBe("$0.0056"); // <$0.01 → 4dp
    expect(formatCost({ usd: 0.0123, isFree: false, inputTokens: 0, outputTokens: 0 })).toBe("$0.012"); // <$1 → 3dp
    expect(formatCost({ usd: 1.5, isFree: false, inputTokens: 0, outputTokens: 0 })).toBe("$1.50");
    expect(formatCost(null)).toBe("");
  });
});
