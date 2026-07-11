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

/**
 * Tool-use roundtrip ceiling per turn. Framing matters: an app that TRUNCATES a
 * task mid-actuation is the expensive failure — worse than the few cents of
 * extra API calls a deep task costs. So this is NOT a budget limiter (the live
 * cost meter + user abort do that) — it's a runaway BACKSTOP set far above any
 * real task, so it only ever fires on a genuine non-converging loop (e.g. the
 * model bouncing set_scenario ↔ assess forever), which the human-gated meter
 * can't catch automatically in the seconds before someone hits stop.
 *
 * It's a CEILING, not a floor: a simple turn finishes in 1-2 roundtrips, so a
 * high cap costs nothing on normal turns. The deepest LEGITIMATE task — a
 * multi-building proforma with several fixtures (orient → set → assess →
 * recommend → set-fixtures → compare → re-assess → adjust → answer) — lands
 * ~11, ~20 if the model re-checks. 25 clears that with margin. The old cap of 6
 * truncated a real ingest ("Huifa proforma burned all 6, user got nothing" —
 * anthropicToolBudget.test.ts); at the ceiling the forced-final still fires, so
 * even a task that hits 25 gets an answer, not an error.
 * ponytail: fixed high ceiling; add a same-tool-same-input loop detector only
 * if a runaway actually shows up in the meter.
 */
const DEFAULT_MAX_ROUNDTRIPS = 25;

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
  /** Streaming callback for live token rendering (Anthropic today; others no-op). */
  onDelta?: (delta: string) => void;
  /** Fired at each streamed roundtrip start — reset the live buffer (see types.ts). */
  onRoundtripStart?: () => void;
  /** Fired as each tool call executes — drive a live activity indicator. */
  onToolCall?: (name: string) => void;
  /**
   * Optional automatic fallback provider, tried ONCE if the primary fails with
   * a rate-limit / overloaded / quota error. Lets a big spec-sheet ingest that
   * trips Anthropic's 30k-tok/min limit transparently retry on Gemini (free,
   * 1M context) instead of dead-ending as "Sage failed to actuate".
   */
  fallback?: { providerId: ProviderId; apiKey: string; model: string; baseUrl?: string };
  /** Fired when the primary was rate-limited and the fallback takes over. */
  onFallback?: (from: ProviderId, to: ProviderId) => void;
}

/**
 * Rate-limit / overload errors are the ones worth retrying on another provider;
 * a bad key or malformed request is not (the fallback would fail the same way).
 * Providers surface these as thrown Errors with the HTTP status / API error type
 * in the message (e.g. "Anthropic API 429: …", "…(overloaded_error)…").
 */
export function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b429\b|rate[ _-]?limit|overloaded|quota|resource[_ ]exhausted|too many requests/i.test(
    msg,
  );
}

export async function chatTurn(args: ChatTurnInput): Promise<ChatMessage> {
  // Window history once so the primary and any fallback see the same messages.
  const history = windowHistory(args.history);

  const runProvider = async (
    providerId: ProviderId,
    apiKey: string,
    model: string,
    baseUrl: string | undefined,
  ): Promise<ChatMessage> => {
    const cfg = PROVIDER_CONFIGS[providerId];
    if (!cfg) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    if (cfg.requiresKey && !apiKey) {
      throw new Error(`Provider ${cfg.label} requires an API key.`);
    }
    if (cfg.requiresKey && !isProviderKeyValid(providerId, apiKey)) {
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
    const resolvedBaseUrl = baseUrl || cfg.defaultBaseUrl;
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

    const reply = await getProvider(providerId).chat({
      apiKey,
      baseUrl: resolvedBaseUrl,
      model,
      history,
      userMessage: args.userMessage,
      attachments: args.attachments,
      toolHandler: args.toolHandler,
      tools: CHATBOT_TOOLS,
      systemPrompt: CHATBOT_SYSTEM_PROMPT,
      // Centralize the ceiling so anthropic + gemini + openai-compat all get the
      // same budget (each provider's own default is only a direct-call fallback).
      maxRoundtrips: args.maxRoundtrips ?? DEFAULT_MAX_ROUNDTRIPS,
      signal: args.signal,
      onDelta: args.onDelta,
      onRoundtripStart: args.onRoundtripStart,
      onToolCall: args.onToolCall,
    });
    // The provider knows the token counts + model; only the dispatcher knows
    // which configured provider ran, so stamp it here for the cost meter.
    if (reply.usage) reply.usage.provider = providerId;
    return reply;
  };

  try {
    return await runProvider(args.providerId, args.apiKey, args.model, args.baseUrl);
  } catch (err) {
    // Rate-limited / overloaded on the primary? Retry ONCE on the configured
    // fallback (typically Gemini for a big spec sheet that trips Anthropic's
    // 30k-tok/min cap). A config/format error is NOT retried — it'd fail again.
    const { fallback } = args;
    if (
      fallback &&
      fallback.providerId !== args.providerId &&
      isRateLimitError(err)
    ) {
      args.onFallback?.(args.providerId, fallback.providerId);
      return await runProvider(
        fallback.providerId,
        fallback.apiKey,
        fallback.model,
        fallback.baseUrl,
      );
    }
    throw err;
  }
}
