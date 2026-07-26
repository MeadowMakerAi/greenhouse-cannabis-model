import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  chatTurn,
  isProviderKeyValid,
  PROVIDER_CONFIGS,
  type ChatMessage,
  type FileAttachment,
  type ProviderId,
} from "../services/chatbotService";
import { PROVIDER_ORDER } from "../services/providers";
import { WRITE_TOOL_NAMES } from "../services/chatbotTools";
import { estimateCost, formatCost } from "../services/pricing";
import { useScenario, defaultScenario } from "../context/ScenarioContext";
import { useDerived, computeDerived } from "../context/useDerived";
import { useSimulation } from "../context/SimulationContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { useLiveDynamics } from "../context/useLiveDynamics";
import { fixtureKWFromPPFD, type FixtureSpec } from "../models/fixtureModel";
import { DAYS_IN_MONTH } from "../utils/formatting";
import { expandDottedKeys } from "../utils/expandDottedKeys";
import AgentAvatar from "./AgentAvatar";
import { AGENT_NAME } from "./AgentObservations";
import AuditResultsView from "./AuditResultsView";
import MarkdownLite from "./MarkdownLite";
import ChatErrorBoundary from "./ChatErrorBoundary";
import { runAuditSwarm, AUDIT_PASSES, AuditStoppedError } from "../services/agentSwarm";
import { HISTORY_KEY, loadHistory, persistHistory } from "../services/chatHistory";
import { assessCompleteness, recommendLighting } from "../services/scenarioAdvisor";
import { cropTargets } from "../data/cropTargets";
import {
  defaultSite,
  defaultGreenhouseGeometry,
  defaultEnvelope,
  defaultElectricalService,
  defaultEconomics,
} from "../data/greenhouseDefaults";

const KEY_STORAGE_PREFIX = "greenhouse-model:apiKey:";
const KEY_SESSION_PREFIX = "greenhouse-model:apiKey:session:";
const SESSION_PREF_KEY = "greenhouse-model:keyPersistencePref";
const PROVIDER_KEY = "greenhouse-model:chatbotProvider";
const MODEL_KEY_PREFIX = "greenhouse-model:chatbotModel:";
const BUDGET_KEY = "greenhouse-model:sessionBudgetUSD";
const LEGACY_KEY = "greenhouse-model:anthropicApiKey";
const LEGACY_MODEL_KEY = "greenhouse-model:chatbotModel";

function storedKeyFor(providerId: ProviderId): string {
  const sess = sessionStorage.getItem(KEY_SESSION_PREFIX + providerId);
  if (sess) return sess;
  const local = localStorage.getItem(KEY_STORAGE_PREFIX + providerId);
  if (local) return local;
  // Migrate the v1 single-provider Anthropic key on first read.
  if (providerId === "anthropic") {
    const legacy = localStorage.getItem(LEGACY_KEY) ?? "";
    if (legacy) {
      localStorage.setItem(KEY_STORAGE_PREFIX + "anthropic", legacy);
      localStorage.removeItem(LEGACY_KEY);
      return legacy;
    }
  }
  return "";
}

// Model ids dropped from a provider's picker that should map to a current
// successor rather than silently resetting the user to the default tier.
const MODEL_REMAP: Record<string, string> = {
  "claude-opus-4-7": "claude-opus-4-8",
};

/**
 * Resolve a stored model id to one the provider still offers. A model removed
 * from the picker (e.g. claude-opus-4-7) would otherwise stay active in
 * localStorage forever — invisible in the dropdown, and stranding the user off
 * the current default. Respect a still-listed choice; remap a known successor;
 * otherwise fall back to the provider default.
 */
function resolveModel(providerId: ProviderId, candidate: string): string {
  const cfg = PROVIDER_CONFIGS[providerId];
  if (cfg.models.some((m) => m.value === candidate)) return candidate;
  const remapped = MODEL_REMAP[candidate];
  if (remapped && cfg.models.some((m) => m.value === remapped)) return remapped;
  return cfg.defaultModel;
}

function storedModelFor(providerId: ProviderId): string {
  const cur = localStorage.getItem(MODEL_KEY_PREFIX + providerId);
  if (cur) {
    const resolved = resolveModel(providerId, cur);
    if (resolved !== cur) localStorage.setItem(MODEL_KEY_PREFIX + providerId, resolved);
    return resolved;
  }
  // Migrate v1 single-model key for Anthropic.
  if (providerId === "anthropic") {
    const legacy = localStorage.getItem(LEGACY_MODEL_KEY);
    if (legacy) {
      const resolved = resolveModel("anthropic", legacy);
      localStorage.setItem(MODEL_KEY_PREFIX + "anthropic", resolved);
      localStorage.removeItem(LEGACY_MODEL_KEY);
      return resolved;
    }
  }
  return PROVIDER_CONFIGS[providerId].defaultModel;
}

function isPublicHostname(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return !(
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "0.0.0.0" ||
    h.endsWith(".local") ||
    h.startsWith("192.168.") ||
    h.startsWith("10.")
  );
}

function fmtTokens(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10_000 ? 0 : 1) + "k";
  return String(n);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

// ── Sage dock geometry: draggable + resizable floating panel (ported from FM
//    Command's Amelia dock). Rect persists to localStorage so the panel stays
//    where the user left it; in this single-page app the Chatbot never
//    unmounts, so it also "follows" across dashboard tabs for free. ──
const SAGE_RECT_KEY = "greenhouse-model:sageDockRect";
const SAGE_MIN_W = 340;
const SAGE_MIN_H = 380;
const SAGE_DEFAULT_W = 460;
const SAGE_DEFAULT_H = 640;
type SageRect = { x: number; y: number; w: number; h: number };
type SageDragMode = "move" | "e" | "w" | "s" | "n" | "se" | "sw" | "ne" | "nw";

const sageClamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), Math.max(lo, hi));

function sageViewport() {
  return {
    vw: typeof window !== "undefined" ? window.innerWidth : 1280,
    vh: typeof window !== "undefined" ? window.innerHeight : 800,
  };
}

function sageDefaultRect(): SageRect {
  const { vw, vh } = sageViewport();
  const w = Math.min(SAGE_DEFAULT_W, vw - 24);
  const h = Math.min(SAGE_DEFAULT_H, vh - 24);
  return { x: Math.max(12, vw - w - 16), y: Math.max(12, vh - h - 16), w, h };
}

function sageFitRect(r: SageRect): SageRect {
  const { vw, vh } = sageViewport();
  const w = sageClamp(r.w, SAGE_MIN_W, vw - 16);
  const h = sageClamp(r.h, SAGE_MIN_H, vh - 16);
  return {
    w,
    h,
    x: sageClamp(r.x, 8, vw - w - 8),
    y: sageClamp(r.y, 8, vh - h - 8),
  };
}

function sageLoadRect(): SageRect {
  try {
    const raw = localStorage.getItem(SAGE_RECT_KEY);
    if (raw) {
      const r = JSON.parse(raw) as SageRect;
      if ([r.x, r.y, r.w, r.h].every((n) => Number.isFinite(n))) {
        return sageFitRect(r);
      }
    }
  } catch {
    /* corrupt/blocked storage — fall back to the default anchor */
  }
  return sageDefaultRect();
}

function sagePersistRect(r: SageRect) {
  try {
    localStorage.setItem(SAGE_RECT_KEY, JSON.stringify(r));
  } catch {
    /* ignore */
  }
}

// ── Sage trace panel ──────────────────────────────────────────────────────
// Graph-of-Trace for a linear agent: Sage's roundtrips run in sequence, so the
// honest render is an ordered step list (NOT a fabricated DAG with invented
// parent/sibling edges). Each step = tool name + a read/write badge + the
// input AND the output artifact, both behind progressive disclosure. This is
// the transparency half of "approval-with-context": you can see exactly what
// Sage did, with what params, and what came back — turning the black box into
// an inspectable work log.

