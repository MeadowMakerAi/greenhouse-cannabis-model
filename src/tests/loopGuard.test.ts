import { afterEach, describe, expect, it, vi } from "vitest";
import { makeToolLoopGuard } from "../services/providers/loopGuard";
import { anthropicProvider } from "../services/providers/anthropic";
import type { ToolDefinition } from "../services/chatbotTools";

describe("makeToolLoopGuard", () => {
  it("does not flag a normal sequence of distinct calls", () => {
    const g = makeToolLoopGuard();
    expect(g.record([{ name: "set_scenario", input: { greenhouseLengthFt: 120 } }])).toBe(false);
    expect(g.record([{ name: "assess_completeness", input: {} }])).toBe(false);
    expect(g.record([{ name: "recommend_lighting", input: { targetPPFD: 1000 } }])).toBe(false);
  });

  it("flags an identical call once it repeats to the limit (default 4)", () => {
    const g = makeToolLoopGuard();
    const call = [{ name: "assess_completeness", input: {} }];
    expect(g.record(call)).toBe(false); // 1
    expect(g.record(call)).toBe(false); // 2
    expect(g.record(call)).toBe(false); // 3
    expect(g.record(call)).toBe(true); // 4 → loop
  });

  it("accumulates identical calls across roundtrips with others mixed in", () => {
    const g = makeToolLoopGuard();
    const loop = { name: "set_scenario", input: { x: 1 } };
    expect(g.record([loop, { name: "get_scenario", input: {} }])).toBe(false);
    expect(g.record([loop])).toBe(false);
    expect(g.record([loop])).toBe(false);
    expect(g.record([loop])).toBe(true); // 4th identical set_scenario
  });

  it("treats different inputs to the same tool as distinct (no false positive)", () => {
    const g = makeToolLoopGuard();
    for (let i = 0; i < 6; i++) {
      expect(g.record([{ name: "set_scenario", input: { canopyAreaSqFt: i } }])).toBe(false);
    }
  });

  it("respects a custom limit", () => {
    const g = makeToolLoopGuard(2);
    const call = [{ name: "x", input: {} }];
    expect(g.record(call)).toBe(false);
    expect(g.record(call)).toBe(true);
  });
});

// ── End-to-end: a looping model is forced to a final answer, NOT run to the
//    full ceiling. Buffered (non-streaming) path; the mock returns the same
//    tool_use every time UNTIL tool_choice:"none" arrives, then a final answer.
afterEach(() => vi.unstubAllGlobals());

function jsonRes(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200 });
}

// A mock Anthropic endpoint that repeats `loopTool` forever until forced to a
// final answer via tool_choice:"none". Returns [reply, fetchCount()].
function stubLoopingModel(loopTool: string) {
  let fetchCount = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      fetchCount++;
      const body = JSON.parse(init.body as string) as { tool_choice?: { type: string } };
      if (body.tool_choice?.type === "none") {
        return jsonRes({
          id: "m", type: "message", role: "assistant",
          content: [{ type: "text", text: "done" }],
          model: "claude-sonnet-5", stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        });
      }
      return jsonRes({
        id: "m", type: "message", role: "assistant",
        content: [{ type: "tool_use", id: "tu", name: loopTool, input: {} }],
        model: "claude-sonnet-5", stop_reason: "tool_use",
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    }),
  );
  return () => fetchCount;
}

function runTurn(tools: ToolDefinition[], maxRoundtrips = 25) {
  return anthropicProvider.chat({
    apiKey: "sk-ant-" + "a".repeat(48),
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-5",
    history: [],
    userMessage: "loop please",
    toolHandler: () => ({}),
    tools,
    systemPrompt: "SYS",
    maxRoundtrips,
  });
}

describe("loop guard shortens a runaway turn", () => {
  it("forces a final answer when a WRITE tool repeats, not the full ceiling", async () => {
    const tools: ToolDefinition[] = [
      { name: "set_scenario", description: "", input_schema: { type: "object", properties: {} } },
    ];
    const fetchCount = stubLoopingModel("set_scenario");
    const reply = await runTurn(tools);
    expect(reply.content).toBe("done");
    // 4 identical set_scenario roundtrips trip the guard, the 5th is forced-final.
    expect(fetchCount()).toBe(5);
    expect(fetchCount()).toBeLessThan(25);
  });

  it("does NOT trip on a repeated READ — reads run to the ceiling but still answer", async () => {
    // A legit multi-building flow re-issues identical `assess_completeness {}`
    // after each building; that must not be mistaken for a runaway. Reads are
    // excluded from the guard, so this runs to the 25-roundtrip ceiling and the
    // ceiling's own forced-final still returns an answer (not an error).
    const tools: ToolDefinition[] = [
      { name: "assess_completeness", description: "", input_schema: { type: "object", properties: {} } },
    ];
    const fetchCount = stubLoopingModel("assess_completeness");
    const reply = await runTurn(tools);
    expect(reply.content).toBe("done");
    expect(fetchCount()).toBe(26); // 25 roundtrips + the forced-final pass
  });
});
