import type { ChatMessage, ChatProvider, ChatTurnArgs } from "./types";

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
  usage?: { input_tokens: number; output_tokens: number };
}

export const ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1/messages";

export function isAnthropicKeyFormat(key: string): boolean {
  return /^sk-ant-[a-zA-Z0-9_-]{40,}$/.test(key.trim());
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
    maxRoundtrips = 6,
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

    for (let i = 0; i < maxRoundtrips; i++) {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          system: systemPrompt,
          tools,
          messages: apiHistory,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(`Anthropic API ${res.status}: ${txt.slice(0, 200)}`);
      }
      const json: APIResponse = await res.json();

      apiHistory.push({ role: "assistant", content: json.content });

      if (json.stop_reason !== "tool_use") {
        finalText = json.content
          .filter((b) => b.type === "text")
          .map((b) => b.text || "")
          .join("\n")
          .trim();
        break;
      }

      const toolResultBlocks: APIContentBlock[] = [];
      for (const block of json.content) {
        if (block.type !== "tool_use") continue;
        const name = block.name!;
        const input = (block.input ?? {}) as Record<string, unknown>;
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
      apiHistory.push({ role: "user", content: toolResultBlocks });
    }

    return {
      role: "assistant",
      content: finalText || "(No final response after tool roundtrips.)",
      toolTrace: toolTrace.length ? toolTrace : undefined,
    };
  },
};
