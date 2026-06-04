import { useEffect, useMemo, useRef, useState } from "react";
import { useProactiveInsights } from "../context/useProactiveInsights";
import type { Insight, InsightSeverity } from "../models/proactiveInsights";
import AgentAvatar, { type AgentState } from "./AgentAvatar";

/** The agent's name. Generic + open-source-safe (no site identifier). */
export const AGENT_NAME = "Sage";

const SNOOZE_KEY = "greenhouse-model:agentSnoozedIds";

/** Severity → display treatment + the agent's spoken lead-in. */
const TONE: Record<
  InsightSeverity,
  { lead: string; chip: string; chipClass: string; ring: string; bar: string; avatar: AgentState }
> = {
  warn: {
    lead: "Heads up — I'm watching something:",
    chip: "Concern",
    chipClass: "bg-warn-500/15 text-warn-600 border-warn-500/30",
    ring: "border-warn-500/40",
    bar: "bg-warn-500",
    avatar: "alert",
  },
  savings: {
    lead: "There's money on the table here:",
    chip: "Opportunity",
    chipClass: "bg-leaf-500/15 text-leaf-700 border-leaf-500/30",
    ring: "border-leaf-500/40",
    bar: "bg-leaf-500",
    avatar: "idle",
  },
  info: {
    lead: "Quick observation while you work:",
    chip: "Note",
    chipClass: "bg-sun-500/15 text-sun-600 border-sun-500/30",
    ring: "border-sun-500/40",
    bar: "bg-sun-500",
    avatar: "idle",
  },
  celebrate: {
    lead: "Worth calling out — this is dialed in:",
    chip: "Strong",
    chipClass: "bg-leaf-600/15 text-leaf-700 border-leaf-600/30",
    ring: "border-leaf-600/50",
    bar: "bg-leaf-600",
    avatar: "idle",
  },
};

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  warn: 0,
  savings: 1,
  info: 2,
  celebrate: 3,
};

function loadSnoozed(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(SNOOZE_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

/**
 * Sage's proactive layer. Watches the live dashboard via the shared insight
 * engine and surfaces the highest-priority observation as an animated card —
 * the agent coming to the grower, not the other way round. Each card offers a
 * one-tap deep-dive into the chat ("Ask Sage"), which seeds an expert prompt.
 *
 * Rule-grounded: every observation traces to the model layer (no fabrication).
 * Works with no API key — the cards are pure rule output; only the deep-dive
 * needs the LLM.
 */
export default function AgentObservations() {
  const insights = useProactiveInsights();
  const [dismissed, setDismissed] = useState<Set<string>>(loadSnoozed);
  const [index, setIndex] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const prevActiveKey = useRef<string>("");

  // The chat panel broadcasts its open/close so we don't overlap it.
  useEffect(() => {
    const onState = (e: Event) => setChatOpen(!!(e as CustomEvent).detail?.open);
    window.addEventListener("greenhouse-model:agent-chat-state", onState);
    return () => window.removeEventListener("greenhouse-model:agent-chat-state", onState);
  }, []);

  const active = useMemo(
    () =>
      [...insights]
        .filter((i) => !dismissed.has(i.id))
        .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]),
    [insights, dismissed],
  );

  // When the set of active observations changes (the scenario shifted and a
  // new thing is worth saying), pop back to the top so Sage "speaks up".
  useEffect(() => {
    const key = active.map((a) => a.id).join("|");
    if (key !== prevActiveKey.current) {
      prevActiveKey.current = key;
      setIndex(0);
    }
    // Broadcast count so the chat launcher can badge it.
    window.dispatchEvent(
      new CustomEvent("greenhouse-model:agent-observations", {
        detail: { active: active.length, topSeverity: active[0]?.severity ?? null },
      }),
    );
  }, [active]);

  if (chatOpen || active.length === 0) return null;

  const current: Insight = active[Math.min(index, active.length - 1)];
  const tone = TONE[current.severity];

  const dismiss = (id: string) => {
    setDismissed((prev) => {
      const next = new Set(prev).add(id);
      try {
        sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...next]));
      } catch { /* ignore */ }
      return next;
    });
    setIndex(0);
  };

  const askSage = () => {
    const seed = `${current.title}. ${current.body}\n\nWalk me through why this is happening, how it compares to top operations, and the most cost-effective fix — with rough numbers.`;
    window.dispatchEvent(
      new CustomEvent("greenhouse-model:open-agent", { detail: { seed } }),
    );
  };

  return (
    <div className="fixed bottom-24 right-4 z-40 w-[340px] max-w-[calc(100vw-2rem)]">
      <div
        key={current.id}
        className={`agent-card-pop overflow-hidden rounded-2xl border ${tone.ring} bg-white shadow-2xl`}
      >
        <div className={`h-1 w-full ${tone.bar}`} />
        <div className="flex items-start gap-3 p-3.5">
          <AgentAvatar state={tone.avatar} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-bold text-ink-900">{AGENT_NAME}</span>
              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tone.chipClass}`}>
                {tone.chip}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] italic text-ink-500">{tone.lead}</p>
            <p className="mt-1.5 text-[13px] font-semibold leading-snug text-ink-900">
              {current.title}
            </p>
            <p className="mt-1 text-[12px] leading-snug text-ink-700">{current.body}</p>
            {current.hint && (
              <p className="mt-1 text-[11px] italic text-ink-500">→ {current.hint}</p>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={askSage}
                className="rounded-lg bg-leaf-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-leaf-600"
              >
                Ask {AGENT_NAME}
              </button>
              <button
                type="button"
                onClick={() => dismiss(current.id)}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-500 transition hover:bg-ink-100"
              >
                Got it
              </button>
              {active.length > 1 && (
                <button
                  type="button"
                  onClick={() => setIndex((i) => (i + 1) % active.length)}
                  className="ml-auto text-[11px] font-medium text-ink-400 hover:text-ink-700"
                  title="Next observation"
                >
                  +{active.length - 1} more →
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
