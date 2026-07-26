import { chatTurn, type ProviderId } from "./chatbotService";
import type { ChatUsage } from "./providers/types";
import { extractFindings, type SageFinding } from "./sageFindings";

/**
 * Thrown when the user stops an audit mid-run. Carries the usage already
 * accumulated from completed passes — the user was billed for those calls, so
 * the cost meter must still see them even though no report was produced.
 */
export class AuditStoppedError extends Error {
  usage: ChatUsage;
  constructor(usage: ChatUsage) {
    super("Audit stopped.");
    this.name = "AuditStoppedError";
    this.usage = usage;
  }
}

/**
 * Sage's "swarm" — a full operational audit run as parallel focused analysis
 * passes, then synthesized. Each pass is an independent LLM call scoped to one
 * dimension, given the full scenario inline (no tools — analyze from data) so
 * the passes run concurrently. A final synthesis pass ranks the findings.
 *
 * This is the "deploy its own swarm to review/audit" behavior: 5 specialists
 * working in parallel + 1 editor, instead of one generalist pass.
 */

export interface AuditPass {
  key: string;
  label: string;
  focus: string;
}

export const AUDIT_PASSES: AuditPass[] = [
  {
    key: "climate",
    label: "Climate envelope",
    focus:
      "Audit whether the operation can hold the optimum temp/RH/VPD band year-round. Where does it fall out (which months, day vs night)? Quantify the VPD swing vs the ±0.1 kPa elite operators hold.",
  },
  {
    key: "cooling",
    label: "Cooling & dehumidification",
    focus:
      "Audit cooling adequacy vs light intensity — the core tradeoff. Does evap cooling fail any months? Is dehumidification sized for the latent load? What's the cheapest path to close the gap (shade-and-coast vs heat pump vs chiller) and rough $?",
  },
  {
    key: "electrical",
    label: "Electrical & energy cost",
    focus:
      "Audit energy use intensity (kWh/g) vs the 0.5–1.5 benchmark, fixture PPE vs top-tier 3.0+, demand charges, and circuit/voltage feasibility. Where is electricity being wasted and what's the annual $ at stake?",
  },
  {
    key: "pathogen",
    label: "Pathogen & pest pressure",
    focus:
      "Audit botrytis and powdery-mildew pressure given the planned canopy climate. Which growth stage is most exposed? What climate/IPM change cuts the risk most cheaply? Note regional (NE-US) seasonal pressure.",
  },
  {
    key: "economics",
    label: "Yield & economics",
    focus:
      "Audit yield potential vs the DLI/CO₂/temp limiters and the realistic $/gram. Where is yield left on the table, and which single change has the best ROI? Be explicit it's screening-level.",
  },
];

interface SwarmInput {
  providerId: ProviderId;
  apiKey: string;
  model: string;
  /** Compact JSON of scenario + derived outputs, embedded in every pass. */
  contextJson: string;
  /** Called as each pass completes, for progress UI. */
  onPassDone?: (key: string) => void;
  /** Caller cancel signal; each pass also has a per-request timeout. */
  signal?: AbortSignal;
}

const NOOP_TOOL = async () =>
  "Tools are disabled in audit mode — analyze only from the JSON provided.";

function passPrompt(pass: AuditPass, contextJson: string): string {
  return [
    `FOCUSED AUDIT — ${pass.label.toUpperCase()} ONLY.`,
    `You are one of five specialists auditing this greenhouse in parallel. Stay strictly in your lane.`,
    `Do NOT call any tools — all data you need is in the JSON below.`,
    ``,
    `SCENARIO + DERIVED OUTPUTS:`,
    contextJson,
    ``,
    `YOUR TASK: ${pass.focus}`,
    ``,
    `Return 2–4 tight bullets. Each: the finding, how it compares to elite operations (a number), and the costed fix. No preamble.`,
  ].join("\n");
}

/** Run one focused pass. Returns its markdown bullets (or an error note). */
async function runPass(
  pass: AuditPass,
  input: SwarmInput,
): Promise<{ pass: AuditPass; text: string; usage?: ChatUsage }> {
  try {
    const reply = await chatTurn({
      providerId: input.providerId,
      apiKey: input.apiKey,
      model: input.model,
      history: [],
      userMessage: passPrompt(pass, input.contextJson),
      toolHandler: NOOP_TOOL,
      tools: [], // audit analyzes from inline JSON — no tool schema needed
      maxRoundtrips: 1,
      signal: input.signal,
    });
    input.onPassDone?.(pass.key);
    return { pass, text: reply.content.trim(), usage: reply.usage };
  } catch (e) {
    input.onPassDone?.(pass.key);
    return { pass, text: `_(${pass.label} pass failed: ${(e as Error).message})_` };
  }
}

