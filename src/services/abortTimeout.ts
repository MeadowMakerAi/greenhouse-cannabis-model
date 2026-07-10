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
// 90s (was 60s): a full 4096-token, non-streaming generation from a slower
// model (Fable 5 / Opus 4.8 / a slow free OpenRouter model) can legitimately
// exceed 60s, and would trip a spurious "timed out" before the answer lands.
// Stage B streaming would let partial output reset this; until then, give headroom.
export const CHAT_TIMEOUT_MS = 90_000;

/**
 * Combine a caller's AbortSignal (user cancel) with a hard timeout so the
 * resulting signal always fires — whichever comes first. Pass the result as
 * `fetch(..., { signal })`.
 *
 * `AbortSignal.timeout()` / `AbortSignal.any()` are Baseline-2024 — present in
 * all evergreen browsers, but feature-detected here so an older engine falls
 * back to a manual AbortController + setTimeout instead of throwing before the
 * request even starts. The fallback clears its timer if the caller cancels
 * first; an uncancelled timer firing after the request settled is a no-op
 * (aborting a settled fetch does nothing).
 */
export function timedSignal(
  timeoutMs: number,
  signal?: AbortSignal,
): AbortSignal {
  if (
    typeof AbortSignal.timeout === "function" &&
    typeof AbortSignal.any === "function"
  ) {
    const timeout = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, timeout]) : timeout;
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    // Match the native reason so describeAbort() maps it the same way.
    ctrl.abort(new DOMException("signal timed out", "TimeoutError"));
  }, timeoutMs);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(timer);
      ctrl.abort(signal.reason);
    } else {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          ctrl.abort(signal.reason);
        },
        { once: true },
      );
    }
  }
  return ctrl.signal;
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
