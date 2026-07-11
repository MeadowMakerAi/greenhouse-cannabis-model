import type { ToolDefinition } from "../chatbotTools";
import { WRITE_TOOL_NAMES } from "../chatbotTools";
import type { ChatMessage, ChatProvider, ChatTurnArgs } from "./types";
import { DEFAULT_MAX_ROUNDTRIPS } from "./types";
import { timedSignal, describeAbort, CHAT_TIMEOUT_MS } from "../abortTimeout";
import { makeToolLoopGuard } from "./loopGuard";

/**
 * OpenAI-compatible Chat Completions provider. Works for:
 *   - OpenAI (https://api.openai.com/v1)
 *   - OpenRouter (https://openrouter.ai/api/v1) — includes free models
 *   - Groq (https://api.groq.com/openai/v1) — free tier, very fast
 *   - Local Ollama (http://localhost:11434/v1)
 *
 * Anthropic-style tool schemas (`input_schema`) are translated to OpenAI
 * function-calling format (`parameters`). Image attachments are passed as
 * `image_url` parts with data URLs. PDF attachments are not supported
 * natively by most OpenAI-compatible models — the user is warned and the
 * PDF is skipped.
 */

interface OAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface OAITextPart {
  type: "text";
  text: string;
}
interface OAIImagePart {
  type: "image_url";
  image_url: { url: string };
}
type OAIContentPart = OAITextPart | OAIImagePart;

interface OAIToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OAIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OAIContentPart[] | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
  name?: string;
}

interface OAIResponseChoice {
  index: number;
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: OAIToolCall[];
  };
  finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | string;
}

interface OAIResponse {
  id: string;
  model?: string;
  choices: OAIResponseChoice[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

function translateTools(tools: ToolDefinition[]): OAIToolDef[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

function buildUserAttachmentMessage(
  userText: string,
  attachments: { mediaType: string; base64: string; name: string }[],
): { message: OAIMessage; skippedPdfs: string[] } {
  const parts: OAIContentPart[] = [];
  const skippedPdfs: string[] = [];
  for (const a of attachments) {
    if (a.mediaType === "application/pdf") {
      skippedPdfs.push(a.name);
      continue;
    }
    parts.push({
      type: "image_url",
      image_url: { url: `data:${a.mediaType};base64,${a.base64}` },
    });
  }
  let prefixedText = userText;
  if (skippedPdfs.length > 0) {
    prefixedText =
      `[Note: ${skippedPdfs.length} PDF attachment(s) (${skippedPdfs.join(
        ", ",
      )}) were dropped because the selected provider does not support PDFs. ` +
      `Switch to Anthropic or Gemini to ingest PDFs, or paste the spec sheet text directly.]\n\n` +
      prefixedText;
  }
  parts.push({ type: "text", text: prefixedText });
  return {
    message: { role: "user", content: parts },
    skippedPdfs,
  };
}

export const openAICompatibleProvider: ChatProvider = {
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
    onToolCall,
  }: ChatTurnArgs): Promise<ChatMessage> {
    const oaiTools = translateTools(tools);

    const messages: OAIMessage[] = [
      { role: "system", content: systemPrompt },
      ...history.map<OAIMessage>((m) => ({
        role: m.role,
        content: m.content,
      })),
    ];

    if (attachments && attachments.length > 0) {
      const { message } = buildUserAttachmentMessage(userMessage, attachments);
      messages.push(message);
    } else {
      messages.push({ role: "user", content: userMessage });
    }

    const url = baseUrl.replace(/\/+$/, "") + "/chat/completions";

    // GPT-5.x / o-series on api.openai.com REJECT `max_tokens` (HTTP 400,
    // "Unsupported parameter … use max_completion_tokens instead") and require
    // `max_completion_tokens`. The other OpenAI-compatible hosts routed through
    // this client (OpenRouter, Groq, Ollama) still use classic
    // `max_tokens`. Pick the cap key by host. 4096 = headroom for a multi-tool
    // actuation turn without truncation.
    const tokenCap =
      new URL(url).hostname === "api.openai.com"
        ? { max_completion_tokens: 8192 }
        : { max_tokens: 8192 };

    const toolTrace: { name: string; input: unknown; output: unknown }[] = [];
    let finalText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    // One extra iteration beyond the tool budget with tool_choice:"none" to
    // force a final text answer instead of dead-ending (see anthropic.ts). The
    // loop guard forces that early if the model repeats an identical call.
    const loopGuard = makeToolLoopGuard();
    let loopBroken = false;
    for (let i = 0; i <= maxRoundtrips; i++) {
      const forceFinal = i === maxRoundtrips || loopBroken;
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      let json: OAIResponse;
      try {
        // Body parsing stays inside the abort guard — an abort can fire
        // mid-body too and must map to the same friendly message.
        const res = await fetch(url, {
          method: "POST",
          signal: timedSignal(CHAT_TIMEOUT_MS, signal),
          headers,
          body: JSON.stringify({
            model,
            messages,
            tools: oaiTools.length > 0 ? oaiTools : undefined,
            tool_choice:
              oaiTools.length > 0 ? (forceFinal ? "none" : "auto") : undefined,
            ...tokenCap,
          }),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(
            `${new URL(url).hostname} ${res.status}: ${txt.slice(0, 300)}`,
          );
        }
        json = (await res.json()) as OAIResponse;
      } catch (err) {
        const aborted = describeAbort(err, CHAT_TIMEOUT_MS);
        if (aborted) throw new Error(aborted);
        throw err;
      }
      if (json.usage) {
        inputTokens += json.usage.prompt_tokens ?? 0;
        outputTokens += json.usage.completion_tokens ?? 0;
      }
      const choice = json.choices?.[0];
      if (!choice) {
        throw new Error("Provider returned no choices.");
      }
      const msg = choice.message;

      const assistantMsg: OAIMessage = {
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: msg.tool_calls,
      };
      messages.push(assistantMsg);

      const hasToolCalls = !!msg.tool_calls && msg.tool_calls.length > 0;
      if (!hasToolCalls || forceFinal) {
        finalText = (msg.content ?? "").trim();
        break;
      }

      const roundtripCalls: { name: string; input: unknown }[] = [];
      for (const call of msg.tool_calls!) {
        const name = call.function.name;
        onToolCall?.(name);
        let input: Record<string, unknown> = {};
        try {
          input = call.function.arguments
            ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          input = { _raw: call.function.arguments };
        }
        roundtripCalls.push({ name, input });
        let output: unknown;
        try {
          output = await toolHandler(name, input);
        } catch (err) {
          output = { error: (err as Error).message };
        }
        toolTrace.push({ name, input, output });
        messages.push({
          role: "tool",
          tool_call_id: call.id,
          name,
          content: JSON.stringify(output),
        });
      }
      // Repeating the same WRITE? Force a final answer next pass. Reads are
      // excluded so a legit per-building assess {} loop doesn't false-positive.
      if (loopGuard.record(roundtripCalls.filter((c) => WRITE_TOOL_NAMES.has(c.name))))
        loopBroken = true;
    }

    return {
      role: "assistant",
      content: finalText || "(No final response after tool roundtrips.)",
      toolTrace: toolTrace.length ? toolTrace : undefined,
      usage: { inputTokens, outputTokens, model },
    };
  },
};