/**
 * Fire all passes in parallel, then synthesize. Returns a prose report plus
 * structured findings (null if the model emitted none/invalid — the caller
 * falls back to the report text so the feature never regresses).
 */
export async function runAuditSwarm(
  input: SwarmInput,
): Promise<{ report: string; findings: SageFinding[] | null; usage: ChatUsage }> {
  const results = await Promise.all(AUDIT_PASSES.map((p) => runPass(p, input)));

  // Accumulate token usage across all 6 calls (5 specialists + synthesis) so the
  // cost meter reflects the audit's real spend, not just chat turns.
  let inputTokens = 0;
  let outputTokens = 0;
  for (const r of results) {
    if (r.usage) {
      inputTokens += r.usage.inputTokens;
      outputTokens += r.usage.outputTokens;
    }
  }
  const usageOf = (): ChatUsage => ({
    inputTokens,
    outputTokens,
    model: input.model,
    provider: input.providerId,
  });

  // User stopped mid-run — don't spend another call synthesizing aborted passes.
  if (input.signal?.aborted) {
    throw new AuditStoppedError(usageOf());
  }

  const specialistFindings = results
    .map((r) => `### ${r.pass.label}\n${r.text}`)
    .join("\n\n");

  const synthesisPrompt = [
    `You are Sage. You just ran a 5-specialist parallel audit of this greenhouse. Synthesize it into a crisp executive report:`,
    ``,
    `1. **Top 3 priorities** — ranked by dollar impact, each one line with the action + rough $ or % and the lever.`,
    `2. **By dimension** — keep the strongest 1–2 bullets from each specialist below; cut redundancy.`,
    `Lead with the priorities. Markdown. Talk like the working expert you are.`,
    ``,
    `SPECIALIST FINDINGS:`,
    specialistFindings,
    ``,
    `---`,
    `AFTER the prose report, append a machine-readable findings block the UI renders as cards. Emit EXACTLY one fenced json code block, nothing after it:`,
    "```json",
    `{"findings":[{"title":"...","summary":"one line","detail":"why + the costed fix","severity":"warn|savings|info|celebrate","confidence":"high|medium|low","metric":"the benchmark/rule it's grounded in","tab":"build|optimized|science|live|dli|supplemental|ledHps|underCanopy|co2|shade|humidity|hvac|calendar"}]}`,
    "```",
    `Rules for the json: 3–6 findings, most important first. severity: warn=risk, savings=money on the table, info=note, celebrate=already dialed in. Pick the single most relevant tab per finding. Optionally include "patch" (a flat object of scenario fields to set, e.g. {"thermalScreenEnabled":true}) and "patchLabel" ONLY when there's a concrete one-click change; omit otherwise. No fabricated numbers — ground every "metric" in the specialist findings above.`,
  ].join("\n");

  try {
    const synth = await chatTurn({
      providerId: input.providerId,
      apiKey: input.apiKey,
      model: input.model,
      history: [],
      userMessage: synthesisPrompt,
      toolHandler: NOOP_TOOL,
      tools: [], // synthesis writes prose from the findings — no tool schema needed
      maxRoundtrips: 1,
      signal: input.signal,
    });
    if (synth.usage) {
      inputTokens += synth.usage.inputTokens;
      outputTokens += synth.usage.outputTokens;
    }
    // Split the prose report from the appended JSON findings block. On any
    // parse miss, extractFindings returns findings:null + the untouched report.
    const { findings, cleanedReport } = extractFindings(synth.content.trim());
    return { report: cleanedReport, findings, usage: usageOf() };
  } catch (e) {
    // The user stopped mid-synthesis — honor it. Returning the findings
    // anyway would make Stop produce an audit result.
    if (input.signal?.aborted) {
      throw new AuditStoppedError(usageOf());
    }
    // Synthesis failed on its own — still return the raw specialist findings
    // so the grower gets value.
    return {
      report: `**Full audit** (synthesis unavailable: ${(e as Error).message})\n\n${specialistFindings}`,
      findings: null,
      usage: usageOf(),
    };
  }
}
