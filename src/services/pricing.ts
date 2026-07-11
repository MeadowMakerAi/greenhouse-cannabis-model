import type { ChatUsage } from "./providers/types";

/**
 * Estimated model pricing, USD per 1M tokens (input / output).
 *
 * Prices as of 2026-07-10. This drives the cost meter, which is an ESTIMATE
 * surfaced to the user — NOT a billing source of truth. Providers change
 * pricing; update this table (and the date above) when they do. Anything not
 * listed and not matched as free returns `usd: null` so the meter shows token
 * counts WITHOUT inventing a dollar figure (ZERO-FABRICATION: no made-up numbers).
 *
 * Note: Claude Sonnet 5 carries introductory pricing ($2/$10) through
 * 2026-08-31, then standard $3/$15 — the intro rate is used here; revisit Sep 1.
 */
interface Price {
  in: number; // USD per 1M input tokens
  out: number; // USD per 1M output tokens
}

const PRICES: Record<string, Price> = {
  // Anthropic
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-4-8": { in: 5, out: 25 },
  "claude-fable-5": { in: 10, out: 50 },
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
  // OpenAI GPT-5.6 family
  "gpt-5.6-sol": { in: 5, out: 30 },
  "gpt-5.6-terra": { in: 2.5, out: 15 },
  "gpt-5.6-luna": { in: 1, out: 6 },
};

// Model ids treated as free (Gemini free tier, Groq free, local Ollama,
// OpenRouter ":free" variants). Substring/suffix match on the model id.
const FREE_PATTERNS: RegExp[] = [
  /:free$/i,
  /^gemini-/i,
  /^llama/i,
  /^qwen/i,
  /^deepseek-r1/i,
];

export interface CostEstimate {
  /** USD estimate, or null when the model is unpriced (show tokens only). */
  usd: number | null;
  isFree: boolean;
  inputTokens: number;
  outputTokens: number;
}

export function estimateCost(usage: ChatUsage | undefined): CostEstimate | null {
  if (!usage) return null;
  const { inputTokens, outputTokens, model } = usage;
  if (FREE_PATTERNS.some((re) => re.test(model))) {
    return { usd: 0, isFree: true, inputTokens, outputTokens };
  }
  const p = PRICES[model];
  const usd = p ? (inputTokens * p.in + outputTokens * p.out) / 1_000_000 : null;
  return { usd, isFree: false, inputTokens, outputTokens };
}

/** Compact meter formatting: "$0.0123" / "<$0.0001" / "free" / "—" (unpriced). */
export function formatCost(est: CostEstimate | null): string {
  if (!est) return "";
  if (est.isFree) return "free";
  if (est.usd === null) return "—";
  if (est.usd === 0) return "$0.00";
  if (est.usd < 0.0001) return "<$0.0001";
  const digits = est.usd < 0.01 ? 4 : est.usd < 1 ? 3 : 2;
  return "$" + est.usd.toFixed(digits);
}
