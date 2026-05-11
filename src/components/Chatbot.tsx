import { useEffect, useRef, useState } from "react";
import {
  chatTurn,
  isAnthropicKeyFormat,
  type ChatMessage,
  type FileAttachment,
} from "../services/chatbotService";
import { useScenario } from "../context/ScenarioContext";
import { useDerived } from "../context/useDerived";
import { useSimulation } from "../context/SimulationContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { useLiveDynamics } from "../context/useLiveDynamics";
import { fixtureKWFromPPFD, type FixtureSpec } from "../models/fixtureModel";
import { DAYS_IN_MONTH } from "../utils/formatting";

const STORAGE_KEY = "greenhouse-model:anthropicApiKey";
const SESSION_KEY = "greenhouse-model:anthropicApiKey";
const SESSION_PREF_KEY = "greenhouse-model:keyPersistencePref";
const MODEL_KEY = "greenhouse-model:chatbotModel";
const HISTORY_KEY = "greenhouse-model:chatHistory";

/**
 * Read the Anthropic key from sessionStorage first (paranoid tab-scoped
 * preference) then localStorage (default persistent). sessionStorage is
 * cleared when the tab closes — useful for shared machines or screen-shares.
 */
function readStoredKey(): string {
  return (
    sessionStorage.getItem(SESSION_KEY) ?? localStorage.getItem(STORAGE_KEY) ?? ""
  );
}

/**
 * Are we running on a public hostname (Vercel, custom domain) or on a local
 * dev server? When public, the key-entry panel adds an extra hardened
 * warning — entering a paid Anthropic key on a publicly-visible URL is
 * higher-risk than on localhost (closer to "real" attackers).
 */
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

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // Chunk to avoid stack overflow for large files
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)));
  }
  return btoa(binary);
}

const MODEL_OPTIONS = [
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced — recommended)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 (deep reasoning, slower)" },
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (fast, lighter)" },
];

