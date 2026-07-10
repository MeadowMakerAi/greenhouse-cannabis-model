import type { ToolDefinition } from "../chatbotTools";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolTrace?: { name: string; input: unknown; output: unknown }[];
}

export interface FileAttachment {
  /** "image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf" */
  mediaType: string;
  /** base64-encoded data without the data URL prefix */
  base64: string;
  /** Original filename for display */
  name: string;
}

export type ToolHandler = (
  name: string,
  input: Record<string, unknown>,
) => Promise<unknown> | unknown;

export type ProviderId = "anthropic" | "openai" | "xai" | "openrouter" | "groq" | "gemini" | "ollama";

export interface ProviderConfig {
  /** Stable provider identifier. */
  id: ProviderId;
  /** Display label. */
  label: string;
  /** Default endpoint base URL. May be overridden by user. */
  defaultBaseUrl: string;
  /**
   * Allowed hostnames for this provider. The dispatcher asserts the
   * resolved `baseUrl.hostname` is in this set before transmitting the
   * key — defense-in-depth against paste-the-wrong-key mistakes that
   * would otherwise ship one vendor's secret to another vendor's API.
   * `null` = any host accepted (Ollama / self-hosted).
   */
  allowedHosts: string[] | null;
  /** Whether this provider requires an API key. Ollama (local) does not. */
  requiresKey: boolean;
  /** Whether the user can override the base URL in the UI. */
  allowCustomBaseUrl: boolean;
  /** Hint shown next to the key field, e.g. "sk-or-v1-...". */
  keyHint?: string;
  /** Lightweight key format regex. Empty = accept anything. */
  keyFormat?: RegExp;
  /** Where to get a key. */
  keyUrl?: string;
  /** Default model id for this provider. */
  defaultModel: string;
  /** Model picker options. */
  models: { value: string; label: string }[];
  /** Whether this provider can accept image attachments. */
  supportsImages: boolean;
  /** Whether this provider can accept PDF attachments natively. */
  supportsPdf: boolean;
  /**
   * Friendly note about the provider — shown in the model picker / key
   * config block. Helpful for free-tier models, context window, etc.
   */
  note?: string;
}

export interface ChatTurnArgs {
  apiKey: string;
  baseUrl: string;
  model: string;
  history: ChatMessage[];
  userMessage: string;
  attachments?: FileAttachment[];
  toolHandler: ToolHandler;
  tools: ToolDefinition[];
  systemPrompt: string;
  maxRoundtrips?: number;
  /**
   * Optional caller cancel signal. Providers combine it with a hard per-request
   * timeout (see abortTimeout.timedSignal) so a stalled model call can't hang
   * the chat UI forever.
   */
  signal?: AbortSignal;
}

export interface ChatProvider {
  /** Run a multi-roundtrip chat turn with tool-use until a final text answer. */
  chat(args: ChatTurnArgs): Promise<ChatMessage>;
}
