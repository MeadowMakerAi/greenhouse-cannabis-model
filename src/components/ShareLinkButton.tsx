import { useState } from "react";
import { useScenario } from "../context/ScenarioContext";
import { buildShareUrl } from "../utils/scenarioUrl";

/**
 * One-click "copy this scenario as a link." The URL fragment encodes the
 * full scenario delta vs defaults — pasted into another browser it
 * re-hydrates exactly the same state. Fragment never hits the network,
 * so this works equally well on Vercel preview deploys, file:// loads,
 * and offline.
 */
export default function ShareLinkButton() {
  const { inputs } = useScenario();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onClick = async () => {
    const url = buildShareUrl(inputs);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Old browsers / non-secure contexts: select+execCommand fallback.
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      setErr(null);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      title="Copy a sharable link to this exact scenario"
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
        copied
          ? "border-leaf-500 bg-leaf-50 text-leaf-700"
          : "border-ink-300 bg-white text-ink-700 hover:border-leaf-500 hover:text-leaf-700"
      }`}
    >
      <span aria-hidden="true">{copied ? "✓" : "🔗"}</span>
      <span>{copied ? "Link copied" : "Share scenario"}</span>
      {err && <span className="text-warn-500">· {err}</span>}
    </button>
  );
}
