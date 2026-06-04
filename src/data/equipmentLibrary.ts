/**
 * Equipment registry — every addable greenhouse object.
 *
 * Each entry records the real-world specs (dimensions from the research
 * memo), the 3D visual hints (geometry type + size in ft, mount point),
 * and the physics hook (which scenario inputs the equipment contributes to).
 *
 * Sources: hydrobuilder.com, growspan.com, Innovative Growers Equipment,
 * Modine / GrowSpan heater specs, fluence-led.com, UMass boom-irrigation,
 * priva.com / arguscontrols.com.
 */

export type EquipmentCategory =
  | "climate-humidity"
  | "climate-heating"
  | "cultivation"
  | "lighting"
  | "irrigation"
  | "controls";

export interface EquipmentDef {
  id: string;
  label: string;
  category: EquipmentCategory;
  description: string;
  // Real-world footprint (ft) for the 3D box/cylinder mesh
  widthFt: number;
  depthFt: number;
  heightFt: number;
  /** "floor" = sits on the ground/bench; "hung" = hangs from the structure */
  mount: "floor" | "hung";
  /** Color for the placeholder box mesh */
  color: string;
  /**
   * Which scenario inputs this equipment expresses / contributes to.
   * Key = scenario input field name, value = the amount this ONE unit adds.
   */
  physicsContribution?: Partial<Record<string, number>>;
  /**
   * Boolean flags to set when at least one unit is placed.
   * Key = scenario input field name, value = true.
   */
  physicsEnables?: Record<string, boolean>;
  /** Max sensible heat added per unit in BTU/hr (for heat-load accounting). */
  sensibleHeatBTUhr?: number;
}

export const EQUIPMENT_LIBRARY: EquipmentDef[] = [
  // ─── Climate / Humidity ──────────────────────────────────────────────────
  {
    id: "dehumidifier-quest-335",
    label: "Dehumidifier (Quest 335)",
    category: "climate-humidity",
    description: "Overhead refrigerant dehumidifier. 335 PPD at AHAM conditions. Hung from truss, ~4.5 ft × 2 ft × 2 ft.",
    widthFt: 4.5,
    depthFt: 2,
    heightFt: 2,
    mount: "hung",
    color: "#c8cdd5",
    physicsContribution: { dehumidifierEfficiencyPintsPerKwh: 0 }, // efficiency is already set; count drives capacity
    physicsEnables: { dehumidificationEnabled: true },
    sensibleHeatBTUhr: 8500, // ~2.5 kW sensible heat added back per unit
  },
  {
    id: "dehumidifier-quest-200",
    label: "Dehumidifier (Quest 200)",
    category: "climate-humidity",
    description: "Overhead refrigerant dehumidifier. 200 PPD. Mid-bay hung unit.",
    widthFt: 3.5,
    depthFt: 1.5,
    heightFt: 1.8,
    mount: "hung",
    color: "#c8cdd5",
    physicsEnables: { dehumidificationEnabled: true },
    sensibleHeatBTUhr: 5200,
  },

  // ─── Climate / Heating ────────────────────────────────────────────────────
  {
    id: "unit-heater-modine-200k",
    label: "Unit Heater (Modine 200k BTU)",
    category: "climate-heating",
    description: "Gas-fired forced-air unit heater. 200,000 BTU/hr, 80% eff. Hung high on gable end, blows down the bay.",
    widthFt: 3.5,
    depthFt: 1.5,
    heightFt: 1.5,
    mount: "hung",
    color: "#8a6a50",
    physicsContribution: { radiantHeatingCapacityBTUhr: 200000 },
    physicsEnables: { radiantHeatingEnabled: true },
  },
  {
    id: "unit-heater-modine-400k",
    label: "Unit Heater (Modine 400k BTU)",
    category: "climate-heating",
    description: "Large forced-air gas unit heater. 400,000 BTU/hr. For bigger bays or cold climates.",
    widthFt: 4,
    depthFt: 2,
    heightFt: 2,
    mount: "hung",
    color: "#8a6a50",
    physicsContribution: { radiantHeatingCapacityBTUhr: 400000 },
    physicsEnables: { radiantHeatingEnabled: true },
  },

  // ─── Cultivation ──────────────────────────────────────────────────────────
  {
    id: "rolling-bench-4x20",
    label: "Rolling Bench 4 × 20 ft",
    category: "cultivation",
    description: "Ebb-and-flow rolling bench, 4 ft wide × 20 ft long, top at 2.4 ft. Single movable aisle shared between benches.",
    widthFt: 4,
    depthFt: 20,
    heightFt: 2.4,
    mount: "floor",
    color: "#6b7280",
  },
  {
    id: "rolling-bench-4x40",
    label: "Rolling Bench 4 × 40 ft",
    category: "cultivation",
    description: "Long-run ebb-and-flow bench. Standard for commercial greenhouse bays.",
    widthFt: 4,
    depthFt: 40,
    heightFt: 2.4,
    mount: "floor",
    color: "#6b7280",
  },

  // ─── Lighting ─────────────────────────────────────────────────────────────
  {
    id: "uc-led-bar",
    label: "Under-Canopy LED Bar",
    category: "lighting",
    description: "Intra-canopy LED bar, 8–12 inches above substrate. Adds PPFD to the lower canopy; +20–30% yield on dense canopies.",
    widthFt: 0.3,
    depthFt: 4,
    heightFt: 0.1,
    mount: "hung",
    color: "#d4a744",
    physicsContribution: { underCanopyPPFD: 100 },
    physicsEnables: { underCanopyEnabled: true },
  },

  // ─── Irrigation ───────────────────────────────────────────────────────────
  {
    id: "boom-irrigator",
    label: "Overhead Boom Irrigator",
    category: "irrigation",
    description: "Truss-suspended watering boom. Travels the bay length at 25–250 ft/min, 12–15\" nozzle spacing. Covers up to 20,000 sq ft.",
    widthFt: 0.5,
    depthFt: 4, // span along the bay
    heightFt: 0.5,
    mount: "hung",
    color: "#2a7ab0",
  },

  // ─── Controls ─────────────────────────────────────────────────────────────
  {
    id: "sensor-pod",
    label: "Climate Sensor Pod",
    category: "controls",
    description: "Aspirated sensor enclosure (Argus/Priva-style). Measures T, RH, PAR, CO₂ per zone; feeds the climate controller closed loop.",
    widthFt: 0.5,
    depthFt: 0.5,
    heightFt: 1,
    mount: "hung",
    color: "#e8e8e8",
  },
];

export const EQUIPMENT_BY_ID = new Map(EQUIPMENT_LIBRARY.map((e) => [e.id, e]));
export const EQUIPMENT_BY_CATEGORY = EQUIPMENT_LIBRARY.reduce<Record<string, EquipmentDef[]>>(
  (acc, e) => {
    if (!acc[e.category]) acc[e.category] = [];
    acc[e.category].push(e);
    return acc;
  },
  {},
);

export const CATEGORY_LABELS: Record<EquipmentCategory, string> = {
  "climate-humidity": "Humidity control",
  "climate-heating": "Heating",
  cultivation: "Benches & cultivation",
  lighting: "Supplemental lighting",
  irrigation: "Irrigation",
  controls: "Sensors & controls",
};
