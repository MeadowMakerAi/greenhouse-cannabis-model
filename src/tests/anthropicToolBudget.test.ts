import { afterEach, describe, expect, it, vi } from "vitest";
import { anthropicProvider } from "../services/providers/anthropic";
import type { ToolDefinition } from "../services/chatbotTools";

/**
 * Regression: a big spec ingest can spend every tool roundtrip on tool calls.
 * The provider must then make ONE extra request with tool_choice:"none" to
 * force a final text answer — never return the dead-end
 * "(No final response after tool roundtrips.)" fallback for a healthy turn.
 * (Found live: Huifa proforma ingest burned all 6 roundtrips, user got nothing.)
 */

const TOOLS: ToolDefinition[] = [
  {
    name: "noop",
    description: "test tool",
    input_schema: { type: "object", properties: {} },
  },
];

const enc = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

function sseBody(lines: string): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode(lines));
        c.close();
      },
    }),
    { status: 200 },
  );
}

const toolUseTurn = () =>
  enc({ type: "message_start", message: { usage: { input_tokens: 100 } } }) +
  enc({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "tu_1", name: "noop" } }) +
  enc({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } }) +
  enc({ type: "content_block_stop", index: 0 }) +
  enc({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 10 } }) +
  enc({ type: "message_stop" });

const finalTurn = (text: string) =>
  enc({ type: "message_start", message: { usage: { input_tokens: 200 } } }) +
  enc({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
  enc({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } }) +
  enc({ type: "content_block_stop", index: 0 }) +
  enc({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 20 } }) +
  enc({ type: "message_stop" });

afterEach(() => vi.unstubAllGlobals());

describe("anthropic tool-budget exhaustion", () => {
  it("forces a final text answer via tool_choice none after maxRoundtrips", async () => {
    const requestBodies: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: RequestInit) => {
        const body = JSON.parse(opts.body as string) as Record<string, unknown>;
        requestBodies.push(body);
        // Model keeps calling tools until forbidden — worst case.
        if (body.tool_choice && (body.tool_choice as { type: string }).type === "none") {
          return sseBody(finalTurn("Summary of what I did."));
        }
        return sseBody(toolUseTurn());
      }),
    );

    const reply = await anthropicProvider.chat({
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com/v1/messages",
      model: "claude-sonnet-5",
      history: [],
      userMessage: "ingest this giant spec",
      toolHandler: async () => ({ ok: true }),
      tools: TOOLS,
      systemPrompt: "test",
      maxRoundtrips: 3,
      onDelta: () => {},
    });

    // 3 tool roundtrips + 1 forced-final = 4 requests; only the last forbids tools.
    expect(requestBodies).toHaveLength(4);
    expect(requestBodies.slice(0, 3).every((b) => b.tool_choice === undefined)).toBe(true);
    expect(requestBodies[3].tool_choice).toEqual({ type: "none" });
    expect(reply.content).toBe("Summary of what I did.");
    expect(reply.toolTrace).toHaveLength(3);
    // Usage accumulated across ALL 4 billed calls.
    expect(reply.usage).toMatchObject({ inputTokens: 500, outputTokens: 50 });
  });

  it("still returns early when the model finishes within budget", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        return sseBody(calls === 1 ? toolUseTurn() : finalTurn("Done."));
      }),
    );

    const reply = await anthropicProvider.chat({
      apiKey: "sk-ant-test",
      baseUrl: "https://api.anthropic.com/v1/messages",
      model: "claude-sonnet-5",
      history: [],
      userMessage: "small ask",
      toolHandler: async () => ({ ok: true }),
      tools: TOOLS,
      systemPrompt: "test",
      maxRoundtrips: 6,
      onDelta: () => {},
    });

    expect(calls).toBe(2);
    expect(reply.content).toBe("Done.");
  });
});
