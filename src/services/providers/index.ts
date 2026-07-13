import type { ChatProvider, ProviderConfig, ProviderId } from "./types";
import { anthropicProvider, ANTHROPIC_BASE_URL, isAnthropicKeyFormat } from "./anthropic";
import { openAICompatibleProvider } from "./openai";
import { geminiProvider } from "./gemini";

export { isAnthropicKeyFormat };
export type { ChatProvider, ProviderConfig, ProviderId };

export const PROVIDER_CONFIGS: Record<ProviderId, ProviderConfig> = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic (Claude)",
    defaultBaseUrl: ANTHROPIC_BASE_URL,
    allowedHosts: ["api.anthropic.com"],
    requiresKey: true,
    allowCustomBaseUrl: false,
    keyHint: "sk-ant-...",
    keyFormat: /^sk-ant-[a-zA-Z0-9_-]{40,}$/,
    keyUrl: "https://console.anthropic.com/settings/keys",
    defaultModel: "claude-sonnet-5",
    models: [
      { value: "claude-sonnet-5", label: "Sonnet 5 (default — fast, agentic tool-use)" },
      { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (cheapest — simple turns)" },
      { value: "claude-opus-4-8", label: "Opus 4.8 (deep reasoning)" },
      { value: "claude-fable-5", label: "Fable 5 (max capability — slower, pricier)" },
      { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (legacy balanced)" },
    ],
    supportsImages: true,
    supportsPdf: true,
    note: "Best tool-use + native PDF. Sonnet 5 is the default — near-Opus agentic quality at low latency, the right call for capability-bound spec ingestion. Big spec sheets that trip the 30k-tok/min limit auto-retry on Gemini; drop to Haiku 4.5 for cheap simple turns.",
  },
  gemini: {
    id: "gemini",
    label: "Google Gemini (free tier)",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    allowedHosts: ["generativelanguage.googleapis.com"],
    requiresKey: true,
    allowCustomBaseUrl: false,
    keyHint: "AIza...",
    keyFormat: /^AIza[0-9A-Za-z_-]{30,}$/,
    keyUrl: "https://aistudio.google.com/app/apikey",
    // Verified live against the v1beta models endpoint 2026-07-12. gemini-1.5-*
    // is retired (no longer served) and was removed. gemini-3.x is the current
    // generation; 2.x remains for cheap/free-tier PDF ingest.
    defaultModel: "gemini-2.5-flash",
    models: [
      { value: "gemini-3-flash-preview", label: "Gemini 3 Flash — newest, fast, 1M ctx, PDFs" },
      { value: "gemini-3-pro-preview", label: "Gemini 3 Pro — deepest reasoning, 1M ctx" },
      { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash — free, balanced, PDFs" },
      { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro — free tier limited, strong reasoning" },
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash — free, 1M ctx, PDFs" },
    ],
    supportsImages: true,
    supportsPdf: true,
    note: "Free tier with 1M-token context and native PDF support. Best for ingesting full greenhouse spec sheets without hitting Anthropic's rate limits.",
  },
  openai: {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    defaultBaseUrl: "https://api.openai.com/v1",
    allowedHosts: ["api.openai.com"],
    requiresKey: true,
    allowCustomBaseUrl: false,
    keyHint: "sk-... or sk-proj-...",
    // Exclude `sk-ant-` (Anthropic) and `sk-or-` (OpenRouter) so a
    // paste-the-wrong-secret mistake doesn't ship a different vendor's
    // key to api.openai.com.
    keyFormat: /^sk-(?!ant-)(?!or-)[A-Za-z0-9_-]{20,}$/,
    keyUrl: "https://platform.openai.com/api-keys",
    defaultModel: "gpt-5.6-terra",
    models: [
      { value: "gpt-5.6-sol", label: "GPT-5.6 Sol (flagship reasoning)" },
      { value: "gpt-5.6-terra", label: "GPT-5.6 Terra (balanced — recommended)" },
      { value: "gpt-5.6-luna", label: "GPT-5.6 Luna (fast, cheap)" },
      // GPT-5.6 access is gated by OpenAI org verification/tier — keys without
      // it 404 with model_not_found. Keep the prior generation available.
      { value: "gpt-5", label: "GPT-5 (if 5.6 unavailable on your key)" },
      { value: "gpt-5-mini", label: "GPT-5 mini (cheap)" },
      { value: "gpt-4o-mini", label: "GPT-4o mini (legacy, cheap)" },
      { value: "gpt-4o", label: "GPT-4o (legacy)" },
      { value: "o4-mini", label: "o4-mini (reasoning)" },
    ],
    supportsImages: true,
    supportsPdf: false,
    note: "PDFs are not supported here — convert spec sheets to images or use Gemini/Anthropic for PDF ingest.",
  },
  xai: {
    id: "xai",
    label: "xAI (Grok)",
    // OpenAI-compatible surface at api.x.ai/v1 (docs.x.ai — uses the OpenAI SDK
    // pointed at this base URL), so it routes through the openAICompatibleProvider.
    defaultBaseUrl: "https://api.x.ai/v1",
    allowedHosts: ["api.x.ai"],
    requiresKey: true,
    allowCustomBaseUrl: false,
    keyHint: "xai-...",
    keyFormat: /^xai-[A-Za-z0-9_-]{20,}$/,
    keyUrl: "https://console.x.ai",
    defaultModel: "grok-4.5",
    models: [
      { value: "grok-4.5", label: "Grok 4.5 (flagship — 500k ctx, fast agentic tool-use)" },
      { value: "grok-4.3", label: "Grok 4.3 (1M context)" },
    ],
    supportsImages: true,
    supportsPdf: false,
    note: "Grok 4.5 is xAI's flagship — 500k context, strong agentic tool-use, low latency. OpenAI-compatible API; key from console.x.ai. Not available in the EU. PDFs unsupported here — use Anthropic or Gemini to ingest spec sheets.",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter (mixed, free models)",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    allowedHosts: ["openrouter.ai"],
    requiresKey: true,
    allowCustomBaseUrl: false,
    keyHint: "sk-or-v1-...",
    keyFormat: /^sk-or-[A-Za-z0-9_-]{20,}$/,
    keyUrl: "https://openrouter.ai/keys",
    defaultModel: "deepseek/deepseek-chat-v3.1:free",
    models: [
      { value: "deepseek/deepseek-chat-v3.1:free", label: "DeepSeek V3.1 — free" },
      { value: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B — free" },
      { value: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash exp — free" },
      { value: "qwen/qwen-2.5-72b-instruct:free", label: "Qwen 2.5 72B — free" },
      { value: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (paid)" },
      { value: "openai/gpt-4o", label: "GPT-4o (paid)" },
    ],
    supportsImages: true,
    supportsPdf: false,
    note: "Free models exist but most are weak at tool-use. If tool calls fail, switch to a paid model or another provider.",
  },
  groq: {
    id: "groq",
    label: "Groq (free, very fast)",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    allowedHosts: ["api.groq.com"],
    requiresKey: true,
    allowCustomBaseUrl: false,
    keyHint: "gsk_...",
    keyFormat: /^gsk_[A-Za-z0-9_-]{20,}$/,
    keyUrl: "https://console.groq.com/keys",
    // Verified against console.groq.com/docs/models 2026-07-12: the two llama
    // models + gpt-oss are current production; qwen3-32b is preview (eval-only).
    defaultModel: "llama-3.3-70b-versatile",
    models: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B versatile — free, production" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B instant — free, fastest" },
      { value: "openai/gpt-oss-120b", label: "GPT-OSS 120B — free, production" },
      { value: "qwen/qwen3-32b", label: "Qwen3 32B — preview (eval only)" },
    ],
    supportsImages: false,
    supportsPdf: false,
    note: "Free + very fast. Text-only — attach images via Gemini/Anthropic.",
  },
  ollama: {
    id: "ollama",
    label: "Ollama (local, no key)",
    defaultBaseUrl: "http://localhost:11434/v1",
    // null = any host allowed, since users may point at a self-hosted
    // Ollama on a LAN address or an HTTPS reverse proxy.
    allowedHosts: null,
    requiresKey: false,
    allowCustomBaseUrl: true,
    defaultModel: "llama3.2",
    models: [
      { value: "llama3.2", label: "llama3.2" },
      { value: "qwen2.5", label: "qwen2.5" },
      { value: "deepseek-r1", label: "deepseek-r1" },
    ],
    supportsImages: false,
    supportsPdf: false,
    note: "Runs locally via Ollama. Free, private. CSP must permit http://localhost:11434 — local dev only.",
  },
};

export const PROVIDER_ORDER: ProviderId[] = [
  "anthropic",
  "gemini",
  "openai",
  "xai",
  "openrouter",
  "groq",
  "ollama",
];

export function getProvider(id: ProviderId): ChatProvider {
  switch (id) {
    case "anthropic":
      return anthropicProvider;
    case "gemini":
      return geminiProvider;
    case "openai":
    case "xai":
    case "openrouter":
    case "groq":
    case "ollama":
      return openAICompatibleProvider;
  }
}

/** Validate a key against the provider's surface-format regex. */
export function isProviderKeyValid(id: ProviderId, key: string): boolean {
  const cfg = PROVIDER_CONFIGS[id];
  if (!cfg.requiresKey) return true;
  if (!cfg.keyFormat) return key.trim().length > 0;
  return cfg.keyFormat.test(key.trim());
}
