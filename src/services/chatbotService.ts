import { CHATBOT_TOOLS, CHATBOT_SYSTEM_PROMPT } from "./chatbotTools";
import {
  PROVIDER_CONFIGS,
  getProvider,
  isProviderKeyValid,
  isAnthropicKeyFormat,
} from "./providers";
import type { ProviderId } from "./providers";
import type {
  ChatMessage,
  ChatRole,
  FileAttachment,
  ToolHandler,
} from "./providers/types";

export type { ChatMessage, ChatRole, FileAttachment, ToolHandler, ProviderId };
export { PROVIDER_CONFIGS, isProviderKeyValid, isAnthropicKeyFormat };

/**
 * Cap how much prior conversation is re-sent each turn. The transcript grows by
 * a user + assistant message every turn and is re-encoded on every tool-use
 * roundtrip, so an unbounded history is a top latency driver on long chats.
 * Keep the last N messages.
 * ponytail: plain tail slice, not summarization — add a summarizer in Stage B
 * only if long-conversation drift actually shows up.
 */
const MAX_HISTORY_MESSAGES = 24; // ~12 turns

function windowHistory(history: ChatMessage[]): ChatMessage[] {
  if (history.length <= MAX_HISTORY_MESSAGES) return history;
  let windowed = history.slice(-MAX_HISTORY_MESSAGES);
  // Anthropic requires the first message to be role "user"; a mid-conversation
  // tail slice could land on an assistant turn, so drop a leading assistant.
  if (windowed[0]?.role === "assistant") windowed = windowed.slice(1);
  return windowed;
}

export interface ChatTurnInput {
  /** Which provider to route this turn through. */
  providerId: ProviderId;
  /** API key for the provider (empty allowed for local Ollama). */
  apiKey: string;
  /** Optional base-URL override (Ollama / self-hosted). Falls back to provider default. */
  baseUrl?: string;
  /** Model id for the provider. */
  model: string;
  history: ChatMessage[];
  userMessage: string;
  attachments?: FileAttachment[];
  toolHandler: ToolHandler;
  maxRoundtrips?: number;
  /** Caller cancel signal; combined with a per-request timeout in the provider. */
  signal?: AbortSignal;
}

export async function chatTurn(args: ChatTurnInput): Promise<ChatMessage> {
  const cfg = PROVIDER_CONFIGS[args.providerId];
  if (!cfg) {
    throw new Error(`Unknown provider: ${args.providerId}`);
  }
  if (cfg.requiresKey && !args.apiKey) {
    throw new Error(`Provider ${cfg.label} requires an API key.`);
  }
  if (cfg.requiresKey && !isProviderKeyValid(args.providerId, args.apiKey)) {
    throw new Error(
      `Key doesn't match the expected format for ${cfg.label}${
        cfg.keyHint ? ` (${cfg.keyHint})` : ""
      }.`,
    );
  }

  // Defense-in-depth: refuse to transmit the configured key to any host
  // outside the provider's allowlist. Catches paste-the-wrong-secret
  // mistakes (e.g., Anthropic key into the OpenAI provider would otherwise
  // be shipped to api.openai.com).
  const resolvedBaseUrl = args.baseUrl || cfg.defaultBaseUrl;
  if (cfg.allowedHosts) {
    let parsed: URL;
    try {
      parsed = new URL(resolvedBaseUrl);
    } catch {
      throw new Error(
        `Refused to call ${cfg.label}: malformed base URL "${resolvedBaseUrl}".`,
      );
    }
    if (!cfg.allowedHosts.includes(parsed.hostname)) {
      throw new Error(
        `Refused to send ${cfg.label} key to non-${cfg.label} host "${parsed.hostname}". ` +
          `Allowed: ${cfg.allowedHosts.join(", ")}.`,
      );
    }
    if (parsed.protocol !== "https:") {
      throw new Error(
        `Refused to send ${cfg.label} key over non-HTTPS (${parsed.protocol}).`,
      );
    }
  }

  const provider = getProvider(args.providerId);
  return provider.chat({
    apiKey: args.apiKey,
    baseUrl: resolvedBaseUrl,
    model: args.model,
    history: windowHistory(args.history),
    userMessage: args.userMessage,
    attachments: args.attachments,
    toolHandler: args.toolHandler,
    tools: CHATBOT_TOOLS,
    systemPrompt: CHATBOT_SYSTEM_PROMPT,
    maxRoundtrips: args.maxRoundtrips,
    signal: args.signal,
  });
}
