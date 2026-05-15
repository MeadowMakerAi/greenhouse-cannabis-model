import type { ToolDefinition } from "../chatbotTools";
import type { ChatMessage, ChatProvider, ChatTurnArgs } from "./types";

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
    maxRoundtrips = 6,
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

    const toolTrace: { name: string; input: unknown; output: unknown }[] = [];
    let finalText = "";

    for (let i = 0; i < maxRoundtrips; i++) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages,
          tools: oaiTools.length > 0 ? oaiTools : undefined,
          tool_choice: oaiTools.length > 0 ? "auto" : undefined,
          max_tokens: 1500,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(
          `${new URL(url).hostname} ${res.status}: ${txt.slice(0, 300)}`,
        );
      }
      const json: OAIResponse = await res.json();
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
      if (!hasToolCalls) {
        finalText = (msg.content ?? "").trim();
        break;
      }

      for (const call of msg.tool_calls!) {
        const name = call.function.name;
        let input: Record<string, unknown> = {};
        try {
          input = call.function.arguments
            ? (JSON.parse(call.function.arguments) as Record<string, unknown>)
            : {};
        } catch {
          input = { _raw: call.function.arguments };
        }
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
    }

    return {
      role: "assistant",
      content: finalText || "(No final response after tool roundtrips.)",
      toolTrace: toolTrace.length ? toolTrace : undefined,
    };
  },
};
