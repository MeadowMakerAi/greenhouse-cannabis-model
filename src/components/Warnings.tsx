import { useDerived } from "../context/useDerived";

const TAG_BY_LEVEL = {
  error: "tag-warn",
  warn: "tag-warn",
  info: "tag-info",
} as const;

const DOT_BY_LEVEL = {
  error: "bg-warn-500",
  warn: "bg-warn-500",
  info: "bg-leaf-500",
} as const;

export default function Warnings() {
  const d = useDerived();
  const all = [
    ...d.sanityFlags.map((f) => ({
      level: f.level,
      category: f.category,
      message: f.message,
    })),
    ...d.warnings.global.map((m) => ({
      level: "warn" as const,
      category: "engineering",
      message: m,
    })),
  ];
  if (!all.length) return null;
  return (
    <div className="card">
      <div className="card-header">
        <span>Warnings &amp; sanity flags</span>
        <span className={`tag ${TAG_BY_LEVEL[all[0].level]}`}>{all.length}</span>
      </div>
      <div className="card-body space-y-1.5 text-sm text-ink-700">
        {all.map((w, i) => (
          <div key={i} className="flex gap-2">
            <span
              className={`mt-1.5 inline-block h-1.5 w-1.5 rounded-full ${DOT_BY_LEVEL[w.level]}`}
            />
            <span>
              <span className="mr-1 text-[11px] uppercase tracking-wide text-ink-500">
                {w.category}
              </span>
              {w.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
