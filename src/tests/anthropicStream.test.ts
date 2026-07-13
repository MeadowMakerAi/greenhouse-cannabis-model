import { describe, it, expect } from "vitest";
import { readAnthropicStream } from "../services/providers/anthropic";

/** Build a streaming Response from raw SSE text, optionally split into chunks
 *  at given byte offsets to exercise the cross-read line buffer. */
function sseResponse(text: string, splitAt?: number[]): Response {
  const bytes = new TextEncoder().encode(text);
  const cuts = [0, ...(splitAt ?? []), bytes.length].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < cuts.length - 1; i++) {
        controller.enqueue(bytes.subarray(cuts[i], cuts[i + 1]));
      }
      controller.close();
    },
  });
  return new Response(stream);
}

const line = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

describe("readAnthropicStream", () => {
  it("assembles streamed text, emits deltas, and reads usage", async () => {
    const sse =
      line({ type: "message_start", message: { usage: { input_tokens: 50, output_tokens: 1 } } }) +
      line({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hello" } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: " world" } }) +
      line({ type: "content_block_stop", index: 0 }) +
      line({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 8 } }) +
      line({ type: "message_stop" });

    const deltas: string[] = [];
    const turn = await readAnthropicStream(sseResponse(sse), (d) => deltas.push(d));

    expect(deltas).toEqual(["Hello", " world"]);
    expect(turn.content).toEqual([{ type: "text", text: "Hello world" }]);
    expect(turn.stop_reason).toBe("end_turn");
    // input from message_start, output is the FINAL message_delta value (not summed).
    // Cache counts default to 0 when the stream reports no prompt-cache usage.
    expect(turn.usage).toEqual({
      input_tokens: 50,
      output_tokens: 8,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
  });

  it("drops empty text preamble block when model leads with a tool call (no text deltas)", async () => {
    // Anthropic sometimes emits a text block at index 0 then immediately pivots to
    // a tool_use block, leaving the text block with text:"". The stream parser must
    // discard these so the caller never pushes { type:"text", text:"" } into the
    // message history — Anthropic rejects that on the next roundtrip with 400
    // "text content blocks must be non-empty".
    const sse =
      line({ type: "message_start", message: { usage: { input_tokens: 30, output_tokens: 2 } } }) +
      line({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      line({ type: "content_block_stop", index: 0 }) +
      line({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "toolu_2", name: "set_scenario" } }) +
      line({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"patches":{"greenhouseLengthFt":120}}' } }) +
      line({ type: "content_block_stop", index: 1 }) +
      line({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 12 } }) +
      line({ type: "message_stop" });

    const turn = await readAnthropicStream(sseResponse(sse), () => {});

    expect(turn.stop_reason).toBe("tool_use");
    // Empty text block must not appear in content — it would cause a 400 on re-send.
    expect(turn.content.some((b) => b.type === "text" && (b.text ?? "").length === 0)).toBe(false);
    expect(turn.content).toEqual([
      { type: "tool_use", id: "toolu_2", name: "set_scenario", input: { patches: { greenhouseLengthFt: 120 } } },
    ]);
  });

  it("assembles a tool_use block from streamed partial_json", async () => {
    const sse =
      line({ type: "message_start", message: { usage: { input_tokens: 30, output_tokens: 2 } } }) +
      line({ type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "toolu_1", name: "set_scenario" } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"patches":' } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"co2SetpointPpm":1200}}' } }) +
      line({ type: "content_block_stop", index: 0 }) +
      line({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 15 } }) +
      line({ type: "message_stop" });

    const turn = await readAnthropicStream(sseResponse(sse), () => {});

    expect(turn.stop_reason).toBe("tool_use");
    expect(turn.content).toEqual([
      { type: "tool_use", id: "toolu_1", name: "set_scenario", input: { patches: { co2SetpointPpm: 1200 } } },
    ]);
    expect(turn.usage.input_tokens).toBe(30);
  });

  it("survives SSE payloads split across stream reads (buffering)", async () => {
    const sse =
      line({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } }) +
      line({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "chunked" } }) +
      line({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 3 } }) +
      line({ type: "message_stop" });

    // Split at several odd offsets mid-line to force the buffer to stitch lines.
    const deltas: string[] = [];
    const turn = await readAnthropicStream(
      sseResponse(sse, [17, 40, 88, 120]),
      (d) => deltas.push(d),
    );

    expect(deltas.join("")).toBe("chunked");
    expect(turn.content).toEqual([{ type: "text", text: "chunked" }]);
    expect(turn.stop_reason).toBe("end_turn");
  });

  it("throws on a truncated stream (no message_stop) instead of returning a partial answer", async () => {
    const sse =
      line({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } }) +
      line({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "cut off mid-" } });
    // Stream ends here — no message_delta, no message_stop.

    await expect(readAnthropicStream(sseResponse(sse), () => {})).rejects.toThrow(
      /ended unexpectedly/,
    );
  });

  it("throws on a mid-stream error event instead of returning partial text as success", async () => {
    const sse =
      line({ type: "message_start", message: { usage: { input_tokens: 10, output_tokens: 1 } } }) +
      line({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } }) +
      line({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });

    await expect(readAnthropicStream(sseResponse(sse), () => {})).rejects.toThrow(
      /overloaded_error.*Overloaded/,
    );
  });

  it("processes a final line that arrives without a trailing newline", async () => {
    const full =
      line({ type: "message_start", message: { usage: { input_tokens: 5, output_tokens: 1 } } }) +
      line({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
      line({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "tail" } }) +
      line({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } }) +
      `data: ${JSON.stringify({ type: "message_stop" })}`; // no trailing \n

    const turn = await readAnthropicStream(sseResponse(full), () => {});
    expect(turn.content).toEqual([{ type: "text", text: "tail" }]);
    expect(turn.stop_reason).toBe("end_turn");
  });
});
