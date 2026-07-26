import type { ChatMessage } from "./providers/types";

/**
 * Chat-thread persistence. Extracted from Chatbot.tsx so the load/restore
 * normalization is unit-testable (and off a 1900-line component). The thread
 * is persisted so a reload doesn't wipe the conversation; the "Forget
 * everything" control clears it via HISTORY_KEY.
 */

export const HISTORY_KEY = "greenhouse-model:chatHistory";

// Bounded to the most recent turns so a long audit-heavy session can't blow
// the localStorage quota.
export const HISTORY_PERSIST_MAX = 40;

/** Filter restored data to well-formed messages, then drop any trailing user
 *  turn whose assistant reply never arrived (reload mid-send) — otherwise the
 *  next send appends a second user message and corrupts the API's
 *  user/assistant alternation. Pure; exported for tests. (Codex challenge P2.) */
export function normalizeRestoredHistory(parsed: unknown): ChatMessage[] {
  if (!Array.isArray(parsed)) return [];
  const clean = parsed.filter(
    (m): m is ChatMessage =>
      m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  );
  while (clean.length && clean[clean.length - 1].role === "user") clean.pop();
  return clean;
}

export function loadHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return normalizeRestoredHistory(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function persistHistory(history: ChatMessage[]) {
  try {
    if (history.length === 0) {
      localStorage.removeItem(HISTORY_KEY);
      return;
    }
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_PERSIST_MAX)));
  } catch {
    /* quota / blocked storage — a non-persisted session still works */
  }
}
