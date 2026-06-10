/**
 * Network-fetch abort + timeout helpers, shared by every client so a stalled
 * host can't hang a request — and the UI awaiting it — forever.
 *
 * The failure mode this prevents: a half-open socket or a black-holed endpoint
 * leaves `fetch` pending indefinitely. Any `await fetch(...)` with no signal
 * never settles, so a chat spinner (or a `Promise.all` of audit passes) spins
 * with no error and no way out. `AbortSignal.timeout` guarantees the request
 * rejects after a bound; `AbortSignal.any` also honors a caller's cancel.
 */

/** Per-request hard caps (ms). Soil/weather are quick; LLM turns run longer. */
export const SOIL_TIMEOUT_MS = 15_000;
export const CHAT_TIMEOUT_MS = 60_000;

/**
 * Combine a caller's AbortSignal (user cancel) with a hard timeout so the
 * resulting signal always fires — whichever comes first. Pass the result as
 * `fetch(..., { signal })`.
 */
export function timedSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

/**
 * Map an abort/timeout rejection to a clear, user-facing message. `fetch`
 * rejects with the signal's reason: a `TimeoutError` DOMException when the
 * timeout wins, an `AbortError` when the caller cancels. Returns null for any
 * other error so the caller can keep its own message.
 */
export function describeAbort(err: unknown, timeoutMs: number): string | null {
  if (err instanceof DOMException) {
    if (err.name === "TimeoutError") {
      return `Request timed out after ${Math.round(
        timeoutMs / 1000,
      )}s — the model didn't respond. Check your connection or API key and try again.`;
    }
    if (err.name === "AbortError") {
      return "Request stopped.";
    }
  }
  return null;
}
