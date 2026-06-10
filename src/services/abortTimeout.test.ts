import { describe, it, expect, vi, afterEach } from "vitest";
import {
  timedSignal,
  describeAbort,
  CHAT_TIMEOUT_MS,
  SOIL_TIMEOUT_MS,
} from "./abortTimeout";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("timedSignal", () => {
  it("returns an unaborted AbortSignal when nothing has fired", () => {
    const s = timedSignal(CHAT_TIMEOUT_MS);
    expect(s).toBeInstanceOf(AbortSignal);
    expect(s.aborted).toBe(false);
  });

  it("is already aborted if the caller's signal is already aborted", () => {
    const s = timedSignal(CHAT_TIMEOUT_MS, AbortSignal.abort());
    expect(s.aborted).toBe(true);
  });

  it("fires when the timeout elapses", async () => {
    const s = timedSignal(10);
    await new Promise((r) => setTimeout(r, 30));
    expect(s.aborted).toBe(true);
    expect((s.reason as DOMException)?.name).toBe("TimeoutError");
  });

  it("fires when the caller cancels before the timeout", () => {
    const ctrl = new AbortController();
    const s = timedSignal(60_000, ctrl.signal);
    expect(s.aborted).toBe(false);
    ctrl.abort();
    expect(s.aborted).toBe(true);
  });

  it("exposes sane default caps", () => {
    expect(CHAT_TIMEOUT_MS).toBeGreaterThan(SOIL_TIMEOUT_MS);
  });
});

describe("timedSignal fallback (no AbortSignal.timeout/any)", () => {
  // Simulate a pre-Baseline-2024 engine by hiding the static helpers, so the
  // typeof checks in timedSignal route to the manual-controller fallback.
  const hideNativeHelpers = () => {
    Object.defineProperty(AbortSignal, "timeout", {
      value: undefined,
      configurable: true,
    });
    Object.defineProperty(AbortSignal, "any", {
      value: undefined,
      configurable: true,
    });
  };
  const restoreNativeHelpers = (orig: {
    timeout: unknown;
    any: unknown;
  }) => {
    Object.defineProperty(AbortSignal, "timeout", {
      value: orig.timeout,
      configurable: true,
    });
    Object.defineProperty(AbortSignal, "any", {
      value: orig.any,
      configurable: true,
    });
  };

  it("still times out with a TimeoutError reason", async () => {
    const orig = { timeout: AbortSignal.timeout, any: AbortSignal.any };
    hideNativeHelpers();
    try {
      const s = timedSignal(10);
      expect(s.aborted).toBe(false);
      await new Promise((r) => setTimeout(r, 30));
      expect(s.aborted).toBe(true);
      expect((s.reason as DOMException)?.name).toBe("TimeoutError");
    } finally {
      restoreNativeHelpers(orig);
    }
  });

  it("still honors the caller's cancel and clears the timer", async () => {
    const orig = { timeout: AbortSignal.timeout, any: AbortSignal.any };
    hideNativeHelpers();
    try {
      const ctrl = new AbortController();
      const s = timedSignal(60_000, ctrl.signal);
      expect(s.aborted).toBe(false);
      ctrl.abort();
      expect(s.aborted).toBe(true);
    } finally {
      restoreNativeHelpers(orig);
    }
  });

  it("is immediately aborted when the caller's signal already fired", () => {
    const orig = { timeout: AbortSignal.timeout, any: AbortSignal.any };
    hideNativeHelpers();
    try {
      const s = timedSignal(60_000, AbortSignal.abort());
      expect(s.aborted).toBe(true);
    } finally {
      restoreNativeHelpers(orig);
    }
  });
});

describe("describeAbort", () => {
  it("describes a timeout with the seconds", () => {
    const err = new DOMException("timed out", "TimeoutError");
    expect(describeAbort(err, 60_000)).toMatch(/timed out after 60s/);
  });

  it("describes a user cancel", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(describeAbort(err, 60_000)).toBe("Request stopped.");
  });

  it("returns null for unrelated errors so the caller keeps its message", () => {
    expect(describeAbort(new Error("Anthropic API 401"), 60_000)).toBeNull();
    expect(describeAbort("nope", 60_000)).toBeNull();
  });
});
