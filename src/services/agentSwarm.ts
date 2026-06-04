import { chatTurn, type ProviderId } from "./chatbotService";

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
): Promise<{ pass: AuditPass; text: string }> {
  try {
    const reply = await chatTurn({
      providerId: input.providerId,
      apiKey: input.apiKey,
      model: input.model,
      history: [],
      userMessage: passPrompt(pass, input.contextJson),
      toolHandler: NOOP_TOOL,
      maxRoundtrips: 1,
    });
    input.onPassDone?.(pass.key);
    return { pass, text: reply.content.trim() };
  } catch (e) {
    input.onPassDone?.(pass.key);
    return { pass, text: `_(${pass.label} pass failed: ${(e as Error).message})_` };
  }
}

/**
 * Fire all passes in parallel, then synthesize. Returns a markdown report.
 */
export async function runAuditSwarm(input: SwarmInput): Promise<string> {
  const results = await Promise.all(AUDIT_PASSES.map((p) => runPass(p, input)));

  const findings = results
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
    findings,
  ].join("\n");

  try {
    const synth = await chatTurn({
      providerId: input.providerId,
      apiKey: input.apiKey,
      model: input.model,
      history: [],
      userMessage: synthesisPrompt,
      toolHandler: NOOP_TOOL,
      maxRoundtrips: 1,
    });
    return synth.content.trim();
  } catch (e) {
    // Synthesis failed — still return the raw specialist findings so the
    // grower gets value.
    return `**Full audit** (synthesis unavailable: ${(e as Error).message})\n\n${findings}`;
  }
}
