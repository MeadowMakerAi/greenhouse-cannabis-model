import { describe, it, expect } from "vitest";
import { normalizeRestoredHistory } from "../services/chatHistory";
import type { ChatMessage } from "../services/providers/types";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });

describe("normalizeRestoredHistory", () => {
  it("drops a trailing user turn whose assistant reply never arrived (codex P2)", () => {
    // Reload mid-send: the user row persisted but no assistant reply followed.
    const restored = normalizeRestoredHistory([u("hi"), a("hello"), u("run the audit")]);
    expect(restored).toEqual([u("hi"), a("hello")]);
  });

  it("drops multiple trailing user turns", () => {
    expect(normalizeRestoredHistory([a("x"), u("a"), u("b")])).toEqual([a("x")]);
  });

  it("keeps a thread that ends on an assistant turn untouched", () => {
    const h = [u("hi"), a("hello")];
    expect(normalizeRestoredHistory(h)).toEqual(h);
  });

  it("filters malformed entries and non-arrays", () => {
    expect(normalizeRestoredHistory("not an array")).toEqual([]);
    expect(
      normalizeRestoredHistory([{ role: "system", content: "x" }, { role: "assistant" }, a("ok")]),
    ).toEqual([a("ok")]);
  });

  it("returns empty for an all-user thread (never completed a turn)", () => {
    expect(normalizeRestoredHistory([u("a"), u("b")])).toEqual([]);
  });
});
