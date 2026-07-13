/**
 * Expand dotted keys ("envelope.baseTransmissionPct": 70) into nested objects
 * ({ envelope: { baseTransmissionPct: 70 } }) so the chatbot's set_scenario tool
 * accepts the dotted shape the Sage system prompt tells the model to use. If the
 * model emits the literal flat key instead of a nested object, the downstream
 * deep-merge never fires and it lands as a junk top-level property no consumer
 * reads — a silent no-op write. This normalizes both shapes.
 *
 * Merges multiple dotted keys under the same parent. Drops
 * "__proto__"/"constructor"/"prototype" path segments so a crafted key can't
 * pollute Object.prototype. Non-dotted keys pass through unchanged.
 */
export function expandDottedKeys(
  patches: Record<string, unknown>,
): Record<string, unknown> {
  const UNSAFE = new Set(["__proto__", "constructor", "prototype"]);
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(patches)) {
    if (!key.includes(".")) {
      if (!UNSAFE.has(key)) out[key] = val;
      continue;
    }
    const parts = key.split(".");
    if (parts.some((p) => UNSAFE.has(p))) continue;
    let cursor = out;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (!cursor[p] || typeof cursor[p] !== "object" || Array.isArray(cursor[p])) {
        cursor[p] = {};
      }
      cursor = cursor[p] as Record<string, unknown>;
    }
    cursor[parts[parts.length - 1]] = val;
  }
  return out;
}
