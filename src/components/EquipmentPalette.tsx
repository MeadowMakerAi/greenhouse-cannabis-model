import { useState } from "react";
import { useScenario } from "../context/ScenarioContext";
import {
  EQUIPMENT_BY_CATEGORY,
  CATEGORY_LABELS,
  EQUIPMENT_BY_ID,
  type EquipmentCategory,
} from "../data/equipmentLibrary";

const CATEGORY_ICONS: Record<EquipmentCategory, string> = {
  "climate-humidity": "💧",
  "climate-heating": "🔥",
  cultivation: "🪴",
  lighting: "💡",
  irrigation: "🚿",
  controls: "📡",
};

/**
 * Equipment palette — browse real greenhouse equipment by category, add it
 * to the scene with a click. Added units appear in the 3D model at real scale
 * and contribute to the physics (dehumidifiers → latent removal, heaters →
 * BTU capacity, UC LEDs → under-canopy PPFD).
 */
export default function EquipmentPalette() {
  const { inputs, addEquipment, removeEquipment } = useScenario();
  const [category, setCategory] = useState<EquipmentCategory>("climate-humidity");
  const [open, setOpen] = useState(false);

  const placed = inputs.equipment ?? [];
  const countById = placed.reduce<Record<string, number>>((acc, e) => {
    acc[e.defId] = (acc[e.defId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="card">
      <div className="card-header">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <span>🏗️ Equipment &amp; objects · {placed.length} placed</span>
          <span className="text-ink-400">{open ? "▲" : "▼"}</span>
        </button>
      </div>
      {open && (
        <div className="card-body space-y-3">
          {/* Placed items list */}
          {placed.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-500">
                In your greenhouse
              </div>
              {placed.map((e) => {
                const def = EQUIPMENT_BY_ID.get(e.defId);
                return (
                  <div
                    key={e.instanceId}
                    className="flex items-center justify-between rounded-lg border border-ink-200/70 bg-ink-50/60 px-3 py-1.5 text-xs"
                  >
                    <span className="font-medium text-ink-900">{def?.label ?? e.defId}</span>
                    <button
                      type="button"
                      onClick={() => removeEquipment(e.instanceId)}
                      className="ml-2 rounded px-1.5 py-0.5 text-warn-500 hover:bg-warn-500/10"
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Category tabs */}
          <div className="flex flex-wrap gap-1">
            {(Object.keys(EQUIPMENT_BY_CATEGORY) as EquipmentCategory[]).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  category === cat
                    ? "bg-leaf-500 text-white"
                    : "border border-ink-300 text-ink-600 hover:bg-ink-100"
                }`}
              >
                {CATEGORY_ICONS[cat]} {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          {/* Equipment grid */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(EQUIPMENT_BY_CATEGORY[category] ?? []).map((def) => (
              <div
                key={def.id}
                className="rounded-lg border border-ink-200/70 bg-white p-3 text-xs"
              >
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-ink-900">{def.label}</span>
                  {countById[def.id] ? (
                    <span className="rounded-full bg-leaf-500/15 px-1.5 py-0.5 font-mono text-[10px] text-leaf-700">
                      ×{countById[def.id]}
                    </span>
                  ) : null}
                </div>
                <p className="mb-2 text-ink-600 leading-snug">{def.description}</p>
                <div className="mb-2 text-[10px] text-ink-500">
                  {def.widthFt.toFixed(1)}′ × {def.depthFt.toFixed(1)}′ × {def.heightFt.toFixed(1)}′ · {def.mount === "hung" ? "hung from structure" : "floor-mounted"}
                </div>
                <button
                  type="button"
                  onClick={() => addEquipment(def.id)}
                  className="rounded-lg border border-leaf-500/50 bg-leaf-50 px-3 py-1 text-xs font-semibold text-leaf-700 transition hover:bg-leaf-500/15"
                >
                  + Add to greenhouse
                </button>
              </div>
            ))}
          </div>

          <p className="text-[11px] italic text-ink-400">
            Equipment objects appear in the 3D scene at real scale. Units with physics hooks (dehumidifiers, heaters, under-canopy LEDs) also update the relevant model inputs.
          </p>
        </div>
      )}
    </div>
  );
}
