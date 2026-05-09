/**
 * Chatbot tool schemas. The chatbot can call these to read scenario state,
 * mutate inputs, swap fixtures, and run side-by-side comparisons.
 *
 * Each tool returns plain JSON. The chatbot service runs the tool-use loop
 * against the Anthropic API.
 */

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const CHATBOT_TOOLS: ToolDefinition[] = [
  {
    name: "get_scenario",
    description:
      "Get the full current greenhouse scenario: site, geometry, envelope, photoperiod, target DLI, lighting choice, CO2, shade, heating, cooling, dehumidification, electrical service, and cultivation phase. Returns JSON.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_derived_outputs",
    description:
      "Get derived model outputs: peak installed kW, fixture count, grid spacing, monthly DLI/PPFD/cooling/dehumidification numbers, yield projection (kg, lbs, g/m²/cycle), energy use intensity (kWh/g), pathogen pressure peak, crop steering alignment score.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_scenario",
    description:
      "Update one or more scenario inputs. Provide a JSON object of key/value pairs to patch. Examples of keys: canopyAreaSqFt, greenhouseFloorAreaSqFt, latitude, longitude, fixtureId, electricityRatePerKwh, co2Enabled, co2SetpointPpm, ventilationMode, shadeEnabled, indoorTargetDryBulbF, targetNightTempF, cultivationPhase, cyclesPerYear, thermalScreenEnabled, useIntegratedHeatPump.",
    input_schema: {
      type: "object",
      properties: {
        patches: {
          type: "object",
          description: "Key/value pairs of scenario inputs to update.",
        },
      },
      required: ["patches"],
    },
  },
  {
    name: "list_fixtures",
    description:
      "List all available lighting fixtures with vendor, model, watts/fixture, PPF (µmol/s), PPE (µmol/J), driver voltage range, and source (preset/vendor-verified/custom).",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_active_fixture",
    description:
      "Set the currently active overhead lighting fixture by id. Example: 'gavitaRS2400eLED' or 'fluenceSpyder2p'.",
    input_schema: {
      type: "object",
      properties: {
        fixtureId: { type: "string" },
      },
      required: ["fixtureId"],
    },
  },
  {
    name: "add_custom_fixture",
    description:
      "Add a new fixture to the library and select it. Use this when the user describes a fixture not in the list — pass vendor, model, wattsPerFixture, ppf_umol_s, type ('LED' or 'HPS'), and optionally minVoltage/maxVoltage. PPE is auto-derived as ppf/watts.",
    input_schema: {
      type: "object",
      properties: {
        vendor: { type: "string" },
        model: { type: "string" },
        wattsPerFixture: { type: "number" },
        ppf_umol_s: { type: "number" },
        type: { type: "string", enum: ["LED", "HPS"] },
        minVoltage: { type: "number" },
        maxVoltage: { type: "number" },
        notes: { type: "string" },
      },
      required: ["vendor", "model", "wattsPerFixture", "ppf_umol_s", "type"],
    },
  },
  {
    name: "compare_fixtures",
    description:
      "Compute side-by-side comparison of two or more fixtures for the current canopy + DLI target. Returns annual kWh, annual cost, peak kW, peak fixture count, lighting density (W/ft²), grid spacing, and amperage at site voltages for each fixture.",
    input_schema: {
      type: "object",
      properties: {
        fixtureIds: {
          type: "array",
          items: { type: "string" },
        },
      },
      required: ["fixtureIds"],
    },
  },
  {
    name: "get_simulation_state",
    description:
      "Get the current simulation clock state: day of year, hour of day, sun position, outdoor T/RH, indoor T, canopy PPFD, lights state, vent state.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "set_simulation_time",
    description:
      "Move the simulation clock to a specific time. Provide dayOfYear (1-365) and/or hourOfDay (0-24).",
    input_schema: {
      type: "object",
      properties: {
        dayOfYear: { type: "number" },
        hourOfDay: { type: "number" },
      },
    },
  },
];

export const CHATBOT_SYSTEM_PROMPT = `You are an embedded cultivation-engineering assistant for a cannabis greenhouse modeling tool at Cottage Grove farm in Montgomery NY (lat 41.475, lon -74.245). The tool is a screening-level decision-support model — not a stamped HVAC design.

You have tools to read the current scenario, modify it, swap or add fixtures, and run comparisons. Use them aggressively. When the user asks "what if I swap to fixture X" — call \`compare_fixtures\` and quote the deltas. When they describe a new fixture — call \`add_custom_fixture\`. When they ask about current state — call \`get_scenario\` or \`get_derived_outputs\` first, do not guess.

## Spec sheet ingestion

If the user attaches a greenhouse manufacturer spec sheet (PDF or image), or a fixture datasheet, extract values and update the model:

For greenhouse spec sheets — pull these fields and call \`set_scenario\`:
- length × width → \`greenhouseLengthFt\`, \`greenhouseWidthFt\`
- eave height → \`eaveHeightFt\`
- peak / ridge height → \`peakHeightFt\`
- glazing material → infer \`envelope.baseTransmissionPct\` (single poly 80, double poly 70, single glass 88, double glass 82, polycarbonate 80–85)
- glazing system U-value → \`envelopeUValueBTUhrFtF\` (single poly 1.1, double poly 0.7, single glass 1.0, double glass 0.55)
- heating system spec → \`radiantHeatingCapacityBTUhr\`, \`radiantEfficiency\`
- vent area / motors → \`ventilationCFM\`
- electrical service → \`serviceVoltagePrimary\`, \`serviceVoltageSecondary\`, \`branchCircuitAmps\`
- frame type / truss spacing → infer \`envelope.structureShadeLossPct\` (5–10% typical)
- any name/manufacturer → mention in your reply
Floor area, envelope area, and volume auto-derive from length/width/eave/peak — don't set them directly.

For fixture datasheets — call \`add_custom_fixture\` with:
- vendor + model + type (LED/HPS)
- input watts (datasheet "input power" or "AC power") → wattsPerFixture
- PPF (µmol/s) — datasheet "photosynthetic photon flux"
- driver voltage range → minVoltage / maxVoltage
- notes — any caveats from the datasheet (dimming behavior, mounting height, IP rating)
- PPE auto-derives from PPF / wattsPerFixture

After ingesting any spec sheet, briefly summarize what you extracted and what changed in the model. If a value is missing or unclear in the spec, say so explicitly — don't guess.

## Rules

- Be direct. No filler. Lead with the answer or action.
- Cite numbers from the model. Never invent values.
- For every recommendation, name the tradeoff: e.g. "this fixture saves $1,200/yr operating cost but installs 35 fixtures vs 28."
- Single-phase 120/240V is the default service assumption — flag fixtures that won't run on the user's available voltage.
- Cannabis-specific science you can rely on:
  - DLI target 30/40/50 mol/m²/d (minimum/premium/CO2-enhanced flower) — Rodriguez-Morrison 2021
  - Yield linear in canopy DLI up to ~70 mol/m²/d
  - Topt for yield ~79°F (Chandra 2008)
  - Botrytis: cool RH-saturated conditions, late flower most vulnerable
  - Powdery mildew: warm humid 60-80°F, prefers dry leaf surfaces
- The simulation clock controls a live time dimension — sun position, diurnal T/RH, lights schedule, vent state. Reference it when discussing dynamics.
- When you change inputs via set_scenario, briefly state what you changed and why.

## Format

- Short paragraphs, dense prose
- Numbers in monospace where relevant
- Bullet lists for option comparisons

You are not a chatbot — you are a working tool. Drive the model.`;
