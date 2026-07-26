import type { InsightSeverity } from "../models/proactiveInsights";
import type { ScenarioInputs } from "../context/ScenarioContext";

/**
 * Structured Sage findings — the "content from model, form from code" layer.
 *
 * The audit swarm used to return one markdown string that rendered as literal
 * pre-wrapped text (## and ** shown raw). Instead the synthesis now also emits
 * a JSON findings array; the client renders it as cards with severity,
 * confidence, a drill-to-tab link, and an optional one-click apply. If the
 * model emits no/!valid JSON, `extractFindings` returns `findings: null` and
 * the caller falls back to the prose report — the feature never regresses.
 */

/** The 13 dashboard tab ids a finding can deep-link to (kept in sync with
 *  DashboardLayout's TABS — decoupled here so this service imports no
 *  component). A finding's `tab` is validated against this set. */
export const FINDING_TABS = [
  "build", "optimized", "science", "live", "dli", "supplemental",
  "ledHps", "underCanopy", "co2", "shade", "humidity", "hvac", "calendar",
] as const;
export type FindingTab = (typeof FINDING_TABS)[number];

export type FindingConfidence = "high" | "medium" | "low";

export interface SageFinding {
  id: string;
  title: string;
  /** One-line collapsed summary. */
  summary: string;
  /** Expanded detail (progressive disclosure). */
  detail?: string;
  severity: InsightSeverity;
  confidence?: FindingConfidence;
  /** The metric/rule this finding is grounded in (citation-ish). */
  metric?: string;
  /** Tab to deep-link to via the greenhouse-model:select-tab event. */
  tab?: FindingTab;
  /** Sanitized scenario patch for a one-click Apply. Only allowlisted keys. */
  patch?: Partial<ScenarioInputs>;
  /** Human label for the Apply button, e.g. "Enable thermal screen". */
  patchLabel?: string;
}

/**
 * Scenario keys a finding-authored patch is allowed to set. A finding's patch
 * comes from the LLM, so this is a system-level blast-radius cap (not a prompt
 * instruction, which could be injected). Nested objects (envelope, benchLayout)
 * are intentionally excluded — those need deep-merge and are only written via
 * Sage's full set_scenario tool, not a convenience Apply chip.
 */
export const FINDING_PATCH_ALLOWLIST: ReadonlySet<keyof ScenarioInputs> =
  new Set<keyof ScenarioInputs>([
    "customTargetDLIOverride", "flowerPhotoperiodHours", "cropTargetId",
    "fixtureId",
    "co2Enabled", "co2SetpointPpm", "co2ControlMode", "ventilationMode",
    "shadeEnabled",
    "radiantHeatingEnabled", "radiantHeatingCapacityBTUhr",
    "thermalScreenEnabled", "targetNightTempF", "targetDayTempF",
    "evapCoolingEnabled", "evapEfficiencyPct",
    "plantsPerSqFt", "cyclesPerYear",
    "canopyAreaSqFt", "greenhouseLengthFt", "greenhouseWidthFt",
    "eaveHeightFt", "peakHeightFt",
  ]);

/** Keep only allowlisted keys whose value is a primitive. Returns undefined if
 *  nothing survives, so callers can treat "no patch" uniformly. */
export function sanitizeFindingPatch(
  raw: unknown,
): Partial<ScenarioInputs> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!FINDING_PATCH_ALLOWLIST.has(k as keyof ScenarioInputs)) continue;
    if (v === null) continue;
    const t = typeof v;
    if (t === "number" || t === "string" || t === "boolean") out[k] = v;
  }
  return Object.keys(out).length ? (out as Partial<ScenarioInputs>) : undefined;
}

const SEVERITIES: InsightSeverity[] = ["warn", "savings", "info", "celebrate"];
const CONFIDENCES: FindingConfidence[] = ["high", "medium", "low"];

/** Fallback tab inference from a finding's text, so a model omission still
 *  yields a useful drill target. First keyword hit wins. */
const TAB_KEYWORDS: [FindingTab, RegExp][] = [
  ["hvac", /\b(hvac|cooling ton|dehumidif|chiller|heat pump|latent)\b/i],
  ["humidity", /\b(wet[- ]?bulb|humidity|vpd|dew ?point|rh\b)/i],
  ["supplemental", /\b(supplemental|fixture|ppfd gap|installed kw|photoperiod)\b/i],
  ["ledHps", /\b(led|hps|efficacy|ppe|µmol\/j|umol\/j)\b/i],
  ["co2", /\b(co2|co₂|enrichment|ppm)\b/i],
  ["shade", /\b(shade|shading|curtain)\b/i],
  ["dli", /\b(dli|daily light integral|mol\/m)\b/i],
  ["underCanopy", /\b(under[- ]?canopy|lower canopy)\b/i],
  ["science", /\b(yield|botrytis|powdery|pathogen|crop steer)\b/i],
  ["build", /\b(bom|build sheet|amperage|branch circuit|demand charge|electrical)\b/i],
  ["calendar", /\b(season|month-by-month|monthly strategy)\b/i],
];

