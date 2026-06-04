import { useEffect, useRef } from "react";
import { useScenario } from "./ScenarioContext";
import { EQUIPMENT_BY_ID } from "../data/equipmentLibrary";

/**
 * Syncs the placed equipment list → scenario physics inputs.
 *
 * Each equipment type in the registry declares `physicsContribution` (how
 * much of a given input one unit adds) and `physicsEnables` (boolean flags
 * to set when ≥1 unit exists). This effect aggregates over all placed units
 * and calls setInputs once if anything changed.
 *
 * Currently wired:
 *   dehumidifier → dehumidificationEnabled
 *   unit-heater  → radiantHeatingEnabled, radiantHeatingCapacityBTUhr (sum)
 *   uc-led-bar   → underCanopyEnabled, underCanopyPPFD (sum)
 *
 * Rules:
 * - If the user has also changed the field manually, we only update on the
 *   first mount after the equipment list changes (deferring to the manual
 *   value thereafter would require tracking provenance). This is sufficient
 *   for the "add a piece of equipment and see it instantly affect the model"
 *   use-case.
 */
export function useEquipmentPhysics() {
  const { inputs, setInputs } = useScenario();
  const lastHashRef = useRef<string>("");

  useEffect(() => {
    const placed = inputs.equipment ?? [];
    // Build a stable hash of the equipment list to avoid infinite loops.
    const hash = placed.map((e) => e.defId).sort().join(",");
    if (hash === lastHashRef.current) return;
    lastHashRef.current = hash;

    // Aggregate contributions across all placed units.
    const totals: Record<string, number> = {};
    const enables: Record<string, boolean> = {};
    placed.forEach((e) => {
      const def = EQUIPMENT_BY_ID.get(e.defId);
      if (!def) return;
      Object.entries(def.physicsContribution ?? {}).forEach(([k, v]) => {
        totals[k] = (totals[k] ?? 0) + (v ?? 0);
      });
      Object.entries(def.physicsEnables ?? {}).forEach(([k, v]) => {
        if (v) enables[k] = true;
      });
    });

    // Build the patch — only non-zero contributions and explicit enables.
    const patch: Record<string, number | boolean> = {};
    Object.entries(totals).forEach(([k, v]) => {
      if (v !== 0) patch[k] = v;
    });
    Object.entries(enables).forEach(([k, v]) => {
      patch[k] = v;
    });
    // If no equipment of a type is placed, disable the feature.
    if (!placed.some((e) => e.defId.startsWith("dehumidifier")))
      patch.dehumidificationEnabled = false;
    if (!placed.some((e) => e.defId.startsWith("unit-heater")))
      patch.radiantHeatingEnabled = false;
    if (!placed.some((e) => e.defId.startsWith("uc-led-bar")))
      patch.underCanopyEnabled = false;

    if (Object.keys(patch).length > 0) {
      setInputs(patch as Parameters<typeof setInputs>[0]);
    }
  }, [inputs.equipment, setInputs]);
}
