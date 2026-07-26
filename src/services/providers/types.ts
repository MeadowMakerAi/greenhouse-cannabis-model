import type { ToolDefinition } from "../chatbotTools";

/**
 * Roundtrip ceiling for a single chat turn — a runaway backstop, not a budget.
 * The dispatcher passes this to every provider; a provider's own default is
 * only reached on a direct call (tests, agentSwarm), so all paths share one
 * source of truth instead of each provider re-declaring its own number.
 */
export const DEFAULT_MAX_ROUNDTRIPS = 25;

export type ChatRole = "user" | "assistant";

/**
 * Token usage for one chat turn, ACCUMULATED across every tool-use roundtrip
 * (each roundtrip is a separately-billed API call, so summing input across
 * roundtrips reflects real cost, not double-counting). `provider` is filled in
 * by the dispatcher; providers set the token counts + model.
 */
export interface ChatUsage {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic prompt-caching: tokens written to cache (bill ~1.25× input) and
   *  read from cache (~0.10× input). `inputTokens` excludes cached tokens, so
   *  the cost meter weights these separately. Absent for non-caching providers. */
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  model: string;
  provider?: ProviderId;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  toolTrace?: { name: string; input: unknown; output: unknown }[];
  usage?: ChatUsage;
  /** Structured audit findings rendered as cards instead of markdown text.
   *  Set by the audit swarm; absent on normal chat turns. Type-only import to
   *  avoid a runtime cycle (erased at compile). */
  findings?: import("../sageFindings").SageFinding[];
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
   * Optional streaming callback. When provided, a provider that supports
   * streaming emits the final answer's text deltas here as they arrive (the UI
   * renders them live). Providers that don't stream simply never call it — the
   * full text still arrives in the returned ChatMessage either way.
   */
  onDelta?: (delta: string) => void;
  /**
   * Fired at the start of each streamed roundtrip within a turn. A tool-use
   * turn can stream preamble text before its tool calls; the persisted message
   * keeps only the FINAL turn's text, so the UI should reset its live buffer
   * here — otherwise preamble accumulates and "snaps" away on completion.
   */
  onRoundtripStart?: () => void;
  /**
   * Fired when the provider is about to execute a tool call — lets the UI show
   * live activity ("running set_scenario…") during long multi-tool turns
   * instead of an opaque spinner.
   */
  onToolCall?: (name: string) => void;
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
