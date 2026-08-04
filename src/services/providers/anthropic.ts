import type { ChatMessage, ChatProvider, ChatTurnArgs } from "./types";
import { DEFAULT_MAX_ROUNDTRIPS } from "./types";
import { WRITE_TOOL_NAMES } from "../chatbotTools";
import { timedSignal, describeAbort, CHAT_TIMEOUT_MS } from "../abortTimeout";
import { makeToolLoopGuard } from "./loopGuard";

interface APIContentBlock {
  type: "text" | "tool_use" | "tool_result" | "image" | "document";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  source?: {
    type: "base64" | "url";
    media_type?: string;
    data?: string;
    url?: string;
  };
}

interface APIMessage {
  role: "user" | "assistant";
  content: string | APIContentBlock[];
}

interface APIResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: APIContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "tool_use" | "stop_sequence";
  usage?: {
    input_tokens: number;
    output_tokens: number;
    // Prompt-caching token accounting: writes bill ~1.25× input, reads ~0.10×.
    // `input_tokens` EXCLUDES cached tokens, so these are tracked separately.
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/messages";

export function isAnthropicKeyFormat(key: string): boolean {
  return /^sk-ant-[a-zA-Z0-9_-]{40,}$/.test(key.trim());
}

/**
 * Clone the tools array and tag the last tool with cache_control, so the whole
 * (static, ~few-k-token) tool block is cached and not reprocessed every
 * roundtrip. Non-array / empty tools pass through untouched. Below the model's
 * minimum cacheable length the marker is a silent no-op — never an error.
 */
function markLastToolCached(tools: unknown): unknown {
  if (!Array.isArray(tools) || tools.length === 0) return tools;
  const out = tools.slice();
  out[out.length - 1] = {
    ...(out[out.length - 1] as Record<string, unknown>),
    cache_control: { type: "ephemeral" },
  };
  return out;
}

interface AnthropicTurn {
  content: APIContentBlock[];
  stop_reason: APIResponse["stop_reason"];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
  };
}

interface AnthropicRequest {
  apiKey: string;
  baseUrl: string;
  model: string;
  systemPrompt: string;
  tools: unknown;
  messages: APIMessage[];
  /** `{type:"none"}` forbids tool use — used to force a final text answer. */
  toolChoice?: { type: "none" };
}

const ANTHROPIC_HEADERS = (apiKey: string): Record<string, string> => ({
  "Content-Type": "application/json",
  "x-api-key": apiKey,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
});

// 8192 = a generous safety ceiling, NOT a work limiter. A low cap truncated
// multi-tool actuation turns ("Sage failed to actuate"); runaway is already
// bounded by maxRoundtrips. Spend is controlled by the cost meter, not by
// starving the response.
const MAX_TOKENS = 8192;

/**
 * One request roundtrip. Streams (SSE) when `onDelta` is provided — the final
 * answer's text arrives live — otherwise does a plain buffered JSON request.
 * Either way it returns the same shape so the tool-use loop is identical.
 */
/**
 * Drop nulls and empty text blocks from an assistant turn's content. Anthropic
 * sometimes emits a text block at index 0 then pivots to a tool_use (leaving
 * text:""); echoing that back as an assistant message 400s with "text content
 * blocks must be non-empty". Applied once at the requestAnthropicTurn boundary
 * so BOTH the streaming and buffered paths return already-clean content — no
 * consumer has to re-filter, and there's a single predicate to keep correct.
 */
function stripEmptyTextBlocks(
  blocks: (APIContentBlock | null | undefined)[],
): APIContentBlock[] {
  return blocks.filter(
    (b): b is APIContentBlock =>
      b != null && !(b.type === "text" && (b.text ?? "").length === 0),
  );
}

