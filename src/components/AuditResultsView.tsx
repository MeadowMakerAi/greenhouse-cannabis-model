import type { InsightSeverity } from "../models/proactiveInsights";
import {
  type SageFinding,
  type FindingTab,
  type FindingConfidence,
} from "../services/sageFindings";
import type { ScenarioInputs } from "../context/ScenarioContext";

/**
 * Renders the audit swarm's structured findings as cards instead of a wall of
 * markdown text. Each card: severity dot + confidence chip + one-line summary,
 * detail behind a native <details> (progressive disclosure), and up to three
 * actions — drill to the relevant tab, apply a one-click scenario patch, or
 * open a Sage deep-dive. "content from model, form from code": the model emits
 * typed findings; this component owns all of the form.
 */

const SEVERITY_STYLE: Record<
  InsightSeverity,
  { dot: string; chip: string; label: string }
> = {
  warn: { dot: "bg-warn-500", chip: "bg-warn-500/15 text-warn-600 border-warn-500/30", label: "Risk" },
  savings: { dot: "bg-leaf-500", chip: "bg-leaf-500/15 text-leaf-700 border-leaf-500/30", label: "Opportunity" },
  info: { dot: "bg-sun-500", chip: "bg-sun-500/15 text-sun-600 border-sun-500/30", label: "Note" },
  celebrate: { dot: "bg-leaf-600", chip: "bg-leaf-600/15 text-leaf-700 border-leaf-600/50", label: "Strong" },
};

const CONFIDENCE_STYLE: Record<FindingConfidence, string> = {
  high: "text-leaf-700",
  medium: "text-sun-600",
  low: "text-ink-400",
};

const TAB_LABEL: Record<FindingTab, string> = {
  build: "Build sheet",
  optimized: "Optimized system",
  science: "Cultivation science",
  live: "Live simulation",
  dli: "Annual DLI",
  supplemental: "Supplemental light",
  ledHps: "LED vs HPS",
  underCanopy: "Under-canopy",
  co2: "CO₂",
  shade: "Shade tradeoff",
  humidity: "Humidity / wet-bulb",
  hvac: "HVAC screening",
  calendar: "Seasonal calendar",
};

function selectTab(tab: FindingTab) {
  window.dispatchEvent(
    new CustomEvent("greenhouse-model:select-tab", { detail: { tab } }),
  );
}

function askSage(f: SageFinding) {
  const seed = `${f.title}. ${f.summary}${f.detail ? `\n\n${f.detail}` : ""}\n\nWalk me through why this is happening, how it compares to top operations, and the most cost-effective fix — with rough numbers.`;
  window.dispatchEvent(
    new CustomEvent("greenhouse-model:open-agent", { detail: { seed } }),
  );
}

function FindingCard({
  f,
  onApply,
}: {
  f: SageFinding;
  onApply: (patch: Partial<ScenarioInputs>, label: string) => void;
}) {
  const s = SEVERITY_STYLE[f.severity];
  return (
    <div className="rounded-xl border border-ink-200 bg-white/70 p-3">
      <div className="flex items-start gap-2">
        <span className={`mt-1 inline-block h-2 w-2 shrink-0 rounded-full ${s.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-bold leading-snug text-ink-900">{f.title}</span>
            <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${s.chip}`}>
              {s.label}
            </span>
            {f.confidence && (
              <span className={`text-[10px] font-semibold uppercase tracking-wide ${CONFIDENCE_STYLE[f.confidence]}`}>
                {f.confidence} confidence
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-ink-700">{f.summary}</p>
          {(f.detail || f.metric) && (
            <details className="mt-1.5 text-[12px]">
              <summary className="cursor-pointer select-none text-ink-500 hover:text-ink-700">
                Details
              </summary>
              {f.detail && <p className="mt-1 leading-snug text-ink-700">{f.detail}</p>}
              {f.metric && (
                <p className="mt-1 text-[11px] italic text-ink-500">Grounded in: {f.metric}</p>
              )}
            </details>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {f.tab && (
              <button
                type="button"
                onClick={() => selectTab(f.tab!)}
                className="rounded-lg border border-ink-200 px-2.5 py-1 text-[11px] font-semibold text-ink-700 transition hover:bg-ink-100"
              >
                View in {TAB_LABEL[f.tab]} →
              </button>
            )}
            {f.patch && (
              <button
                type="button"
                onClick={() => onApply(f.patch!, f.patchLabel ?? "Apply")}
                className="rounded-lg bg-leaf-500 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-leaf-600"
              >
                {f.patchLabel ?? "Apply"}
              </button>
            )}
            <button
              type="button"
              onClick={() => askSage(f)}
              className="rounded-lg px-2 py-1 text-[11px] font-medium text-ink-500 transition hover:bg-ink-100"
            >
              Ask Sage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AuditResultsView({
  findings,
  onApply,
}: {
  findings: SageFinding[];
  onApply: (patch: Partial<ScenarioInputs>, label: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        Audit · {findings.length} finding{findings.length === 1 ? "" : "s"}
      </p>
      {findings.map((f) => (
        <FindingCard key={f.id} f={f} onApply={onApply} />
      ))}
    </div>
  );
}