function inferTab(f: { title?: string; summary?: string; detail?: string; metric?: string }): FindingTab | undefined {
  const hay = `${f.title ?? ""} ${f.summary ?? ""} ${f.detail ?? ""} ${f.metric ?? ""}`;
  for (const [tab, re] of TAB_KEYWORDS) if (re.test(hay)) return tab;
  return undefined;
}

function coerceFinding(raw: unknown, i: number): SageFinding | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r.title === "string" ? r.title.trim() : "";
  const summary =
    typeof r.summary === "string" && r.summary.trim()
      ? r.summary.trim()
      : title;
  if (!title && !summary) return null;
  const severity = SEVERITIES.includes(r.severity as InsightSeverity)
    ? (r.severity as InsightSeverity)
    : "info";
  const confidence = CONFIDENCES.includes(r.confidence as FindingConfidence)
    ? (r.confidence as FindingConfidence)
    : undefined;
  const tabRaw = typeof r.tab === "string" ? (r.tab as FindingTab) : undefined;
  const tab =
    tabRaw && (FINDING_TABS as readonly string[]).includes(tabRaw)
      ? tabRaw
      : inferTab({
          title,
          summary,
          detail: typeof r.detail === "string" ? r.detail : undefined,
          metric: typeof r.metric === "string" ? r.metric : undefined,
        });
  const patch = sanitizeFindingPatch(r.patch);
  return {
    id: typeof r.id === "string" && r.id ? r.id : `finding-${i}`,
    title: title || summary,
    summary,
    detail: typeof r.detail === "string" && r.detail.trim() ? r.detail.trim() : undefined,
    severity,
    confidence,
    metric: typeof r.metric === "string" && r.metric.trim() ? r.metric.trim() : undefined,
    tab,
    patch,
    patchLabel:
      patch && typeof r.patchLabel === "string" && r.patchLabel.trim()
        ? r.patchLabel.trim()
        : patch
          ? "Apply"
          : undefined,
  };
}

/** Pull the first ```json fenced block, else the last balanced {...} that
 *  parses. Returns the parsed value + the span to strip from the report. */
function extractJsonBlock(raw: string): { value: unknown; start: number; end: number } | null {
  const fence = /```json\s*([\s\S]*?)```/i.exec(raw);
  if (fence) {
    try {
      return { value: JSON.parse(fence[1].trim()), start: fence.index, end: fence.index + fence[0].length };
    } catch {
      /* fall through to brace scan */
    }
  }
  // Scan for the last top-level {...} containing "findings".
  const idx = raw.lastIndexOf('"findings"');
  if (idx === -1) return null;
  let start = raw.lastIndexOf("{", idx);
  while (start !== -1) {
    let depth = 0;
    for (let i = start; i < raw.length; i++) {
      if (raw[i] === "{") depth++;
      else if (raw[i] === "}") {
        depth--;
        if (depth === 0) {
          try {
            return { value: JSON.parse(raw.slice(start, i + 1)), start, end: i + 1 };
          } catch {
            break;
          }
        }
      }
    }
    start = raw.lastIndexOf("{", start - 1);
  }
  return null;
}

export interface ExtractedFindings {
  /** Parsed findings, or null if none were present/valid. */
  findings: SageFinding[] | null;
  /** The report with the JSON block removed, so users never see raw JSON. */
  cleanedReport: string;
}

/**
 * Extract structured findings from a swarm synthesis reply. Never throws:
 * on any parse failure returns `{ findings: null, cleanedReport: raw }` so the
 * caller shows the prose report exactly as before.
 */
export function extractFindings(raw: string): ExtractedFindings {
  const block = extractJsonBlock(raw);
  if (!block) return { findings: null, cleanedReport: raw };
  const arr = (block.value as { findings?: unknown })?.findings;
  if (!Array.isArray(arr)) return { findings: null, cleanedReport: raw };
  const findings = arr
    .map((f, i) => coerceFinding(f, i))
    .filter((f): f is SageFinding => f !== null);
  const cleanedReport = (raw.slice(0, block.start) + raw.slice(block.end)).trim();
  return { findings: findings.length ? findings : null, cleanedReport };
}