async function requestAnthropicTurn(
  req: AnthropicRequest,
  signal: AbortSignal | undefined,
  onDelta?: (delta: string) => void,
): Promise<AnthropicTurn> {
  const streaming = typeof onDelta === "function";
  // Prompt caching: cache the static prefix (tool schemas + system prompt) that
  // is otherwise re-sent and reprocessed on every roundtrip. Mark BOTH the last
  // tool and the system block so the whole prefix caches regardless of
  // section-spanning behavior. Default 5-minute ephemeral TTL spans a turn's
  // roundtrips (seconds apart); cross-turn hits within 5 min are a bonus.
  const res = await fetch(req.baseUrl, {
    method: "POST",
    signal: timedSignal(CHAT_TIMEOUT_MS, signal),
    headers: ANTHROPIC_HEADERS(req.apiKey),
    body: JSON.stringify({
      model: req.model,
      max_tokens: MAX_TOKENS,
      system: [
        { type: "text", text: req.systemPrompt, cache_control: { type: "ephemeral" } },
      ],
      tools: markLastToolCached(req.tools),
      ...(req.toolChoice ? { tool_choice: req.toolChoice } : {}),
      messages: req.messages,
      ...(streaming ? { stream: true } : {}),
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Anthropic API ${res.status}: ${txt.slice(0, 200)}`);
  }
  if (streaming) {
    // We asked for SSE (stream:true); a missing body is a broken response, not
    // something to silently re-parse as JSON.
    if (!res.body) throw new Error("Anthropic streaming response had no body.");
    return readAnthropicStream(res, onDelta);
  }
  const json = (await res.json()) as APIResponse;
  return {
    content: stripEmptyTextBlocks(json.content),
    stop_reason: json.stop_reason,
    usage: {
      input_tokens: json.usage?.input_tokens ?? 0,
      output_tokens: json.usage?.output_tokens ?? 0,
      cache_creation_input_tokens: json.usage?.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: json.usage?.cache_read_input_tokens ?? 0,
    },
  };
}

/**
 * Parse Anthropic's SSE stream into the same shape as a buffered response.
 * Assembles text blocks (emitting each text delta via onDelta) and tool_use
 * blocks (accumulating streamed partial_json, parsed at content_block_stop).
 * Usage: input_tokens from message_start, final output_tokens from message_delta.
 */
export async function readAnthropicStream(
  res: Response,
  onDelta: (delta: string) => void,
): Promise<AnthropicTurn> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const blocks: (APIContentBlock | undefined)[] = [];
  const toolJson: Record<number, string> = {};
  let stopReason: APIResponse["stop_reason"] = "end_turn";
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheCreation = 0;
  let cacheRead = 0;
  let sawMessageStop = false;

  const processLine = (line: string): void => {
    if (!line.startsWith("data:")) return;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") return;
    let evt: Record<string, unknown>;
    try {
      evt = JSON.parse(payload);
    } catch {
      return;
    }
    switch (evt.type) {
      case "message_start": {
        const u = (evt.message as {
          usage?: {
            input_tokens?: number;
            cache_creation_input_tokens?: number;
            cache_read_input_tokens?: number;
          };
        })?.usage;
        inputTokens = u?.input_tokens ?? 0;
        cacheCreation = u?.cache_creation_input_tokens ?? 0;
        cacheRead = u?.cache_read_input_tokens ?? 0;
        break;
      }
      case "content_block_start": {
        const idx = evt.index as number;
        const cb = (evt.content_block ?? {}) as {
          type?: string;
          id?: string;
          name?: string;
        };
        if (cb.type === "tool_use") {
          blocks[idx] = { type: "tool_use", id: cb.id, name: cb.name, input: {} };
          toolJson[idx] = "";
        } else {
          blocks[idx] = { type: "text", text: "" };
        }
        break;
      }
      case "content_block_delta": {
        const idx = evt.index as number;
        const d = (evt.delta ?? {}) as {
          type?: string;
          text?: string;
          partial_json?: string;
        };
        if (d.type === "text_delta") {
          const b = blocks[idx];
          if (b) b.text = (b.text ?? "") + (d.text ?? "");
          if (d.text) onDelta(d.text);
        } else if (d.type === "input_json_delta") {
          toolJson[idx] = (toolJson[idx] ?? "") + (d.partial_json ?? "");
        }
        break;
      }
      case "content_block_stop": {
        const idx = evt.index as number;
        const b = blocks[idx];
        if (b?.type === "tool_use") {
          try {
            b.input = JSON.parse(toolJson[idx] || "{}") as Record<string, unknown>;
          } catch {
            b.input = {};
          }
        }
        break;
      }
      case "message_delta": {
        const delta = (evt.delta ?? {}) as { stop_reason?: APIResponse["stop_reason"] };
        if (delta.stop_reason) stopReason = delta.stop_reason;
        const u = (evt.usage as { output_tokens?: number }) ?? {};
        if (u.output_tokens != null) outputTokens = u.output_tokens;
        break;
      }
      case "message_stop": {
        sawMessageStop = true;
        break;
      }
      case "error": {
        // The API can push an error event mid-stream (e.g. overloaded_error).
        // Surface it as a failure — never return the partial text as success.
        const e = (evt.error ?? {}) as { type?: string; message?: string };
        throw new Error(
          `Anthropic stream error${e.type ? ` (${e.type})` : ""}: ${e.message ?? "unknown"}`,
        );
      }
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      processLine(line);
    }
  }
  // Flush the decoder and any final line that arrived without a trailing \n.
  buffer += decoder.decode();
  for (const rest of buffer.split("\n")) processLine(rest.trim());

  // A stream that ends without message_stop was cut off (network drop, proxy
  // buffering, server hiccup) — treat as an error, not a shorter answer.
  if (!sawMessageStop) {
    throw new Error(
      "Anthropic stream ended unexpectedly — the response may be incomplete. Try again.",
    );
  }

  return {
    content: stripEmptyTextBlocks(blocks),
    stop_reason: stopReason,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cache_creation_input_tokens: cacheCreation,
      cache_read_input_tokens: cacheRead,
    },
  };
}

export const anthropicProvider: ChatProvider = {
  async chat({
    apiKey,
    baseUrl,
    model,
    history,
    userMessage,
    attachments,
    toolHandler,
    tools,
    systemPrompt,
    maxRoundtrips = DEFAULT_MAX_ROUNDTRIPS,
    signal,
    onDelta,
    onRoundtripStart,
    onToolCall,
  }: ChatTurnArgs): Promise<ChatMessage> {
    // Key format + host allowlist + HTTPS enforcement are validated by
    // the dispatcher in chatbotService.chatTurn before this is reached.
    const apiHistory: APIMessage[] = history.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (attachments && attachments.length > 0) {
      const blocks: APIContentBlock[] = [];
      for (const a of attachments) {
        const isPdf = a.mediaType === "application/pdf";
        blocks.push({
          type: isPdf ? "document" : "image",
          source: {
            type: "base64",
            media_type: a.mediaType,
            data: a.base64,
          },
        });
      }
      blocks.push({ type: "text", text: userMessage });
      apiHistory.push({ role: "user", content: blocks });
    } else {
      apiHistory.push({ role: "user", content: userMessage });
    }

    const toolTrace: { name: string; input: unknown; output: unknown }[] = [];
    let finalText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let cacheCreationTokens = 0;
    let cacheReadTokens = 0;

    // One extra iteration beyond the tool budget: if the model is still
    // mid-tool-flow when the budget runs out, that last pass sends
    // tool_choice:"none" to FORCE a final text answer — a big spec ingest
    // (apply → assess → recommend → derive) can legitimately spend every
    // roundtrip on tools, and dead-ending there wastes the whole turn.
    // The loop guard forces that same final answer early if the model starts
    // repeating an identical call (a non-converging loop), so the high ceiling
    // is safe.
    const loopGuard = makeToolLoopGuard();
    let loopBroken = false;
    for (let i = 0; i <= maxRoundtrips; i++) {
      const forceFinal = i === maxRoundtrips || loopBroken;
      // New roundtrip: let the UI clear its live buffer so a tool-use turn's
      // preamble doesn't accumulate ahead of the final answer.
      if (onDelta) onRoundtripStart?.();
      let turn: AnthropicTurn;
      try {
        // Streams when onDelta is set (final answer arrives live); otherwise a
        // plain buffered request. Each roundtrip gets its own timeout+cancel
        // signal so a stalled call rejects instead of hanging forever.
        turn = await requestAnthropicTurn(
          {
            apiKey,
            baseUrl,
            model,
            systemPrompt,
            tools,
            messages: apiHistory,
            ...(forceFinal ? { toolChoice: { type: "none" as const } } : {}),
          },
          signal,
          onDelta,
        );
      } catch (err) {
        const aborted = describeAbort(err, CHAT_TIMEOUT_MS);
        if (aborted) throw new Error(aborted);
        throw err;
      }

      inputTokens += turn.usage.input_tokens;
      outputTokens += turn.usage.output_tokens;
      cacheCreationTokens += turn.usage.cache_creation_input_tokens;
      cacheReadTokens += turn.usage.cache_read_input_tokens;

      // turn.content is already stripped of empty text blocks at the
      // requestAnthropicTurn boundary (stripEmptyTextBlocks), so it's safe to
      // echo straight back without a 400 "text content blocks must be non-empty".
      apiHistory.push({ role: "assistant", content: turn.content });

      if (turn.stop_reason !== "tool_use") {
        finalText = turn.content
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("\n")
          .trim();
        break;
      }

      const toolResultBlocks: APIContentBlock[] = [];
      const roundtripCalls: { name: string; input: unknown }[] = [];
      for (const block of turn.content) {
        if (block.type !== "tool_use") continue;
        const name = block.name!;
        onToolCall?.(name);
        const input = (block.input ?? {}) as Record<string, unknown>;
        roundtripCalls.push({ name, input });
        let output: unknown;
        try {
          output = await toolHandler(name, input);
        } catch (err) {
          output = { error: (err as Error).message };
        }
        toolTrace.push({ name, input, output });
        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: block.id!,
          content: JSON.stringify(output),
        });
      }
      // Repeating the same WRITE? Force a final answer next pass. Reads are
      // excluded — a legit flow re-issues identical reads (assess {}) per
      // building; only a stuck mutation loop is a real runaway.
      if (loopGuard.record(roundtripCalls.filter((c) => WRITE_TOOL_NAMES.has(c.name))))
        loopBroken = true;
      apiHistory.push({ role: "user", content: toolResultBlocks });
    }

    return {
      role: "assistant",
      content: finalText || "(No final response after tool roundtrips.)",
      toolTrace: toolTrace.length ? toolTrace : undefined,
      usage: { inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, model },
    };
  },
};
