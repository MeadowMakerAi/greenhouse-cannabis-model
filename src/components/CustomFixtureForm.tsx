import { useState } from "react";
import { useScenario } from "../context/ScenarioContext";
import type { FixtureSpec } from "../models/fixtureModel";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

interface DraftFixture {
  vendor: string;
  model: string;
  type: "LED" | "HPS";
  ppe: number;
  wattsPerFixture: number;
  ppf_umol_s: number;
  opticalUtilization: number;
  notes: string;
}

const blank: DraftFixture = {
  vendor: "",
  model: "",
  type: "LED",
  ppe: 2.7,
  wattsPerFixture: 645,
  ppf_umol_s: 1700,
  opticalUtilization: 0.85,
  notes: "",
};

export default function CustomFixtureForm() {
  const { customFixtures, addCustomFixture, removeCustomFixture, setInputs } =
    useScenario();
  const [draft, setDraft] = useState<DraftFixture>(blank);
  const [open, setOpen] = useState(false);

  const computedPPE =
    draft.wattsPerFixture > 0 ? draft.ppf_umol_s / draft.wattsPerFixture : 0;

  const submit = () => {
    if (!draft.vendor.trim() || !draft.model.trim()) return;
    const id = `custom:${slugify(`${draft.vendor}-${draft.model}`)}`;
    const fixture: FixtureSpec = {
      id,
      label: `${draft.vendor} ${draft.model}`,
      vendor: draft.vendor,
      model: draft.model,
      type: draft.type,
      ppe: draft.ppe,
      opticalUtilization: draft.opticalUtilization,
      dimmable: true,
      radiantFraction: draft.type === "HPS" ? 0.6 : 0.32,
      convectiveFraction: draft.type === "HPS" ? 0.4 : 0.68,
      wattsPerFixture: draft.wattsPerFixture,
      ppf_umol_s: draft.ppf_umol_s,
      minVoltage: draft.type === "HPS" ? 208 : 120,
      maxVoltage: 277,
      powerFactor: draft.type === "HPS" ? 0.92 : 0.95,
      source: "custom",
      notes: draft.notes,
    };
    addCustomFixture(fixture);
    setInputs({ fixtureId: id });
    setDraft(blank);
    setOpen(false);
  };

  return (
    <div className="card">
      <div className="card-header">
        <span>Custom fixtures</span>
        <button
          type="button"
          className="rounded border border-ink-300 px-2 py-0.5 text-xs hover:bg-leaf-500/5"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Cancel" : "+ Add fixture"}
        </button>
      </div>
      <div className="card-body space-y-2">
        <p className="text-[11px] text-ink-500">
          Type the manufacturer's published PPF and wattage from the datasheet — the model recomputes PPE for you. Saved to this browser's localStorage; selectable from the Overhead-lighting fixture dropdown.
        </p>
        {customFixtures.length > 0 && (
          <ul className="space-y-1 text-sm">
            {customFixtures.map((f) => (
              <li key={f.id} className="flex items-center justify-between rounded border border-ink-300/40 px-2 py-1">
                <span>
                  <strong>{f.vendor}</strong> {f.model} · {f.wattsPerFixture}W · {f.ppf_umol_s} µmol/s · {f.ppe.toFixed(2)} µmol/J
                </span>
                <button
                  type="button"
                  className="text-xs text-warn-500 hover:underline"
                  onClick={() => removeCustomFixture(f.id)}
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}

        {open && (
          <div className="grid grid-cols-2 gap-2 rounded border border-ink-300/40 p-2">
            <div>
              <label className="field-label">Vendor</label>
              <input
                type="text"
                placeholder="Fluence"
                value={draft.vendor}
                onChange={(e) => setDraft({ ...draft, vendor: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Model</label>
              <input
                type="text"
                placeholder="SPYDR 2x"
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label">Type</label>
              <select
                value={draft.type}
                onChange={(e) =>
                  setDraft({ ...draft, type: e.target.value as "LED" | "HPS" })
                }
              >
                <option value="LED">LED</option>
                <option value="HPS">HPS / DE</option>
              </select>
            </div>
            <div>
              <label className="field-label">Watts per fixture</label>
              <input
                type="number"
                step="1"
                value={draft.wattsPerFixture}
                onChange={(e) =>
                  setDraft({ ...draft, wattsPerFixture: parseFloat(e.target.value) || 0 })
                }
              />
              <p className="mt-1 text-[10px] text-ink-500">From datasheet "input power" or "AC power"</p>
            </div>
            <div>
              <label className="field-label">PPF (µmol/s)</label>
              <input
                type="number"
                step="1"
                value={draft.ppf_umol_s}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ppf_umol_s: parseFloat(e.target.value) || 0,
                    ppe:
                      draft.wattsPerFixture > 0
                        ? (parseFloat(e.target.value) || 0) / draft.wattsPerFixture
                        : 0,
                  })
                }
              />
              <p className="mt-1 text-[10px] text-ink-500">Total photon flux output, datasheet PPF</p>
            </div>
            <div>
              <label className="field-label">PPE (µmol/J)</label>
              <input
                type="number"
                step="0.01"
                value={+computedPPE.toFixed(3) || draft.ppe}
                onChange={(e) =>
                  setDraft({ ...draft, ppe: parseFloat(e.target.value) || 0 })
                }
              />
              <p className="mt-1 text-[10px] text-ink-500">Auto from PPF/W; override if datasheet differs</p>
            </div>
            <div>
              <label className="field-label">Optical utilization</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={draft.opticalUtilization}
                onChange={(e) =>
                  setDraft({ ...draft, opticalUtilization: parseFloat(e.target.value) || 0 })
                }
              />
              <p className="mt-1 text-[10px] text-ink-500">Fraction of PPF that lands on canopy: 0.80–0.92</p>
            </div>
            <div className="col-span-2">
              <label className="field-label">Notes / datasheet URL</label>
              <input
                type="text"
                placeholder="e.g. Fluence datasheet 2026-04, AC dim 100%"
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              />
            </div>
            <div className="col-span-2 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-leaf-500 px-3 py-1 text-xs font-semibold text-white hover:bg-leaf-600 disabled:opacity-50"
                onClick={submit}
                disabled={!draft.vendor.trim() || !draft.model.trim()}
              >
                Save fixture
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
