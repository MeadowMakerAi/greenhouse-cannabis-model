import { describe, it, expect } from "vitest";
import {
  timedSignal,
  describeAbort,
  CHAT_TIMEOUT_MS,
  SOIL_TIMEOUT_MS,
} from "./abortTimeout";

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