export default function Chatbot() {
  const { inputs, setInputs, customFixtures, addCustomFixture } = useScenario();
  const derived = useDerived();
  const sim = useSimulation();
  const allFixtures = useAllFixtures();
  const live = useLiveDynamics();

  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState<string>(() => readStoredKey());
  const [sessionOnly, setSessionOnly] = useState<boolean>(
    () => localStorage.getItem(SESSION_PREF_KEY) === "session",
  );
  const [keyDraft, setKeyDraft] = useState("");
  const [showKeyConfig, setShowKeyConfig] = useState(false);
  const [model, setModel] = useState<string>(
    () => localStorage.getItem(MODEL_KEY) ?? "claude-sonnet-4-6",
  );
  const [draft, setDraft] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<FileAttachment[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (trimmed && !isAnthropicKeyFormat(trimmed)) {
      setError(
        "That doesn't look like an Anthropic key. Anthropic keys start with sk-ant- and are typically 90+ characters. Get one at console.anthropic.com/settings/keys.",
      );
      return;
    }
    setApiKey(trimmed);
    // Honor the user's persistence preference. sessionOnly = clear
    // localStorage and write to sessionStorage instead, so the key is
    // gone when the tab closes.
    if (trimmed) {
      if (sessionOnly) {
        sessionStorage.setItem(SESSION_KEY, trimmed);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, trimmed);
        sessionStorage.removeItem(SESSION_KEY);
      }
    } else {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_KEY);
    }
    setKeyDraft("");
    setShowKeyConfig(false);
    setError(null);
  };
  const togglePersistence = (toSession: boolean) => {
    setSessionOnly(toSession);
    localStorage.setItem(SESSION_PREF_KEY, toSession ? "session" : "local");
    // If a key is already saved, migrate it to the chosen storage.
    if (apiKey) {
      if (toSession) {
        sessionStorage.setItem(SESSION_KEY, apiKey);
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, apiKey);
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  };
  const clearAllData = () => {
    if (
      !window.confirm(
        "Forget API key, chat history, and model preference? Cannot be undone.",
      )
    ) {
      return;
    }
    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(MODEL_KEY);
    localStorage.removeItem(HISTORY_KEY);
    localStorage.removeItem(SESSION_PREF_KEY);
    setApiKey("");
    setHistory([]);
    setError(null);
    setShowKeyConfig(false);
    setKeyDraft("");
  };
  const maskedKey = apiKey
    ? `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`
    : "";
  const onPublicHost = isPublicHostname();
  const saveModel = (m: string) => {
    setModel(m);
    localStorage.setItem(MODEL_KEY, m);
  };

  const toolHandler = async (name: string, input: Record<string, unknown>) => {
    switch (name) {
      case "get_scenario":
        return inputs;
      case "get_derived_outputs": {
        return {
          peakInstalledKW: derived.peakInstalledKW,
          peakFixtureCount: derived.peakFixtureCount,
          peakWattsPerSqFt: derived.peakWattsPerSqFt,
          peakCoveragePerFixtureSqFt: derived.peakCoveragePerFixtureSqFt,
          peakSquareGridSpacingFt: derived.peakSquareGridSpacingFt,
          annualKwh: derived.annualKwh,
          annualCost: derived.annualCost,
          peakCoolingTons: derived.peakCoolingTons,
          peakNetHeatingLoad: derived.peakNetHeatingLoad,
          annualHeatingFuelMMBtu: derived.annualHeatingFuelMMBtu,
          activeFixture: derived.fixture,
          target: derived.target,
          months: derived.months.map((m) => ({
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
          yieldProjection: derived.yieldProjection,
          cropSteering: derived.cropSteering,
          energyUseIntensity_kWhPerGram: derived.energyUseIntensity_kWhPerGram,
        };
      }
      case "set_scenario": {
        // Deep-merge nested objects so the chatbot can patch a single
        // envelope field (e.g. baseTransmissionPct) without wiping the
        // others. Without this guard, `set_scenario({patches: {envelope:
        // {baseTransmissionPct: 0.65}}})` would replace the entire
        // envelope object with that one field — Codex P0 from the
        // pre-launch review.
        const rawPatches = (input.patches ?? {}) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...rawPatches };
        const envelopePatch = rawPatches.envelope;
        if (
          envelopePatch &&
          typeof envelopePatch === "object" &&
          !Array.isArray(envelopePatch)
        ) {
          merged.envelope = {
            ...(inputs.envelope as unknown as Record<string, unknown>),
            ...(envelopePatch as Record<string, unknown>),
          };
        }
        setInputs(merged as Partial<typeof inputs>);
        return { applied: merged };
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
        return { activeFixture: id };
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
        addCustomFixture(fixture);
        setInputs({ fixtureId: id });
        return { added: id };
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
          // Demand cost folded into the total — Codex P1: ranking on
          // energy alone is wrong since higher-PPE fixtures cut peak kW
          // and therefore demand charge as well as kWh.
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
            /** Total = energy + demand. This is the rank-key. */
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

  const send = async () => {
    const hasInput = draft.trim() || attachments.length > 0;
    if (!hasInput || busy) return;
    const userMsg = draft.trim() || (attachments.length > 0 ? "Please analyze the attached spec sheet and update the model accordingly." : "");
    const sentAttachments = attachments;
    setDraft("");
    setAttachments([]);
    setError(null);
    if (!apiKey) {
      setError("Configure an Anthropic API key first.");
      return;
    }
    const attachLabel =
      sentAttachments.length > 0
        ? ` 📎 ${sentAttachments.map((a) => a.name).join(", ")}`
        : "";
    const userMessage: ChatMessage = {
      role: "user",
      content: userMsg + attachLabel,
    };
    setHistory((h) => [...h, userMessage]);
    setBusy(true);
    try {
      const reply = await chatTurn({
        apiKey,
        model,
        history,
        userMessage: userMsg,
        attachments: sentAttachments,
        toolHandler,
      });
      setHistory((h) => [...h, reply]);
    } catch (err) {
      const msg = (err as Error).message;
      setError(msg);
      setHistory((h) => [
        ...h,
        { role: "assistant", content: `_Error: ${msg}_` },
      ]);
    } finally {
      setBusy(false);
    }
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
          className="fixed bottom-4 right-4 z-50 rounded-full bg-leaf-500 px-4 py-3 font-semibold text-white shadow-lg hover:bg-leaf-600"
        >
          ✦ Ask the model
        </button>
      )}
      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex h-[640px] w-[440px] flex-col rounded-xl border border-ink-300/40 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink-300/40 px-3 py-2">
            <div>
              <div className="text-sm font-semibold">Greenhouse model assistant</div>
              <div className="text-[10px] text-ink-500">
                {model}
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
                ) : null}
              </div>
            </div>
            <div className="flex gap-1">
              <select
                value={model}
                onChange={(e) => saveModel(e.target.value)}
                className="rounded border border-ink-300 px-1 py-0.5 text-[10px]"
              >
                {MODEL_OPTIONS.map((o) => (
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

          {(!apiKey || showKeyConfig) && (
            <div className="border-b border-ink-300/40 bg-warn-500/5 p-3 text-xs text-ink-700">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm">🔑</span>
                <span className="font-semibold text-ink-900">
                  {apiKey ? "Replace Anthropic API key" : "Bring your own Anthropic API key"}
                </span>
              </div>
              <p className="text-[11px] leading-snug text-ink-700">
                The chatbot calls Anthropic directly from your browser using
                a key you provide. The key is stored in this browser's{" "}
                <span className="font-semibold">
                  {sessionOnly ? "sessionStorage (cleared when tab closes)" : "localStorage (persists across tabs/sessions)"}
                </span>
                {" "}— never committed, never sent anywhere except
                api.anthropic.com (enforced by the page's CSP).
              </p>
              <label className="mt-2 flex items-center gap-2 text-[11px] text-ink-700">
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
              <ul className="mt-2 space-y-0.5 text-[10.5px] leading-snug text-ink-700">
                <li>
                  <span className="font-semibold text-leaf-700">Recommended:</span>{" "}
                  create a <em>dedicated</em> key for this dashboard with a
                  small daily spend cap (e.g. $5/day) at{" "}
                  <a
                    href="https://console.anthropic.com/settings/limits"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                  >
                    console.anthropic.com/settings/limits
                  </a>
                  . Don't paste a production key.
                </li>
                <li>
                  <span className="font-semibold text-warn-500">Heads-up:</span>{" "}
                  browser extensions with localStorage permission can read
                  this key. Close other tabs/extensions you don't trust
                  before pasting. Hide this widget on screen-shares.
                </li>
                <li>
                  <span className="font-semibold text-warn-500">If you fork this repo:</span>{" "}
                  the key never enters source code, but make sure you don't
                  commit your browser's localStorage backup. Use a fresh
                  key per machine.
                </li>
              </ul>
              {onPublicHost && (
                <div className="mt-2 rounded border border-warn-500/40 bg-warn-500/10 p-2 text-[10.5px] leading-snug text-warn-500">
                  <strong>You're on a public hostname ({window.location.hostname}).</strong>{" "}
                  Pasting a key here means it lives in this browser's
                  localStorage on a publicly-visible page. Use a strict
                  daily spend cap and a key dedicated to this dashboard.
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (keyDraft.trim()) saveApiKey(keyDraft);
                }}
                className="mt-2 flex gap-1"
              >
                <input
                  type="password"
                  placeholder="sk-ant-..."
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
              {keyDraft.trim() && !isAnthropicKeyFormat(keyDraft.trim()) && (
                <p className="mt-1 text-[10.5px] text-warn-500">
                  ⚠ That doesn't match the Anthropic key format
                  (sk-ant-...). Double-check before saving.
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-ink-300/30 pt-2 text-[10px] text-ink-500">
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Get a key
                </a>
                <span className="text-ink-300">·</span>
                <a
                  href="https://docs.anthropic.com/en/api/client-sdks#browser-direct-access"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Why browser-direct?
                </a>
                {(apiKey || localStorage.getItem(HISTORY_KEY)) && (
                  <>
                    <span className="text-ink-300">·</span>
                    <button
                      type="button"
                      onClick={clearAllData}
                      className="text-warn-500 underline hover:text-warn-600"
                    >
                      Forget everything
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-2">
            {history.length === 0 && (
              <div className="rounded-lg bg-ink-50 p-3 text-xs text-ink-700">
                Ask anything about the model. I can change scenario inputs, swap fixtures, add new vendor fixtures, run side-by-side comparisons, ingest spec sheets, and reason about energy / amps / HVAC / climate dynamics.
                <div className="mt-2 space-y-1 text-[11px] text-ink-500">
                  <div>📎 <strong>Drop a greenhouse spec sheet (PDF/image)</strong> — I'll extract dimensions, glazing, U-value, heating capacity, electrical service, and update the model.</div>
                  <div>📎 <strong>Drop a fixture datasheet</strong> — I'll add it to the library with vendor specs.</div>
                  <div>· "What if I swap to the Gavita Pro RS 2400e? Compare to current."</div>
                  <div>· "Why are vents closed at 4pm but open at 2pm?"</div>
                  <div>· "Bump CO₂ to 1200 ppm and re-check yield projection."</div>
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
                <div className="whitespace-pre-wrap">{m.content}</div>
                {m.toolTrace && m.toolTrace.length > 0 && (
                  <details className="mt-1 text-[10px] text-ink-500">
                    <summary className="cursor-pointer">
                      Tool calls ({m.toolTrace.length})
                    </summary>
                    {m.toolTrace.map((t, j) => (
                      <div key={j} className="ml-2 my-1 font-mono">
                        <span className="text-leaf-600">{t.name}</span>(
                        {JSON.stringify(t.input).slice(0, 80)}
                        {JSON.stringify(t.input).length > 80 ? "…" : ""})
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))}
            {busy && (
              <div className="mr-6 rounded bg-ink-300/10 p-2 text-sm text-ink-500">
                <span className="inline-block animate-pulse">Thinking…</span>
              </div>
            )}
            {error && (
              <div className="rounded bg-warn-500/10 p-2 text-xs text-warn-500">{error}</div>
            )}
          </div>

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
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {attachments.map((a, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 rounded-md border border-leaf-500/30 bg-leaf-50 px-2 py-0.5 text-[10px] text-leaf-700"
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
                title="Attach a greenhouse or fixture spec sheet (PDF or image)"
              >
                📎
              </button>
              <input
                type="text"
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
                onClick={send}
                disabled={busy || (!draft.trim() && attachments.length === 0)}
                className="btn-primary"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
