import { afterEach, describe, expect, it, vi } from "vitest";
import { chatTurn, isRateLimitError } from "../services/chatbotService";
import type { ChatMessage } from "../services/providers/types";

// Valid-format keys so the dispatcher's key-format guard passes and we exercise
// the real routing (not a format rejection).
const AK = "sk-ant-" + "a".repeat(48);
const GK = "gsk_" + "b".repeat(40);

afterEach(() => vi.unstubAllGlobals());

/** Route fetch by hostname → a canned Response, so we can force one provider to
 *  429 and let the fallback succeed without real network. */
function stubHosts(handlers: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const host = new URL(input.toString()).hostname;
      const h = handlers[host];
      if (!h) throw new Error("unexpected host " + host);
      return h();
    }),
  );
}

/** Minimal OpenAI-compatible final-answer body (no tool calls → answer). */
const oaiFinal = (text: string) =>
  new Response(
    JSON.stringify({
      choices: [{ message: { content: text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 5, completion_tokens: 3 },
    }),
    { status: 200 },
  );

describe("isRateLimitError", () => {
  it("flags 429 / rate-limit / overloaded / quota / too-many-requests", () => {
    expect(isRateLimitError(new Error("Anthropic API 429: rate_limit_error"))).toBe(true);
    expect(isRateLimitError(new Error("Anthropic stream error (overloaded_error): busy"))).toBe(true);
    expect(isRateLimitError(new Error("RESOURCE_EXHAUSTED: quota exceeded"))).toBe(true);
    expect(isRateLimitError(new Error("429 Too Many Requests"))).toBe(true);
  });
  it("does NOT flag auth / format / network errors (those'd fail the same way)", () => {
    expect(isRateLimitError(new Error("Anthropic API 401: invalid x-api-key"))).toBe(false);
    expect(isRateLimitError(new Error("Anthropic API 400: bad request"))).toBe(false);
    expect(isRateLimitError(new Error("network down"))).toBe(false);
  });
});

describe("chatTurn auto-fallback", () => {
  const base = {
    apiKey: AK,
    model: "claude-sonnet-5",
    history: [] as ChatMessage[],
    userMessage: "hi",
    toolHandler: () => ({}),
  };

  it("retries on the fallback provider when the primary is rate-limited", async () => {
    stubHosts({
      "api.anthropic.com": () => new Response("rate limit", { status: 429 }),
      "api.groq.com": () => oaiFinal("answer from fallback"),
    });
    let firedFrom: string | null = null;
    let firedTo: string | null = null;
    const reply = await chatTurn({
      ...base,
      providerId: "anthropic",
      fallback: { providerId: "groq", apiKey: GK, model: "llama-3.3-70b-versatile" },
      onFallback: (f, t) => {
        firedFrom = f;
        firedTo = t;
      },
    });
    expect(reply.content).toContain("answer from fallback");
    expect(reply.usage?.provider).toBe("groq");
    expect(firedFrom).toBe("anthropic");
    expect(firedTo).toBe("groq");
  });

  it("does NOT fall back on a non-rate-limit error (rethrows, fallback untouched)", async () => {
    stubHosts({
      "api.anthropic.com": () => new Response("bad key", { status: 401 }),
      "api.groq.com": () => oaiFinal("should never be reached"),
    });
    let fired = false;
    await expect(
      chatTurn({
        ...base,
        providerId: "anthropic",
        fallback: { providerId: "groq", apiKey: GK, model: "llama-3.3-70b-versatile" },
        onFallback: () => {
          fired = true;
        },
      }),
    ).rejects.toThrow(/401/);
    expect(fired).toBe(false);
  });

  it("with no fallback configured, a rate-limit error propagates", async () => {
    stubHosts({
      "api.anthropic.com": () => new Response("rate limit", { status: 429 }),
    });
    await expect(
      chatTurn({ ...base, providerId: "anthropic" }),
    ).rejects.toThrow(/429/);
  });
});
