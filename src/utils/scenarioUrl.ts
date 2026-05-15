import { defaultScenario, type ScenarioInputs } from "../context/ScenarioContext";

/**
 * Share-by-URL: encode the full scenario into the URL fragment so a
 * cultivator can send a colleague a link that loads "this is what my
 * greenhouse looks like." The fragment never hits the network, so
 * no analytics or proxy ever sees the payload.
 *
 * Format: `#s=<base64url(JSON(scenarioDelta))>&v=1`
 *
 * We encode only the delta vs. the current `defaultScenario` to keep
 * URLs short. v=1 is the schema version — bump if the inputs shape
 * changes in a way that breaks back-compat.
 */

const SCHEMA_VERSION = 1;

function base64UrlEncode(str: string): string {
  // Browsers don't have native base64url; transform after btoa.
  // Use Uint8Array round-trip so unicode survives.
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(str: string): string {
  const padded = str
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(str.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/**
 * Build a minimal delta of `inputs` vs `defaultScenario`. Keys whose
 * values deep-equal the default are omitted. `envelope` is treated as
 * a nested object — only changed nested keys are kept.
 */
function buildDelta(inputs: ScenarioInputs): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  const def = defaultScenario as unknown as Record<string, unknown>;
  const src = inputs as unknown as Record<string, unknown>;
  for (const k of Object.keys(src)) {
    const a = src[k];
    const b = def[k];
    if (k === "envelope" && a && b && typeof a === "object" && typeof b === "object") {
      const subDelta: Record<string, unknown> = {};
      const av = a as Record<string, unknown>;
      const bv = b as Record<string, unknown>;
      for (const sk of Object.keys(av)) {
        if (av[sk] !== bv[sk]) subDelta[sk] = av[sk];
      }
      if (Object.keys(subDelta).length > 0) delta[k] = subDelta;
      continue;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) {
      delta[k] = a;
    }
  }
  return delta;
}

export function encodeScenarioToHash(inputs: ScenarioInputs): string {
  const delta = buildDelta(inputs);
  const payload = JSON.stringify(delta);
  return `#s=${base64UrlEncode(payload)}&v=${SCHEMA_VERSION}`;
}

export function buildShareUrl(inputs: ScenarioInputs): string {
  if (typeof window === "undefined") return "";
  const hash = encodeScenarioToHash(inputs);
  return `${window.location.origin}${window.location.pathname}${window.location.search}${hash}`;
}

/**
 * Decode the URL fragment back into a partial scenario patch.
 * Returns `null` if no share payload is present or the payload is
 * malformed. Caller should pass the result through `setInputs` so the
 * ScenarioContext clamps/derives downstream fields.
 */
export function decodeScenarioFromHash(hash: string): Partial<ScenarioInputs> | null {
  if (!hash || !hash.startsWith("#")) return null;
  const params = new URLSearchParams(hash.slice(1));
  const payload = params.get("s");
  if (!payload) return null;
  const v = parseInt(params.get("v") || "0", 10);
  if (v !== SCHEMA_VERSION) {
    console.warn(
      `[scenarioUrl] Ignoring share link with schema v=${v}, expected v=${SCHEMA_VERSION}.`,
    );
    return null;
  }
  try {
    const json = base64UrlDecode(payload);
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    // Merge envelope partial onto current defaults so callers don't
    // wipe sibling envelope fields when only one was set.
    const out = { ...(parsed as Record<string, unknown>) };
    if (out.envelope && typeof out.envelope === "object") {
      out.envelope = {
        ...(defaultScenario.envelope as unknown as Record<string, unknown>),
        ...(out.envelope as Record<string, unknown>),
      };
    }
    return out as Partial<ScenarioInputs>;
  } catch (err) {
    console.warn(`[scenarioUrl] Failed to decode share payload:`, err);
    return null;
  }
}

/** Replace the URL fragment without adding a history entry. */
export function writeShareHash(inputs: ScenarioInputs): void {
  if (typeof window === "undefined") return;
  const hash = encodeScenarioToHash(inputs);
  // history.replaceState avoids littering the back-button history with
  // every keystroke. URL stays current for copy-link.
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history.replaceState(null, "", url);
}