function safeJson(v: unknown): string {
  if (v === undefined) return "";
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** One input/output row: short values inline, long ones behind a disclosure. */
function TraceKV({ label, value }: { label: string; value: unknown }) {
  const json = safeJson(value);
  if (json === "" || json === "{}" || json === "null") return null;
  const long = json.length > 120;
  return (
    <div className="mt-1 flex gap-1.5">
      <span className="shrink-0 pt-px text-[10px] uppercase tracking-wide text-ink-400">{label}</span>
      {long ? (
        <details className="min-w-0">
          <summary className="cursor-pointer truncate font-mono text-ink-600">
            {json.slice(0, 120)}…
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded border border-ink-200 bg-ink-100 p-1.5 font-mono text-[11px] text-ink-800">
            {json}
          </pre>
        </details>
      ) : (
        <span className="min-w-0 break-all font-mono text-ink-600">{json}</span>
      )}
    </div>
  );
}

function ToolTracePanel({ trace }: { trace: NonNullable<ChatMessage["toolTrace"]> }) {
  const writes = trace.filter((t) => WRITE_TOOL_NAMES.has(t.name)).length;
  return (
    <details className="mt-1.5 text-xs">
      <summary className="cursor-pointer select-none text-ink-500 hover:text-ink-700">
        Trace · {trace.length} step{trace.length === 1 ? "" : "s"}
        {writes > 0 && (
          <span className="ml-1 text-leaf-600">
            · {writes} write{writes === 1 ? "" : "s"}
          </span>
        )}
      </summary>
      <ol className="mt-1 space-y-1">
        {trace.map((t, j) => {
          const isWrite = WRITE_TOOL_NAMES.has(t.name);
          return (
            <li key={j} className="rounded border border-ink-200 bg-white/60 p-1.5">
              <div className="flex items-center gap-1.5">
                <span className="tabular-nums text-ink-400">{j + 1}</span>
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${isWrite ? "bg-leaf-500" : "bg-ink-400"}`}
                  aria-hidden
                />
                <span className="font-mono font-semibold text-ink-800">{t.name}</span>
                <span
                  className={`ml-auto rounded px-1 text-[10px] font-semibold uppercase tracking-wide ${
                    isWrite ? "bg-leaf-500/15 text-leaf-700" : "bg-ink-200 text-ink-500"
                  }`}
                >
                  {isWrite ? "write" : "read"}
                </span>
              </div>
              <TraceKV label="in" value={t.input} />
              <TraceKV label="out" value={t.output} />
            </li>
          );
        })}
      </ol>
    </details>
  );
}

// ── Explain-back on writes ────────────────────────────────────────────────
// The doc's "approval gate = explain-back": don't offer a bare Undo, show
// exactly WHAT changed. Scenario edits are reversible, so we keep the
// optimistic-apply + Undo model (a blocking gate would be friction here) —
// but the summary is derived straight from the write tools' own inputs, so
// it's honest ("what Sage set"), never invented.

const FIELD_LABELS: Record<string, string> = {
  greenhouseLengthFt: "length",
  greenhouseWidthFt: "width",
  eaveHeightFt: "eave",
  peakHeightFt: "peak",
  canopyAreaSqFt: "canopy",
  fixtureId: "fixture",
  fixtureCount: "fixture count",
  gridSpacingFt: "grid spacing",
  baseTransmissionPct: "glazing transmission",
  envelopeUValueBTUhrFtF: "glazing U-value",
  radiantHeatingCapacityBTUhr: "heating capacity",
  ventilationCFM: "ventilation",
  siteAddress: "location",
};

function humanizeKey(k: string): string {
  if (FIELD_LABELS[k]) return FIELD_LABELS[k];
  // Fallback: de-camelCase, drop unit suffixes, lowercase.
  return k
    .replace(/([A-Z])/g, " $1")
    .replace(/\b(Ft|Sq Ft|Pct|BTUhr|CFM)\b/gi, "")
    .trim()
    .toLowerCase();
}

function flattenChanges(obj: Record<string, unknown>, out: string[]) {
  for (const [k, v] of Object.entries(obj)) {
    if (v != null && typeof v === "object" && !Array.isArray(v)) {
      flattenChanges(v as Record<string, unknown>, out);
    } else if (v != null) {
      out.push(`${humanizeKey(k)} → ${Array.isArray(v) ? v.join("/") : v}`);
    }
  }
}

/** Human-readable summary of a turn's writes, built from the tool inputs. */
function describeWrites(trace: NonNullable<ChatMessage["toolTrace"]>): string {
  const changes: string[] = [];
  for (const t of trace) {
    if (!WRITE_TOOL_NAMES.has(t.name)) continue;
    if (t.name === "add_custom_fixture") {
      changes.push("added a fixture");
      continue;
    }
    if (t.input && typeof t.input === "object") {
      flattenChanges(t.input as Record<string, unknown>, changes);
    }
  }
  if (changes.length === 0) return "Sage updated the scenario";
  const shown = changes.slice(0, 3).join(", ");
  return `Set ${shown}${changes.length > 3 ? ` +${changes.length - 3} more` : ""}`;
}

export default function Chatbot() {
  const { inputs, climate, setInputs, customFixtures, addCustomFixture } = useScenario();
  const derived = useDerived();
  const sim = useSimulation();
  const allFixtures = useAllFixtures();
  const live = useLiveDynamics();

  const [open, setOpen] = useState(false);
  const [providerId, setProviderId] = useState<ProviderId>(
    () => (localStorage.getItem(PROVIDER_KEY) as ProviderId) || "anthropic",
  );
  const cfg = PROVIDER_CONFIGS[providerId];
  const [apiKey, setApiKey] = useState<string>(() => storedKeyFor(providerId));
  const [sessionOnly, setSessionOnly] = useState<boolean>(
    () => localStorage.getItem(SESSION_PREF_KEY) === "session",
  );
  const [keyDraft, setKeyDraft] = useState("");
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [model, setModel] = useState<string>(() => storedModelFor(providerId));
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>(loadHistory);
  const [busy, setBusy] = useState(false);
  // Live-streamed assistant text for the in-flight turn (Anthropic streams; other
  // providers leave this null and show the "Thinking…" spinner until done).
  const [streaming, setStreaming] = useState<string | null>(null);
  // Name of the tool currently executing — live activity during multi-tool
  // turns so long ingests don't look frozen.
  const [toolActivity, setToolActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Hybrid confirm UX. Proposals (recommend_* tools) never mutate — the top
  // option surfaces here as an Apply chip. Direct writes apply immediately but
  // stash a pre-turn snapshot here so one click reverses the whole turn.
  const [pendingProposal, setPendingProposal] = useState<{
    label: string;
    patch: Partial<typeof inputs>;
  } | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<typeof inputs | null>(null);
  // Human-readable "what changed" for the Undo affordance (explain-back).
  const [undoSummary, setUndoSummary] = useState<string | null>(null);
  // Same-turn write overlay. React state doesn't update mid-turn, so tools that
  // run AFTER a write in the same chatTurn (the prescribed apply→assess→recommend
  // flow) would read stale pre-write inputs — assess would call just-applied
  // dims "missing" and recommend would size the DEFAULT greenhouse. Write tools
  // record their patches here; read tools see inputs+overlay. Cleared per send.
  // ponytail: overlay skips ScenarioContext's clamp/auto-derive — good enough
  // for field comparisons + sizing args; derived (solar) still lags one turn
  // and get_derived_outputs says so explicitly.
  const turnPatchRef = useRef<Partial<typeof inputs>>({});
  const scenarioNow = () => ({ ...inputs, ...turnPatchRef.current });
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Sage dock rect (draggable header + 8 resize handles), persisted per session.
  const [dockRect, setDockRect] = useState<SageRect>(() => sageLoadRect());
  const dockRectRef = useRef(dockRect);
  dockRectRef.current = dockRect;
  const [dockDragging, setDockDragging] = useState(false);
  // Threshold-based start: a plain click on a header button never triggers a
  // drag (and isn't preventDefault'd), so header controls keep working.
  const startDockDrag =
    (mode: SageDragMode) => (e: ReactPointerEvent) => {
      const sx = e.clientX;
      const sy = e.clientY;
      const r0 = dockRectRef.current;
      let started = false;
      const onMove = (ev: PointerEvent) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        if (!started) {
          if (Math.abs(dx) + Math.abs(dy) < 4) return;
          started = true;
          setDockDragging(true);
        }
        const { vw, vh } = sageViewport();
        let { x, y, w, h } = r0;
        if (mode === "move") {
          x = sageClamp(r0.x + dx, 0, vw - r0.w);
          y = sageClamp(r0.y + dy, 0, vh - r0.h);
        } else {
          if (mode.includes("e")) w = sageClamp(r0.w + dx, SAGE_MIN_W, vw - r0.x);
          if (mode.includes("s")) h = sageClamp(r0.h + dy, SAGE_MIN_H, vh - r0.y);
          if (mode.includes("w")) {
            w = sageClamp(r0.w - dx, SAGE_MIN_W, r0.x + r0.w);
            x = r0.x + (r0.w - w);
          }
          if (mode.includes("n")) {
            h = sageClamp(r0.h - dy, SAGE_MIN_H, r0.y + r0.h);
            y = r0.y + (r0.h - h);
          }
        }
        setDockRect({ x, y, w, h });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        if (started) {
          setDockDragging(false);
          sagePersistRect(dockRectRef.current);
        }
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    };
  const fileInputRef = useRef<HTMLInputElement>(null);
  // In-flight request controllers, so the user can Stop a hung/slow call. The
  // provider also enforces a hard per-request timeout (abortTimeout) so a
  // stalled call can't pin the spinner forever even without a manual stop.
  // Chat turns and audits get SEPARATE controllers — they can overlap, and a
  // shared ref would let one Stop abort the other's request (or orphan it).
  const chatAbortRef = useRef<AbortController | null>(null);
  const auditAbortRef = useRef<AbortController | null>(null);
  const stopChat = () => chatAbortRef.current?.abort();
  const stopAudit = () => auditAbortRef.current?.abort();

  // Session cost meter — derived from the usage each assistant reply carries, so
  // it can never drift from the actual turns. Estimate only (see pricing.ts):
  // sums priced turns, treats free tiers as $0, and flags if any turn is unpriced.
  const sessionMeter = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let usd = 0;
    let anyUnpriced = false;
    for (const m of history) {
      if (!m.usage) continue;
      // Include cache tokens so the token display can't disagree with the USD
      // (estimateCost bills cache write/read; inputTokens excludes them).
      inputTokens +=
        m.usage.inputTokens +
        (m.usage.cacheCreationTokens ?? 0) +
        (m.usage.cacheReadTokens ?? 0);
      outputTokens += m.usage.outputTokens;
      const est = estimateCost(m.usage);
      if (est && est.usd === null && !est.isFree) anyUnpriced = true;
      else usd += est?.usd ?? 0;
    }
    return { inputTokens, outputTokens, usd, anyUnpriced };
  }, [history]);

  // Optional session spend ceiling — turns the passive meter into a real
  // guardrail for BYO-key users. null = off. When the session's estimated cost
  // reaches the cap, new sends and audits are blocked until the user raises or
  // clears it (their key, their money — a hard-but-overridable gate).
  const [budgetUSD, setBudgetUSD] = useState<number | null>(() => {
    const raw = typeof window === "undefined" ? null : localStorage.getItem(BUDGET_KEY);
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const setBudget = (next: number | null) => {
    setBudgetUSD(next);
    if (next == null) localStorage.removeItem(BUDGET_KEY);
    else localStorage.setItem(BUDGET_KEY, String(next));
  };
  // The cap is a *session* ceiling, but sessionMeter.usd includes cost from a
  // restored (persisted) thread — otherwise reopening the tab would count last
  // session's spend and could block the first send. Snapshot the restored cost
  // once at mount and measure the cap against spend incurred THIS load.
  const baselineUsdRef = useRef<number | null>(null);
  if (baselineUsdRef.current === null) baselineUsdRef.current = sessionMeter.usd;
  const sessionSpendUSD = Math.max(0, sessionMeter.usd - baselineUsdRef.current);
  // Soft, between-request gate: checked BEFORE a send/audit, not mid-flight, so
  // a request that starts just under the cap still runs to completion and can
  // land just past it (a 6-call audit is the worst case). A true hard cap needs
  // per-request token prediction we don't have for a screening tool — the
  // overshoot is bounded to one request and disclosed in the cap tooltip.
  // (Codex challenge P1, 2026-07-26.)
  const overBudget = budgetUSD != null && sessionSpendUSD >= budgetUSD;
  // Sub-cent caps/costs need more than 2 decimals or the message reads
  // "cap $0.00 reached at $0.00" for a real $0.0006 session.
  const fmtUsd = (n: number) => (n > 0 && n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`);
  const budgetMsg = `Session spend cap (${fmtUsd(budgetUSD ?? 0)}) reached — you're at ~${fmtUsd(sessionSpendUSD)}. Raise or clear the cap under the meter to continue.`;

  // Proactive-agent wiring. `obs` mirrors AgentObservations' active-count so
  // the launcher can badge it; sendRef keeps the latest send() for the
  // event-driven deep-dive without stale closures.
  const [obs, setObs] = useState<{ active: number; topSeverity: string | null }>({
    active: 0,
    topSeverity: null,
  });
  const sendRef = useRef<(t?: string) => void>(() => {});

  // Sage swarm — parallel multi-pass audit. auditDone tracks which passes
  // have returned for the progress indicator.
  const [auditing, setAuditing] = useState(false);
  const [auditDone, setAuditDone] = useState<string[]>([]);

  // Persist the thread on every change so a reload resumes the conversation.
  useEffect(() => {
    persistHistory(history);
  }, [history]);

  // Tell the proactive layer whether the chat panel is open (so it doesn't
  // overlap), and badge the launcher with the live observation count.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("greenhouse-model:agent-chat-state", { detail: { open } }),
    );
  }, [open]);
  useEffect(() => {
    const onObs = (e: Event) =>
      setObs((e as CustomEvent).detail ?? { active: 0, topSeverity: null });
    window.addEventListener("greenhouse-model:agent-observations", onObs);
    return () =>
      window.removeEventListener("greenhouse-model:agent-observations", onObs);
  }, []);
  // Open + deep-dive when an observation card asks Sage about itself.
  useEffect(() => {
    const onOpenAgent = (e: Event) => {
      const seed = (e as CustomEvent).detail?.seed as string | undefined;
      setOpen(true);
      if (seed) {
        const canAutoSend = !!apiKey || !cfg.requiresKey;
        if (canAutoSend) sendRef.current(seed);
        else setDraft(seed); // no key yet — prefill so they can review + send
      }
    };
    window.addEventListener("greenhouse-model:open-agent", onOpenAgent);
    return () =>
      window.removeEventListener("greenhouse-model:open-agent", onOpenAgent);
  }, [apiKey, cfg.requiresKey]);
  // Any UI element can ask Sage to run the full swarm audit.
  useEffect(() => {
    const onAudit = () => runAuditRef.current();
    window.addEventListener("greenhouse-model:run-audit", onAudit);
    return () =>
      window.removeEventListener("greenhouse-model:run-audit", onAudit);
  }, []);

  const switchProvider = (next: ProviderId) => {
    setProviderId(next);
    localStorage.setItem(PROVIDER_KEY, next);
    setApiKey(storedKeyFor(next));
    setModel(storedModelFor(next));
    setError(null);
    setKeyDraft("");
    // If switching to a provider without a key, surface the config panel.
    setShowKeyConfig(PROVIDER_CONFIGS[next].requiresKey && !storedKeyFor(next));
  };

  const onFilesPicked = async (files: FileList | null) => {
    if (!files) return;
    const next: FileAttachment[] = [];
    for (const f of Array.from(files)) {
      const okType =
        f.type === "application/pdf" ||
        f.type === "image/png" ||
        f.type === "image/jpeg" ||
        f.type === "image/jpg" ||
        f.type === "image/webp" ||
        f.type === "image/gif";
      if (!okType) {
        setError(`Unsupported file: ${f.name} (${f.type || "no type"})`);
        continue;
      }
      const base64 = await fileToBase64(f);
      next.push({ mediaType: f.type, base64, name: f.name });
    }
    if (next.length > 0) setAttachments((prev) => [...prev, ...next]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length, busy]);

  const saveApiKey = (k: string) => {
    const trimmed = k.trim();
    if (trimmed && cfg.requiresKey && !isProviderKeyValid(providerId, trimmed)) {
      setError(
        `That doesn't look like a ${cfg.label} key${
          cfg.keyHint ? ` (${cfg.keyHint})` : ""
        }. Double-check at ${cfg.keyUrl ?? "the provider's console"}.`,
      );
      return;
    }
    setApiKey(trimmed);
    const localK = KEY_STORAGE_PREFIX + providerId;
    const sessK = KEY_SESSION_PREFIX + providerId;
    if (trimmed) {
      if (sessionOnly) {
        sessionStorage.setItem(sessK, trimmed);
        localStorage.removeItem(localK);
      } else {
        localStorage.setItem(localK, trimmed);
        sessionStorage.removeItem(sessK);
      }
    } else {
      localStorage.removeItem(localK);
      sessionStorage.removeItem(sessK);
    }
    setKeyDraft("");
    setShowKeyConfig(false);
    setError(null);
  };

  const togglePersistence = (toSession: boolean) => {
    setSessionOnly(toSession);
    localStorage.setItem(SESSION_PREF_KEY, toSession ? "session" : "local");
    if (apiKey) {
      const localK = KEY_STORAGE_PREFIX + providerId;
      const sessK = KEY_SESSION_PREFIX + providerId;
      if (toSession) {
        sessionStorage.setItem(sessK, apiKey);
        localStorage.removeItem(localK);
      } else {
        localStorage.setItem(localK, apiKey);
        sessionStorage.removeItem(sessK);
      }
    }
  };

  const clearAllData = () => {
    if (
      !window.confirm(
        "Forget all API keys, chat history, and model preferences? Cannot be undone.",
      )
    ) {
      return;
    }
    for (const id of PROVIDER_ORDER) {
      localStorage.removeItem(KEY_STORAGE_PREFIX + id);
      sessionStorage.removeItem(KEY_SESSION_PREFIX + id);
      localStorage.removeItem(MODEL_KEY_PREFIX + id);
    }
    localStorage.removeItem(LEGACY_KEY);
    localStorage.removeItem(LEGACY_MODEL_KEY);
    localStorage.removeItem(PROVIDER_KEY);
    localStorage.removeItem(SESSION_PREF_KEY);
    localStorage.removeItem(HISTORY_KEY);
    setApiKey("");
    setHistory([]);
    setError(null);
    setShowKeyConfig(false);
    setKeyDraft("");
  };

  const maskedKey = apiKey
    ? `${apiKey.slice(0, Math.min(7, apiKey.length - 4))}…${apiKey.slice(-4)}`
    : "";
  const onPublicHost = isPublicHostname();

  const saveModel = (m: string) => {
    setModel(m);
    localStorage.setItem(MODEL_KEY_PREFIX + providerId, m);
  };

  const unsupportedAttachmentWarning = useMemo(() => {
    if (attachments.length === 0) return null;
    const hasPdf = attachments.some((a) => a.mediaType === "application/pdf");
    const hasImage = attachments.some((a) => a.mediaType.startsWith("image/"));
    const problems: string[] = [];
    if (hasPdf && !cfg.supportsPdf) {
      problems.push(`${cfg.label} does not support PDF attachments — they will be dropped before sending. Switch to Anthropic or Gemini to ingest PDFs.`);
    }
    if (hasImage && !cfg.supportsImages) {
      problems.push(`${cfg.label} does not support image attachments.`);
    }
    return problems.length ? problems.join(" ") : null;
  }, [attachments, cfg]);

  const toolHandler = async (name: string, input: Record<string, unknown>) => {
    switch (name) {
      case "get_scenario":
        return scenarioNow();
      case "get_derived_outputs": {
        // Recompute from the same-turn overlay so writes made earlier this turn
        // are reflected NOW. The React `derived` memo lags a full render, so a
        // bare read after a set_scenario would report pre-write numbers and Sage
        // would narrate values that contradict the change it just made.
        const d = computeDerived(scenarioNow(), climate, allFixtures);
        // Climate normals are an ASYNC per-site fetch keyed on lat/lon — they
        // can't refresh within a turn. So if the user moved the site this turn,
        // the recompute pairs the NEW latitude with the OLD site's climate
        // (shortwave, temps, wet-bulb): outdoor DLI + climate-driven figures
        // reflect the prior location until the next turn. Warn rather than
        // silently report a mismatched blend. (Geometry/fixture/envelope edits
        // have no such lag — they're fully live above.)
        const movedSite =
          "latitude" in turnPatchRef.current || "longitude" in turnPatchRef.current;
        return {
          ...(movedSite
            ? {
                climateWarning:
                  "Site coordinates changed THIS turn. Outdoor-climate figures (outdoorDLI, monthly temps, wet-bulb, heating/cooling from normals) still reflect the PREVIOUS location — climate normals refetch next turn. Geometry, fixture, and envelope numbers are current. Tell the user the climate-based figures update on the next message.",
              }
            : {}),
          peakInstalledKW: d.peakInstalledKW,
          peakFixtureCount: d.peakFixtureCount,
          peakWattsPerSqFt: d.peakWattsPerSqFt,
          peakCoveragePerFixtureSqFt: d.peakCoveragePerFixtureSqFt,
          peakSquareGridSpacingFt: d.peakSquareGridSpacingFt,
          annualKwh: d.annualKwh,
          annualCost: d.annualCost,
          peakCoolingTons: d.peakCoolingTons,
          peakNetHeatingLoad: d.peakNetHeatingLoad,
          annualHeatingFuelMMBtu: d.annualHeatingFuelMMBtu,
          activeFixture: d.fixture,
          target: d.target,
          months: d.months.map((m) => ({
            month: m.monthLabel,
            outdoorDLI: +m.outdoorDLI.toFixed(1),
            flowerWindowDLI: +m.flowerWindowDLI.toFixed(1),
            supplementalDLI: +m.supplementalDLIRequired.toFixed(1),
            supplementalPPFD: Math.round(m.supplementalPPFDRequired),
            installedKW: +m.installedKW.toFixed(1),
            monthlyKwh: Math.round(m.monthlyKwh),
            monthlyCostUSD: Math.round(m.monthlyCostUSD),
            coolingTons: +m.coolingTons.toFixed(1),
            dehumidPintsDay: Math.round(m.dehumidPintsPerDay),
            botrytisScore: Math.round(m.botrytisScore),
            powderyMildewScore: Math.round(m.powderyMildewScore),
          })),
          yieldProjection: d.yieldProjection,
          cropSteering: d.cropSteering,
          energyUseIntensity_kWhPerGram: d.energyUseIntensity_kWhPerGram,
        };
      }
      case "set_scenario": {
        // Expand dotted keys → nested objects. The system prompt instructs Sage
        // to write nested envelope/bench fields as "envelope.baseTransmissionPct";
        // if the model emits that literal flat key, the nested deep-merge below
        // never fires and it lands as a junk top-level property no model consumer
        // reads (silent no-op write). Splitting on "." here accepts BOTH the
        // dotted and the already-nested shape. `__proto__` segments are dropped
        // so a crafted key can't reach Object.prototype.
        const rawPatches = expandDottedKeys(
          (input.patches ?? {}) as Record<string, unknown>,
        );
        const merged: Record<string, unknown> = { ...rawPatches };
        // Registry-id fields must reference real entries — a model-invented id
        // (found live: GPT-5 wrote a made-up cropTargetId) would persist into
        // inputs and crash every derived-output consumer. Reject, don't apply.
        const rejected: Record<string, string> = {};
        // Object.hasOwn (not `cropTargets[id]`): a bare index lets id "__proto__"
        // resolve to Object.prototype (truthy) and slip past the guard.
        if ("cropTargetId" in merged && !Object.hasOwn(cropTargets, String(merged.cropTargetId))) {
          rejected.cropTargetId = `unknown id "${merged.cropTargetId}" — valid: ${Object.keys(cropTargets).join(", ")}`;
          delete merged.cropTargetId;
        }
        if ("fixtureId" in merged && !Object.hasOwn(allFixtures, String(merged.fixtureId))) {
          rejected.fixtureId = `unknown id "${merged.fixtureId}" — use list_fixtures for valid ids`;
          delete merged.fixtureId;
        }
        // Deep-merge ANY nested-object patch (envelope, benchLayout, …) onto the
        // current value. A partial patch like {benchLayout:{benchWidthFt:5}} must
        // not drop sibling fields — the clamp would then backfill them from
        // defaults (e.g. re-disable benches). This is the shallow-merge class
        // that already bit `envelope` once; generalizing it fixes every nested
        // field, not just the two we know about.
        const cur = inputs as unknown as Record<string, unknown>;
        for (const [key, val] of Object.entries(rawPatches)) {
          if (
            val && typeof val === "object" && !Array.isArray(val) &&
            cur[key] && typeof cur[key] === "object" && !Array.isArray(cur[key])
          ) {
            merged[key] = {
              ...(cur[key] as Record<string, unknown>),
              ...(val as Record<string, unknown>),
            };
          }
        }
        setInputs(merged as Partial<typeof inputs>);
        Object.assign(turnPatchRef.current, merged as Partial<typeof inputs>);
        return Object.keys(rejected).length
          ? { applied: merged, rejected }
          : { applied: merged };
      }
      case "list_fixtures":
        return Object.values(allFixtures).map((f) => ({
          id: f.id,
          label: f.label,
          vendor: f.vendor,
          model: f.model,
          type: f.type,
          ppe: f.ppe,
          wattsPerFixture: f.wattsPerFixture,
          ppf_umol_s: f.ppf_umol_s,
          minVoltage: f.minVoltage,
          maxVoltage: f.maxVoltage,
          source: f.source,
          notes: f.notes,
        }));
      case "set_active_fixture": {
        const id = String(input.fixtureId ?? "");
        if (!allFixtures[id]) return { error: `Fixture id ${id} not found` };
        setInputs({ fixtureId: id });
        turnPatchRef.current.fixtureId = id as typeof inputs.fixtureId;
        return { activeFixture: id };
      }
      case "assess_completeness": {
        const s = scenarioNow();
        return assessCompleteness(
          {
            latitude: s.latitude,
            longitude: s.longitude,
            greenhouseLengthFt: s.greenhouseLengthFt,
            greenhouseWidthFt: s.greenhouseWidthFt,
            eaveHeightFt: s.eaveHeightFt,
            peakHeightFt: s.peakHeightFt,
            canopyAreaSqFt: s.canopyAreaSqFt,
            envelopeBaseTransmissionPct: s.envelope.baseTransmissionPct,
            fixtureId: s.fixtureId,
            fixtureType: allFixtures[s.fixtureId]?.type,
            flowerPhotoperiodHours: s.flowerPhotoperiodHours,
            co2Enabled: s.co2Enabled,
            ventilationMode: s.ventilationMode,
            radiantHeatingEnabled: s.radiantHeatingEnabled,
            thermalScreenEnabled: s.thermalScreenEnabled,
            mechanicalCoolingEnabled: s.mechanicalCoolingEnabled,
            serviceVoltagePrimary: s.serviceVoltagePrimary,
            branchCircuitAmps: s.branchCircuitAmps,
            electricityRatePerKwh: s.electricityRatePerKwh,
          },
          {
            latitude: defaultSite.latitude,
            longitude: defaultSite.longitude,
            greenhouseLengthFt: defaultGreenhouseGeometry.greenhouseLengthFt,
            greenhouseWidthFt: defaultGreenhouseGeometry.greenhouseWidthFt,
            eaveHeightFt: defaultGreenhouseGeometry.eaveHeightFt,
            peakHeightFt: defaultGreenhouseGeometry.peakHeightFt,
            envelopeBaseTransmissionPct: defaultEnvelope.baseTransmissionPct,
            // Source of truth — a literal here drifted from the shipped default
            // ("ledHighEfficiency" ≠ gavitaPro1700eLED), which made a fresh
            // scenario report its default fixture as user-established, inverting
            // the lighting completeness answer.
            fixtureId: defaultScenario.fixtureId,
            serviceVoltagePrimary: defaultElectricalService.serviceVoltages[1] ?? 240,
            branchCircuitAmps: defaultElectricalService.branchCircuitAmps,
            electricityRatePerKwh: defaultEconomics.electricityRatePerKwh,
          },
        );
      }
      case "recommend_lighting": {
        const ids = input.fixtureIds as string[] | undefined;
        const fixtures = ids?.length
          ? ids.map((id) => allFixtures[id]).filter(Boolean)
          : Object.values(allFixtures).filter((f) => f.type === "LED");
        if (fixtures.length === 0) return { error: "No matching fixtures." };
        const s = scenarioNow();
        // Fresh solar from the same-turn overlay: if the user just changed
        // geometry/glazing this turn, size against the NEW monthly flower-window
        // DLI, not the pre-write memo.
        const dNow = computeDerived(s, climate, allFixtures);
        const rec = recommendLighting({
          targetPPFD: input.targetPPFD != null ? Number(input.targetPPFD) : undefined,
          targetDLI: input.targetDLI != null ? Number(input.targetDLI) : undefined,
          photoperiodHours: s.flowerPhotoperiodHours,
          canopyAreaSqFt: s.canopyAreaSqFt,
          electricityRatePerKwh: s.electricityRatePerKwh,
          monthlyFlowerWindowDLI: dNow.months.map((m) => m.flowerWindowDLI),
          fixtures,
        });
        if (!("error" in rec) && rec.options[0]) {
          const top = rec.options[0];
          // Surface the top option as an Apply chip — proposal only, no mutation.
          // The patch carries the DLI target too: applying just the fixture would
          // leave the sim sizing to its old target, breaking the label's promise.
          setPendingProposal({
            label: `${top.fixtureCount}× ${top.label} → ~${rec.targetPPFD} PPFD / DLI ${rec.targetDLI} (+${top.addedCoolingTons} tons heat)`,
            patch: {
              fixtureId: top.fixtureId as typeof inputs.fixtureId,
              customTargetDLIOverride: rec.targetDLI,
            },
          });
        }
        // Solar (derived) can't recompute mid-turn: if this turn already moved
        // the site or glazing, say so instead of implying the sizing saw it.
        const overlayKeys = Object.keys(turnPatchRef.current);
        const solarStale = ["latitude", "longitude", "envelope"].some((k) =>
          overlayKeys.includes(k),
        );
        return solarStale && !("error" in rec)
          ? {
              ...rec,
              warning:
                "Site/glazing changed earlier this turn; the solar curve used for sizing reflects the PRE-change site. Re-run next turn to size against the updated site.",
            }
          : rec;
      }
      case "add_custom_fixture": {
        const vendor = String(input.vendor);
        const modelName = String(input.model);
        const wattsPerFixture = Number(input.wattsPerFixture);
        const ppf = Number(input.ppf_umol_s);
        const type = (input.type as "LED" | "HPS") ?? "LED";
        const id = `custom:${vendor}-${modelName}`.toLowerCase().replace(/[^a-z0-9-:]/g, "-");
        const fixture: FixtureSpec = {
          id,
          label: `${vendor} ${modelName}`,
          vendor,
          model: modelName,
          type,
          ppe: wattsPerFixture > 0 ? ppf / wattsPerFixture : 0,
          opticalUtilization: type === "HPS" ? 0.8 : 0.85,
          dimmable: true,
          radiantFraction: type === "HPS" ? 0.6 : 0.32,
          convectiveFraction: type === "HPS" ? 0.4 : 0.68,
          wattsPerFixture,
          ppf_umol_s: ppf,
          minVoltage: Number(input.minVoltage ?? (type === "HPS" ? 208 : 120)),
          maxVoltage: Number(input.maxVoltage ?? 277),
          powerFactor: type === "HPS" ? 0.92 : 0.95,
          source: "custom",
          notes: input.notes ? String(input.notes) : undefined,
        };
        // Idempotent by deterministic id: a re-run of this turn (e.g. the
        // rate-limit fallback replaying it on Gemini) must not append a
        // duplicate — select the existing fixture instead of adding twice.
        const existed = !!allFixtures[id];
        if (!existed) addCustomFixture(fixture);
        setInputs({ fixtureId: id });
        turnPatchRef.current.fixtureId = id as typeof inputs.fixtureId;
        return existed ? { selected: id, note: "fixture already existed" } : { added: id };
      }
      case "compare_fixtures": {
        const ids = (input.fixtureIds as string[]) ?? [];
        return ids.map((id) => {
          const f = allFixtures[id];
          if (!f) return { id, error: "not found" };
          let kwh = 0;
          let cost = 0;
          let peakKW = 0;
          let peakFix = 0;
          let peakWatts = 0;
          derived.months.forEach((m, idx) => {
            const sized = fixtureKWFromPPFD({
              supplementalPPFDRequired: m.supplementalPPFDRequired,
              canopyAreaSqFt: inputs.canopyAreaSqFt,
              fixture: f,
              photoperiodHours: inputs.flowerPhotoperiodHours,
              electricityRatePerKwh: inputs.electricityRatePerKwh,
              daysInMonth: DAYS_IN_MONTH[idx],
            });
            kwh += sized.monthlyKwh;
            cost += sized.monthlyCostUSD;
            peakKW = Math.max(peakKW, sized.installedKW);
            peakFix = Math.max(peakFix, sized.fixtureCount);
            peakWatts = Math.max(peakWatts, sized.electricalWatts);
          });
          const coverageFt2 = peakFix > 0 ? inputs.canopyAreaSqFt / peakFix : 0;
          const supports120 = f.minVoltage <= 120 && f.maxVoltage >= 120;
          const supports240 = f.minVoltage <= 240 && f.maxVoltage >= 240;
          const pf = f.powerFactor ?? 0.95;
          const annualDemandCostUSD =
            peakKW * inputs.demandChargePerKwMonth * 12;
          const annualEnergyCostUSD = cost;
          const annualTotalCostUSD = annualEnergyCostUSD + annualDemandCostUSD;
          return {
            id,
            label: f.label,
            ppe: f.ppe,
            wattsPerFixture: f.wattsPerFixture,
            peakInstalledKW: +peakKW.toFixed(1),
            peakFixtureCount: peakFix,
            wattsPerSqFt: +(peakWatts / Math.max(1, inputs.canopyAreaSqFt)).toFixed(1),
            coveragePerFixtureSqFt: +coverageFt2.toFixed(1),
            gridSpacingFt: coverageFt2 > 0 ? +Math.sqrt(coverageFt2).toFixed(1) : 0,
            annualKwh: Math.round(kwh),
            annualEnergyCostUSD: Math.round(annualEnergyCostUSD),
            annualDemandCostUSD: Math.round(annualDemandCostUSD),
            annualCostUSD: Math.round(annualTotalCostUSD),
            supports120V: supports120,
            supports240V: supports240,
            ampsPer120V: supports120 ? +(f.wattsPerFixture / (120 * pf)).toFixed(2) : null,
            ampsPer240V: supports240 ? +(f.wattsPerFixture / (240 * pf)).toFixed(2) : null,
            totalAmps240V: supports240 ? Math.round(peakWatts / (240 * pf)) : null,
            source: f.source,
          };
        });
      }
      case "get_simulation_state":
        return {
          dayOfYear: sim.dayOfYear,
          hourOfDay: sim.hourOfDay,
          playing: sim.playing,
          ...live.snapshot,
        };
      case "set_simulation_time": {
        if (typeof input.dayOfYear === "number") sim.setDayOfYear(input.dayOfYear);
        if (typeof input.hourOfDay === "number") sim.setHourOfDay(input.hourOfDay);
        return { dayOfYear: sim.dayOfYear, hourOfDay: sim.hourOfDay };
      }
      default:
        return { error: `Unknown tool ${name}` };
    }
  };

  const send = async (overrideText?: string) => {
    const text = overrideText !== undefined ? overrideText : draft;
    const hasInput = text.trim() || attachments.length > 0;
    // Guard on `auditing` too: a chat turn concurrent with an audit can append
    // consecutive same-role messages and corrupt the API's user/assistant
    // alternation (Stage-A P2). Audit and chat must not run at once.
    if (!hasInput || busy || auditing) return;
    if (overBudget) {
      setError(budgetMsg);
      return;
    }
    // Filter out attachments the selected provider can't handle so we
    // don't send images to text-only Groq/Ollama, or PDFs to OpenAI/
    // OpenRouter/Groq/Ollama. The UI warning was only advisory before —
    // this is the actual gate.
    const dropped: { name: string; reason: string }[] = [];
    const sentAttachments = attachments.filter((a) => {
      if (a.mediaType === "application/pdf" && !cfg.supportsPdf) {
        dropped.push({ name: a.name, reason: "PDFs not supported by this provider" });
        return false;
      }
      if (a.mediaType.startsWith("image/") && !cfg.supportsImages) {
        dropped.push({ name: a.name, reason: "images not supported by this provider" });
        return false;
      }
      return true;
    });
    const baseUserMsg = text.trim() || (sentAttachments.length > 0 ? "Please analyze the attached spec sheet and update the model accordingly." : "");
    const droppedNote =
      dropped.length > 0
        ? `[Dropped ${dropped.length} attachment(s) before sending: ` +
          dropped.map((d) => `${d.name} (${d.reason})`).join("; ") +
          `. Switch to Anthropic or Gemini to ingest these.]\n\n`
        : "";
    const userMsg = droppedNote + baseUserMsg;
    setDraft("");
    setAttachments([]);
    setError(null);
    if (cfg.requiresKey && !apiKey) {
      setError(`Configure a ${cfg.label} API key first.`);
      return;
    }
    if (!baseUserMsg && sentAttachments.length === 0) {
      // Everything was dropped and there's no text — nothing to send.
      setError(
        `Cannot send: all attachments are unsupported by ${cfg.label} and no message was typed.`,
      );
      return;
    }
    const attachLabels: string[] = [
      ...sentAttachments.map((a) => `📎 ${a.name}`),
      ...dropped.map((d) => `⚠ dropped ${d.name}`),
    ];
    const attachLabel = attachLabels.length ? ` ${attachLabels.join(", ")}` : "";
    const userMessage: ChatMessage = {
      role: "user",
      content: baseUserMsg + attachLabel,
    };
    setHistory((h) => [...h, userMessage]);
    setBusy(true);
    setStreaming(null);
    setPendingProposal(null); // a new turn supersedes any prior proposal
    turnPatchRef.current = {}; // fresh same-turn write overlay
    const inputsBeforeTurn = inputs; // snapshot for one-click Undo of this turn's writes
    const ctrl = new AbortController();
    chatAbortRef.current = ctrl;
    try {
      // Auto-fallback: if the primary rate-limits (esp. Anthropic's 30k-tok/min
      // on a big spec sheet), retry once on Gemini when a Gemini key is saved —
      // free, 1M context, native PDF. Skipped if already on Gemini or no key.
      const geminiKey = storedKeyFor("gemini");
      const fallback =
        providerId !== "gemini" && isProviderKeyValid("gemini", geminiKey)
          ? {
              providerId: "gemini" as ProviderId,
              apiKey: geminiKey,
              model: PROVIDER_CONFIGS.gemini.defaultModel,
            }
          : undefined;
      let fellBackTo: ProviderId | null = null;
      const reply = await chatTurn({
        providerId,
        apiKey,
        model,
        history,
        userMessage: userMsg,
        // Live scenario snapshot so Sage always sees current state without
        // burning a get_scenario roundtrip — the fix for "generic / doesn't
        // know my scenario" answers. Same compact JSON the audit swarm uses.
        liveContext: buildAuditContext(),
        // Pass the full set; chatTurn re-filters per provider, so a PDF the
        // primary can't take still reaches a fallback (Gemini) that can.
        // sentAttachments above only drives the primary's UI drop-note + guards.
        attachments,
        toolHandler,
        signal: ctrl.signal,
        fallback,
        onFallback: (_from, to) => {
          fellBackTo = to;
          setStreaming(null); // drop any primary preamble before the retry
          setToolActivity(null);
        },
        onDelta: (delta) => setStreaming((s) => (s ?? "") + delta),
        // Each roundtrip starts a fresh live buffer — a tool-use turn's preamble
        // is cleared instead of accumulating ahead of the final answer. Clearing
        // toolActivity too means the indicator only shows while tools are the
        // latest thing happening.
        onRoundtripStart: () => {
          setStreaming(null);
          setToolActivity(null);
        },
        onToolCall: (name) => setToolActivity(name),
      });
      if (fellBackTo) {
        reply.content =
          `_${cfg.label} was rate-limited — answered with ${PROVIDER_CONFIGS[fellBackTo as ProviderId].label} instead._\n\n` +
          reply.content;
      }
      setHistory((h) => [...h, reply]);
      // Hybrid confirm: direct writes applied immediately — offer one-click Undo
      // back to the pre-turn scenario. (set_simulation_time only moves the sim
      // clock, not inputs, so it doesn't arm Undo.)
      const turnTrace = reply.toolTrace ?? [];
      if (turnTrace.some((t) => WRITE_TOOL_NAMES.has(t.name))) {
        setUndoSnapshot(inputsBeforeTurn);
        setUndoSummary(describeWrites(turnTrace));
      }
    } catch (err) {
      // User hit Stop (this turn's controller was aborted) — that's a
      // deliberate cancel, not an error. Providers already humanize
      // timeout/abort via describeAbort() at the dispatch boundary, so any
      // message that reaches here is already user-facing.
      if (!ctrl.signal.aborted) {
        const msg = (err as Error).message;
        setError(msg);
        setHistory((h) => [
          ...h,
          { role: "assistant", content: `_Error: ${msg}_` },
        ]);
      }
    } finally {
      chatAbortRef.current = null;
      setStreaming(null);
      setToolActivity(null);
      setBusy(false);
    }
  };
  // Keep the latest send() reachable from the (mount-once) open-agent listener.
  sendRef.current = send;

  // Compact snapshot of the operation handed to every audit specialist.
  const buildAuditContext = () =>
    JSON.stringify({
      location: {
        latitude: inputs.latitude,
        longitude: inputs.longitude,
        siteAddress: inputs.siteAddress,
        weatherStation: inputs.weatherStation,
      },
      greenhouse: {
        lengthFt: inputs.greenhouseLengthFt,
        widthFt: inputs.greenhouseWidthFt,
        eaveFt: inputs.eaveHeightFt,
        peakFt: inputs.peakHeightFt,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        glazingTransmissionPct: inputs.envelope.baseTransmissionPct,
        envelopeUValue: inputs.envelopeUValueBTUhrFtF,
        thermalScreen: inputs.thermalScreenEnabled,
        shade: inputs.shadeEnabled,
      },
      targets: {
        targetDLI: derived.target.targetDLI,
        photoperiodHours: inputs.flowerPhotoperiodHours,
        indoorTargetTempF: inputs.indoorTargetDryBulbF,
        nightTempF: inputs.targetNightTempF,
        targetRHPct: inputs.targetRHPct,
        co2Enabled: inputs.co2Enabled,
        co2Ppm: inputs.co2SetpointPpm,
        ventilationMode: inputs.ventilationMode,
        crop: inputs.cropTargetId,
        phase: inputs.cultivationPhase,
      },
      fixture: {
        label: derived.fixture.label,
        ppe: derived.fixture.ppe,
        source: derived.fixture.source,
        peakCount: derived.peakFixtureCount,
      },
      derived: {
        energyUseIntensity_kWhPerGram: derived.energyUseIntensity_kWhPerGram,
        peakBotrytis: derived.peakBotrytis,
        peakPM: derived.peakPM,
        peakNetHeatingLoad_BTUhr: derived.peakNetHeatingLoad,
        installedRadiantCapacity_BTUhr: inputs.radiantHeatingCapacityBTUhr,
        cropSteeringAlignmentPct: derived.cropSteering.alignmentScore,
        yieldFactors: derived.yieldProjection,
        evapFailMonths: derived.months.filter((m) => !m.evapReachesTarget).length,
        highHumidityMonths: derived.months.filter((m) => m.highHumidityRisk).length,
      },
      cyclesPerYear: inputs.cyclesPerYear,
    });

  const runAudit = async () => {
    if (auditing || busy) return;
    setOpen(true);
    if (cfg.requiresKey && !apiKey) {
      setError(`Configure a ${cfg.label} API key first to run the audit.`);
      return;
    }
    if (overBudget) {
      setError(budgetMsg);
      return;
    }
    setError(null);
    setHistory((h) => [
      ...h,
      { role: "user", content: "🔬 Run a full operational audit." },
    ]);
    setAuditing(true);
    setAuditDone([]);
    const ctrl = new AbortController();
    auditAbortRef.current = ctrl;
    try {
      const { report, findings, usage } = await runAuditSwarm({
        providerId,
        apiKey,
        model,
        contextJson: buildAuditContext(),
        onPassDone: (k) =>
          setAuditDone((d) => (d.includes(k) ? d : [...d, k])),
        signal: ctrl.signal,
      });
      setHistory((h) => [
        ...h,
        { role: "assistant", content: report, usage, findings: findings ?? undefined },
      ]);
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg);
      setHistory((h) => [
        ...h,
        {
          role: "assistant",
          content: `_Audit failed: ${msg}_`,
          // A stopped audit still billed its completed passes — keep the
          // usage on the row so the session meter reflects real spend.
          usage: e instanceof AuditStoppedError ? e.usage : undefined,
        },
      ]);
    } finally {
      auditAbortRef.current = null;
      setAuditing(false);
      setAuditDone([]);
    }
  };
  const runAuditRef = useRef<() => void>(() => {});
  runAuditRef.current = runAudit;

  // Apply a finding's one-click scenario patch. The patch is already
  // key-allowlisted + primitive-filtered in sageFindings; setInputs clamps
  // values. Snapshot first so the existing Undo bar reverses it, and let
  // WhatChangedBanner surface the diff — same explain-back path as chat writes.
  const applyFindingPatch = (
    patch: Partial<typeof inputs>,
    label: string,
  ) => {
    const changes: string[] = [];
    flattenChanges(patch as Record<string, unknown>, changes);
    setUndoSnapshot(inputs);
    setUndoSummary(
      label && label !== "Apply"
        ? label
        : changes.length
          ? `Set ${changes.slice(0, 3).join(", ")}`
          : "Applied Sage's suggestion",
    );
    setInputs(patch);
  };

  void customFixtures;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={(e) => onFilesPicked(e.target.files)}
      />
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-leaf-500/40 bg-white py-1.5 pl-1.5 pr-4 shadow-lg transition hover:shadow-xl"
          title={`Ask ${AGENT_NAME}, your cultivation agent`}
        >
          <span
            className={`rounded-full ${obs.active > 0 ? "agent-ring" : ""}`}
          >
            <AgentAvatar
              state={obs.topSeverity === "warn" ? "alert" : "idle"}
              size={36}
            />
          </span>
          <span className="text-sm font-semibold text-ink-900">
            Ask {AGENT_NAME}
          </span>
          {obs.active > 0 && (
            <span
              className={`ml-0.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-bold text-white ${
                obs.topSeverity === "warn" ? "bg-warn-500" : "bg-leaf-500"
              }`}
            >
              {obs.active}
            </span>
          )}
        </button>
      )}
      {open && (
        <>
          {dockDragging && (
            <div className="fixed inset-0 z-[55]" style={{ cursor: "grabbing" }} />
          )}
          <div
            className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-ink-300/40 bg-white shadow-2xl"
            style={{
              left: dockRect.x,
              top: dockRect.y,
              width: dockRect.w,
              height: dockRect.h,
            }}
          >
            {/* resize handles — invisible hit strips (edges) + corners */}
            <div onPointerDown={startDockDrag("n")} className="absolute inset-x-3 top-0 z-10 h-1.5 cursor-ns-resize" />
            <div onPointerDown={startDockDrag("s")} className="absolute inset-x-3 bottom-0 z-10 h-1.5 cursor-ns-resize" />
            <div onPointerDown={startDockDrag("w")} className="absolute inset-y-3 left-0 z-10 w-1.5 cursor-ew-resize" />
            <div onPointerDown={startDockDrag("e")} className="absolute inset-y-3 right-0 z-10 w-1.5 cursor-ew-resize" />
            <div onPointerDown={startDockDrag("nw")} className="absolute left-0 top-0 z-20 h-3 w-3 cursor-nwse-resize" />
            <div onPointerDown={startDockDrag("ne")} className="absolute right-0 top-0 z-20 h-3 w-3 cursor-nesw-resize" />
            <div onPointerDown={startDockDrag("sw")} className="absolute bottom-0 left-0 z-20 h-3 w-3 cursor-nesw-resize" />
            <div onPointerDown={startDockDrag("se")} className="absolute bottom-0 right-0 z-20 h-3 w-3 cursor-nwse-resize" />
            <div
              onPointerDown={startDockDrag("move")}
              className="flex cursor-move select-none items-center justify-between border-b border-ink-300/40 px-3 py-2"
            >
            <div className="flex items-center gap-2">
              <AgentAvatar state={busy || auditing ? "thinking" : "idle"} size={30} />
              <div>
              <div className="text-sm font-semibold">{AGENT_NAME} · cultivation agent</div>
              <div className="text-xs text-ink-500">
                {cfg.label} · {model}
                {apiKey ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setShowKeyConfig((s) => !s)}
                      className="font-mono text-leaf-600 hover:underline"
                      title="Click to replace or clear key"
                    >
                      key {maskedKey}
                    </button>
                  </>
                ) : cfg.requiresKey ? (
                  <>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => setShowKeyConfig(true)}
                      className="text-warn-500 hover:underline"
                    >
                      no key set
                    </button>
                  </>
                ) : null}
              </div>
              {sessionMeter.inputTokens + sessionMeter.outputTokens > 0 && (
                <div
                  className="text-xs text-ink-400"
                  title="Session total — estimated cost, see pricing.ts"
                >
                  session {fmtTokens(sessionMeter.inputTokens + sessionMeter.outputTokens)} tok
                  {" · "}
                  {sessionMeter.usd > 0
                    ? `~${formatCost({
                        usd: sessionMeter.usd,
                        isFree: false,
                        inputTokens: 0,
                        outputTokens: 0,
                      })}${sessionMeter.anyUnpriced ? "+" : ""} est`
                    : sessionMeter.anyUnpriced
                      ? "unpriced"
                      : "free"}
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-ink-400">
                <span title="Soft cap: blocks the NEXT send/audit once the session estimate reaches it. A request already running (e.g. a 6-call audit) still finishes, so the estimate can land just past the cap. Blank = off.">
                  cap $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={budgetUSD ?? ""}
                  placeholder="off"
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    setBudget(Number.isFinite(v) && v > 0 ? v : null);
                  }}
                  className={`w-12 rounded border px-1 py-0.5 text-xs ${overBudget ? "border-warn-500 text-warn-600" : "border-ink-300"}`}
                  title="Session spend cap in USD (blank = off)"
                />
                {overBudget && (
                  <span className="font-semibold text-warn-600">reached</span>
                )}
                {budgetUSD != null && !overBudget && sessionMeter.anyUnpriced && (
                  <span
                    className="text-warn-600"
                    title="This model isn't in the price table, so the dollar cap can't be enforced. The token counter still runs."
                  >
                    · unpriced model — cap can't enforce
                  </span>
                )}
              </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1">
              <select
                value={providerId}
                onChange={(e) => switchProvider(e.target.value as ProviderId)}
                className="rounded border border-ink-300 px-1 py-0.5 text-xs"
                aria-label="AI provider"
                title="Provider"
              >
                {PROVIDER_ORDER.map((id) => (
                  <option key={id} value={id}>
                    {PROVIDER_CONFIGS[id].label}
                  </option>
                ))}
              </select>
              <select
                value={model}
                onChange={(e) => saveModel(e.target.value)}
                className="rounded border border-ink-300 px-1 py-0.5 text-xs"
                aria-label="Model"
                title="Model"
              >
                {cfg.models.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-ink-300 px-2 text-xs hover:bg-ink-300/20"
              >
                ×
              </button>
            </div>
          </div>

          {((cfg.requiresKey && !apiKey) || showKeyConfig) && (
            <div className="border-b border-ink-300/40 bg-warn-500/5 p-3 text-xs text-ink-700">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm">🔑</span>
                <span className="font-semibold text-ink-900">
                  {apiKey
                    ? `Replace ${cfg.label} API key`
                    : `Bring your own ${cfg.label} API key`}
                </span>
              </div>
              {cfg.note && (
                <p className="mb-2 text-xs leading-snug text-ink-700">{cfg.note}</p>
              )}
              {cfg.requiresKey && (
                <p className="text-xs leading-snug text-ink-700">
                  The chatbot calls {cfg.label} directly from your browser using
                  a key you provide. The key is stored in this browser's{" "}
                  <span className="font-semibold">
                    {sessionOnly ? "sessionStorage (cleared when tab closes)" : "localStorage (persists across tabs/sessions)"}
                  </span>
                  {" "}— never committed, never sent to any host other than the
                  provider (enforced by the page's CSP).
                </p>
              )}
              {cfg.requiresKey && (
                <label className="mt-2 flex items-center gap-2 text-xs text-ink-700">
                  <input
                    type="checkbox"
                    checked={sessionOnly}
                    onChange={(e) => togglePersistence(e.target.checked)}
                  />
                  <span>
                    Session-only — don't keep the key past tab close
                    {sessionOnly ? " (active)" : ""}
                  </span>
                </label>
              )}
              {onPublicHost && cfg.requiresKey && (
                <div className="mt-2 rounded border border-warn-500/40 bg-warn-500/10 p-2 text-xs leading-snug text-warn-500">
                  <strong>You're on a public hostname ({window.location.hostname}).</strong>{" "}
                  Pasting a key here means it lives in this browser's
                  localStorage on a publicly-visible page. Use a strict
                  daily spend cap and a key dedicated to this dashboard.
                </div>
              )}
              {cfg.requiresKey && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (keyDraft.trim()) saveApiKey(keyDraft);
                  }}
                  className="mt-2 flex gap-1"
                >
                  <input
                    type="password"
                    placeholder={cfg.keyHint ?? "API key"}
                    value={keyDraft}
                    onChange={(e) => setKeyDraft(e.target.value)}
                    autoComplete="off"
                    autoFocus
                    spellCheck={false}
                    className="flex-1 rounded border border-ink-300 px-2 py-1 font-mono text-xs"
                  />
                  <button
                    type="submit"
                    disabled={!keyDraft.trim()}
                    className="rounded bg-leaf-500 px-2 py-1 text-xs font-semibold text-white hover:bg-leaf-600 disabled:opacity-50"
                  >
                    Save
                  </button>
                  {apiKey && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowKeyConfig(false);
                        setKeyDraft("");
                      }}
                      className="rounded border border-ink-300 px-2 py-1 text-xs hover:bg-ink-300/20"
                    >
                      Cancel
                    </button>
                  )}
                </form>
              )}
              {keyDraft.trim() && !isProviderKeyValid(providerId, keyDraft.trim()) && (
                <p className="mt-1 text-xs text-warn-500">
                  ⚠ That doesn't match the {cfg.label} key format
                  {cfg.keyHint ? ` (${cfg.keyHint})` : ""}.
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-ink-300/30 pt-2 text-xs text-ink-500">
                {cfg.keyUrl && (
                  <a
                    href={cfg.keyUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    Get a {cfg.label} key
                  </a>
                )}
                {cfg.keyUrl && <span className="text-ink-300">·</span>}
                <button
                  type="button"
                  onClick={clearAllData}
                  className="text-warn-500 underline hover:text-warn-600"
                >
                  Forget all keys & history
                </button>
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
            {history.length === 0 && (
              <div className="rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
                Ask anything about the model. I can change scenario inputs, swap fixtures, add new vendor fixtures, run side-by-side comparisons, ingest spec sheets, and reason about energy / amps / HVAC / climate dynamics.
                <div className="mt-2 space-y-1 text-xs text-ink-500">
                  <div>📎 <strong>Drop a greenhouse spec sheet (PDF/image)</strong> — I'll extract dimensions, glazing, U-value, heating capacity, electrical service, and update the model.</div>
                  <div>📎 <strong>Drop a fixture datasheet</strong> — I'll add it to the library with vendor specs.</div>
                  <div>· "What if I swap to the Gavita Pro RS 2400e? Compare to current."</div>
                  <div>· "Why are vents closed at 4pm but open at 2pm?"</div>
                  <div>· "Bump CO₂ to 1200 ppm and re-check yield projection."</div>
                </div>
                <div className="mt-2 rounded border border-leaf-500/30 bg-leaf-50/40 p-2 text-xs text-ink-700">
                  <strong>Hitting rate limits or no Anthropic key?</strong>{" "}
                  Switch the provider dropdown above to{" "}
                  <span className="font-mono">Google Gemini</span> — free
                  tier, 1M-token context, native PDF support. Or pick
                  Groq / OpenRouter for free text-only models.
                </div>
              </div>
            )}
            {history.map((m, i) => (
              <div
                key={i}
                className={`rounded p-2 text-sm ${
                  m.role === "user"
                    ? "ml-6 bg-leaf-500/10 text-ink-900"
                    : "mr-6 bg-ink-300/10 text-ink-900"
                }`}
              >
                <ChatErrorBoundary>
                  {m.findings && m.findings.length > 0 ? (
                    // Findings present: cards lead; the prose write-up is
                    // secondary (it restates the cards), so tuck it behind a
                    // disclosure instead of stacking a duplicate wall above.
                    <>
                      <AuditResultsView findings={m.findings} onApply={applyFindingPatch} />
                      {m.content && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer select-none text-ink-500 hover:text-ink-700">
                            Full write-up
                          </summary>
                          <div className="mt-1">
                            <MarkdownLite text={m.content} />
                          </div>
                        </details>
                      )}
                    </>
                  ) : (
                    m.content &&
                    (m.role === "assistant" ? (
                      <MarkdownLite text={m.content} />
                    ) : (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ))
                  )}
                  {m.toolTrace && m.toolTrace.length > 0 && (
                    <ToolTracePanel trace={m.toolTrace} />
                  )}
                </ChatErrorBoundary>
                {m.usage && (m.usage.inputTokens > 0 || m.usage.outputTokens > 0) && (
                  <div className="mt-1 text-xs text-ink-400" title="Estimated cost — see pricing.ts">
                    {fmtTokens(m.usage.inputTokens)} in · {fmtTokens(m.usage.outputTokens)} out
                    {(() => {
                      const c = formatCost(estimateCost(m.usage));
                      if (!c) return "";
                      if (c === "free") return " · free";
                      if (c === "—") return " · unpriced";
                      return ` · ~${c} est`;
                    })()}
                  </div>
                )}
              </div>
            ))}
            {streaming != null && streaming.length > 0 && (
              <div className="mr-6 rounded bg-ink-300/10 p-2 text-sm text-ink-900" aria-live="polite" aria-atomic="false">
                <div className="whitespace-pre-wrap">
                  {streaming}
                  <span className="ml-0.5 inline-block animate-pulse">▍</span>
                </div>
                <button
                  type="button"
                  onClick={stopChat}
                  className="mt-1 rounded border border-ink-300 px-2 py-0.5 text-xs font-medium text-ink-600 transition hover:border-warn-500/50 hover:bg-warn-500/10 hover:text-warn-600"
                  title="Stop this response"
                >
                  Stop
                </button>
              </div>
            )}
            {busy && (streaming == null || streaming.length === 0) && (
              <div className="mr-6 flex items-center justify-between gap-2 rounded bg-ink-300/10 p-2 text-sm text-ink-500">
                <span className="inline-block animate-pulse">
                  {toolActivity ? `⚙ ${toolActivity}…` : "Thinking…"}
                </span>
                <button
                  type="button"
                  onClick={stopChat}
                  className="rounded border border-ink-300 px-2 py-0.5 text-xs font-medium text-ink-600 transition hover:border-warn-500/50 hover:bg-warn-500/10 hover:text-warn-600"
                  title="Stop this response"
                >
                  Stop
                </button>
              </div>
            )}
            {error && (
              <div className="rounded bg-warn-500/10 p-2 text-xs text-warn-500">{error}</div>
            )}
          </div>

          {(pendingProposal || undoSnapshot) && (
            <div className="flex flex-wrap items-center gap-1 border-t border-ink-200 px-2 py-1 text-xs">
              {pendingProposal && (
                <>
                  <span className="min-w-0 flex-1 truncate text-ink-600" title={pendingProposal.label}>
                    💡 {pendingProposal.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      // Guard: the proposed fixture may have been removed since
                      // (custom fixtures are user-clearable).
                      const fid = pendingProposal.patch.fixtureId;
                      if (fid && !allFixtures[fid]) {
                        setError(`Proposed fixture ${fid} no longer exists.`);
                        setPendingProposal(null);
                        return;
                      }
                      setUndoSnapshot(inputs); // applying is also undoable
                      setUndoSummary(pendingProposal.label);
                      setInputs(pendingProposal.patch);
                      setPendingProposal(null);
                    }}
                    className="rounded border border-leaf-500/50 bg-leaf-50 px-2 py-0.5 font-medium text-leaf-700 hover:bg-leaf-500/20"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingProposal(null)}
                    className="rounded border border-ink-300 px-2 py-0.5 text-ink-500 hover:bg-ink-300/20"
                  >
                    Dismiss
                  </button>
                </>
              )}
              {undoSnapshot && !pendingProposal && (
                <>
                  <span
                    className="min-w-0 flex-1 truncate text-ink-600"
                    title={undoSummary ?? "Sage changed the scenario"}
                  >
                    ✓ {undoSummary ?? "Sage changed the scenario"}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setInputs(undoSnapshot);
                      setUndoSnapshot(null);
                      setUndoSummary(null);
                    }}
                    className="rounded border border-ink-300 px-2 py-0.5 font-medium text-ink-600 hover:bg-warn-500/10 hover:text-warn-600"
                    title="Restore all scenario inputs to before Sage's last change"
                  >
                    Undo
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUndoSnapshot(null);
                      setUndoSummary(null);
                    }}
                    className="rounded border border-ink-300 px-2 py-0.5 text-ink-500 hover:bg-ink-300/20"
                  >
                    Keep
                  </button>
                </>
              )}
            </div>
          )}
          <div
            className="border-t border-ink-200 p-2"
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onFilesPicked(e.dataTransfer.files);
            }}
          >
            {/* Sage swarm — full audit quick action + live progress. */}
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => runAudit()}
                disabled={auditing || busy}
                className="flex items-center gap-1.5 rounded-lg border border-leaf-500/40 bg-leaf-50 px-2.5 py-1 text-xs font-semibold text-leaf-700 transition hover:bg-leaf-500/15 disabled:opacity-60"
                title="Sage runs 5 specialists in parallel — climate, cooling, electrical, pathogen, economics — then synthesizes."
              >
                🔬 {auditing ? "Auditing…" : "Run full audit"}
              </button>
              {auditing && (
                <span className="flex flex-wrap items-center gap-1 text-xs text-ink-500">
                  {AUDIT_PASSES.map((p) => (
                    <span
                      key={p.key}
                      className={`rounded px-1.5 py-0.5 ${
                        auditDone.includes(p.key)
                          ? "bg-leaf-500/15 text-leaf-700"
                          : "bg-ink-100 text-ink-400"
                      }`}
                    >
                      {auditDone.includes(p.key) ? "✓" : "•"} {p.label}
                    </span>
                  ))}
                </span>
              )}
              {auditing && (
                <button
                  type="button"
                  onClick={stopAudit}
                  className="ml-auto rounded border border-ink-300 px-2 py-0.5 text-xs font-medium text-ink-600 transition hover:border-warn-500/50 hover:bg-warn-500/10 hover:text-warn-600"
                  title="Stop the audit"
                >
                  Stop
                </button>
              )}
            </div>
            {unsupportedAttachmentWarning && (
              <div className="mb-2 rounded border border-warn-500/40 bg-warn-500/10 p-2 text-xs text-warn-500">
                ⚠ {unsupportedAttachmentWarning}
              </div>
            )}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {attachments.map((a, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md border border-leaf-500/30 bg-leaf-50 px-2 py-0.5 text-xs text-leaf-700"
                  >
                    📎 {a.name.length > 28 ? a.name.slice(0, 26) + "…" : a.name}
                    <button
                      type="button"
                      onClick={() => removeAttachment(i)}
                      className="text-warn-500 hover:underline"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="btn px-2"
                aria-label="Attach a greenhouse or fixture spec sheet (PDF or image)"
                title="Attach a greenhouse or fixture spec sheet (PDF or image)"
              >
                📎
              </button>
              <input
                type="text"
                aria-label="Message Sage"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                placeholder={
                  attachments.length > 0
                    ? "Add a note (optional) and Send to ingest spec sheet..."
                    : "Ask, attach a spec sheet, or drop a PDF here..."
                }
                className="flex-1 rounded border border-ink-300 px-2 py-1 text-sm focus:border-leaf-500 focus:outline-none"
                disabled={busy}
              />
              <button
                type="button"
                onClick={() => send()}
                disabled={busy || overBudget || (!draft.trim() && attachments.length === 0)}
                title={overBudget ? budgetMsg : undefined}
                className="btn-primary"
              >
                Send
              </button>
            </div>
          </div>
        </div>
        </>
      )}
    </>
  );
}
