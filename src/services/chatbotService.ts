import { CHATBOT_TOOLS, CHATBOT_SYSTEM_PROMPT, type ToolDefinition } from "./chatbotTools";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  /** Plain text + optional tool-use traces */
  content: string;
  /** Tool calls executed for this assistant turn (for transparency) */
  toolTrace?: { name: string; input: unknown; output: unknown }[];
}

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

export interface FileAttachment {
  /** "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf" */
  mediaType: string;
  /** base64-encoded data without the data URL prefix */
  base64: string;
  /** Original filename for display */
  name: string;
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

export type ToolHandler = (
  name: string,
  input: Record<string, unknown>,
) => Promise<unknown> | unknown;

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

/**
 * Defense-in-depth: refuse to send the API key anywhere except the official
 * Anthropic endpoint. The CSP in index.html blocks this at the network
 * level, but this is a belt-and-suspenders runtime check so a future
 * refactor can't accidentally point the request at a different host.
 */
function assertAnthropicURL(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Refused to call malformed URL: ${url}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`Refused to send API key over non-HTTPS: ${parsed.protocol}`);
  }
  if (parsed.hostname !== "api.anthropic.com") {
    throw new Error(
      `Refused to send Anthropic API key to non-Anthropic host: ${parsed.hostname}`,
    );
  }
}

/**
 * Validates the surface format of an Anthropic API key before it's used.
 * Doesn't authenticate it (only the API can do that) — just catches obvious
 * paste-the-wrong-secret mistakes early so we don't transmit something else
 * (e.g., a GitHub PAT or Stripe key) to api.anthropic.com.
 */
export function isAnthropicKeyFormat(key: string): boolean {
  return /^sk-ant-[a-zA-Z0-9_-]{40,}$/.test(key.trim());
}

export async function chatTurn({
  apiKey,
  model,
  history,
  userMessage,
  attachments,
  toolHandler,
  maxRoundtrips = 6,
}: {
  apiKey: string;
  model: string;
  history: ChatMessage[];
  userMessage: string;
  attachments?: FileAttachment[];
  toolHandler: ToolHandler;
  maxRoundtrips?: number;
}): Promise<ChatMessage> {
  // Build API messages from internal history
  const apiHistory: APIMessage[] = history.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // If attachments exist, build a multi-part content block.
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

  // Surface-format check on the key so a paste-the-wrong-secret mistake
  // (a GitHub PAT, a Stripe key, etc.) is caught before transmission.
  if (!isAnthropicKeyFormat(apiKey)) {
    throw new Error(
      "Key doesn't match the Anthropic format (sk-ant-...). Check it in the chatbot settings.",
    );
  }
  // Belt-and-suspenders runtime guard against the URL getting clobbered.
  assertAnthropicURL(ANTHROPIC_API_URL);

  for (let i = 0; i < maxRoundtrips; i++) {
    const res = await fetch(ANTHROPIC_API_URL, {
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
        system: CHATBOT_SYSTEM_PROMPT,
        tools: CHATBOT_TOOLS as unknown as ToolDefinition[],
        messages: apiHistory,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Anthropic API ${res.status}: ${txt.slice(0, 200)}`);
    }
    const json: APIResponse = await res.json();

    // Append assistant content to history
    apiHistory.push({ role: "assistant", content: json.content });

    if (json.stop_reason !== "tool_use") {
      finalText = json.content
        .filter((b) => b.type === "text")
        .map((b) => b.text || "")
        .join("\n")
        .trim();
      break;
    }

    // Execute all tool_use blocks, append tool_result message
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
}
