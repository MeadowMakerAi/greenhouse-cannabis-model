import { describe, it, expect, vi, afterEach } from "vitest";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { openAICompatibleProvider } from "./openai";
import type { ChatProvider, ChatTurnArgs } from "./types";

/**
 * The freeze fix, verified end-to-end at the provider layer: a stalled call
 * must NOT hang — it must reject, and an abort/timeout must surface as a clear
 * message (not a raw DOMException). We don't wait the real 60s; we mock `fetch`
 * to reject the way a fired AbortSignal does, and assert the provider both
 * (a) passed a real AbortSignal to fetch and (b) translated the error.
 * (abortTimeout.test.ts separately proves the signal actually fires on time.)
 */

const baseArgs = (over: Partial<ChatTurnArgs> = {}): ChatTurnArgs => ({
  apiKey: "sk-test-key",
  baseUrl: "https://api.anthropic.com/v1/messages",
  model: "test-model",
  history: [],
  userMessage: "hi",
  toolHandler: async () => "",
  tools: [],
  systemPrompt: "system",
  ...over,
});

const PROVIDERS: { name: string; provider: ChatProvider; baseUrl: string }[] = [
  {
    name: "anthropic",
    provider: anthropicProvider,
    baseUrl: "https://api.anthropic.com/v1/messages",
  },
  {
    name: "gemini",
    provider: geminiProvider,
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
  },
  {
    name: "openai-compatible",
    provider: openAICompatibleProvider,
    baseUrl: "https://api.openai.com/v1/chat/completions",
  },
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe.each(PROVIDERS)("$name provider freeze-guard", ({ provider, baseUrl }) => {
  it("passes an AbortSignal to fetch", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      // Reject like a fired timeout so the call resolves (doesn't hang).
      throw new DOMException("timed out", "TimeoutError");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(provider.chat(baseArgs({ baseUrl }))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("translates a timeout into a friendly message", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    await expect(provider.chat(baseArgs({ baseUrl }))).rejects.toThrow(
      /timed out after \d+s/,
    );
  });

  it("translates a caller cancel into 'stopped'", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new DOMException("aborted", "AbortError");
    });
    const ctrl = new AbortController();
    await expect(
      provider.chat(baseArgs({ baseUrl, signal: ctrl.signal })),
    ).rejects.toThrow(/stopped/i);
  });
});
