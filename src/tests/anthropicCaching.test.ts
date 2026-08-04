import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicProvider } from "../services/providers/anthropic";
import type { ToolDefinition } from "../services/chatbotTools";

afterEach(() => vi.unstubAllGlobals());

const TOOLS: ToolDefinition[] = [
  { name: "a", description: "first", input_schema: { type: "object", properties: {} } },
  { name: "b", description: "last", input_schema: { type: "object", properties: {} } },
];

/** Capture the request body, return a buffered turn whose usage carries cache
 *  tokens — mirrors what Anthropic reports once a prefix is cached. */
function stubCapture(): { body: () => Record<string, unknown> } {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      captured = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({
          id: "msg_1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "ok" }],
          model: "claude-sonnet-5",
          stop_reason: "end_turn",
          usage: {
            input_tokens: 12,
            output_tokens: 5,
            cache_creation_input_tokens: 300,
            cache_read_input_tokens: 2500,
          },
        }),
        { status: 200 },
      );
    }),
  );
  return { body: () => captured };
}

describe("anthropic prompt caching", () => {
  const call = () =>
    anthropicProvider.chat({
      apiKey: "sk-ant-" + "a".repeat(48),
      baseUrl: "https://api.anthropic.com/v1/messages",
      model: "claude-sonnet-5",
      history: [],
      userMessage: "hi",
      toolHandler: () => ({}),
      tools: TOOLS,
      systemPrompt: "SYS",
      maxRoundtrips: 6,
    });

  it("marks the system block and the LAST tool with cache_control", async () => {
    const cap = stubCapture();
    await call();
    const body = cap.body();
    const system = body.system as { text: string; cache_control?: unknown }[];
    expect(Array.isArray(system)).toBe(true);
    expect(system[0].text).toBe("SYS");
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    const tools = body.tools as { cache_control?: unknown }[];
    expect(tools[tools.length - 1].cache_control).toEqual({ type: "ephemeral" });
    // Earlier tools stay unmarked (one breakpoint caches the whole block).
    expect(tools[0].cache_control).toBeUndefined();
  });

  it("passes cache write/read token counts through to usage", async () => {
    stubCapture();
    const reply = await call();
    expect(reply.usage?.cacheCreationTokens).toBe(300);
    expect(reply.usage?.cacheReadTokens).toBe(2500);
  });

  it("does not mutate the caller's tools array", async () => {
    stubCapture();
    await call();
    expect(TOOLS[TOOLS.length - 1]).not.toHaveProperty("cache_control");
  });
});
