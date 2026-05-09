import { kWToBTUhr } from "../utils/unitConversions";

export interface HeatingInput {
  enabled: boolean;
  outdoorNightTempF: number;
  targetNightTempF: number;
  envelopeAreaSqFt: number;
  envelopeUValueBTUhrFtF: number;
  nightLightingKW: number;
  lightingHeatRecoveryFraction: number;
  equipmentNightKW: number;
  radiantCapacityBTUhr: number;
  radiantEfficiency: number;
  nightHoursPerDay: number;
  daysInMonth: number;
  /** Whether thermal screen is deployed at night. Reduces effective night U-value. */
  thermalScreenEnabled?: boolean;
  /** Effective U-value when screen is closed (typical 0.55–0.70 vs 1.1 single layer). */
  thermalScreenNightUValue?: number;
}

export interface HeatingOutput {
  /** Sensible heat loss across envelope at design night condition, BTU/hr. */
  envelopeLossBTUhr: number;
  /** Lighting waste heat captured indoors at night, BTU/hr. */
  lightingHeatOffsetBTUhr: number;
  /** Equipment waste heat indoors at night, BTU/hr. */
  equipmentHeatBTUhr: number;
  /** Heating load the radiant system actually has to supply, BTU/hr. */
  netHeatingLoadBTUhr: number;
  /** Whether installed radiant capacity covers the load. */
  capacityCoversLoad: boolean;
  /** Estimated monthly heating fuel input, MMBtu/month (pre-efficiency basis: net load × hours / efficiency). */
  monthlyFuelInputMMBtu: number;
  /** Notes the operator must read. */
  notes: string[];
}

export function evaluateHeating(input: HeatingInput): HeatingOutput {
  const notes: string[] = [];
  if (!input.enabled) {
    notes.push("Radiant heating disabled — winter night setpoints will not hold without an alternative heat source.");
    return {
      envelopeLossBTUhr: 0,
      lightingHeatOffsetBTUhr: 0,
      equipmentHeatBTUhr: 0,
      netHeatingLoadBTUhr: 0,
      capacityCoversLoad: false,
      monthlyFuelInputMMBtu: 0,
      notes,
    };
  }

  const tempDelta = Math.max(0, input.targetNightTempF - input.outdoorNightTempF);
  // Effective U-value at night: thermal screen reduces it substantially when deployed
  const effectiveUValue = input.thermalScreenEnabled
    ? Math.min(input.envelopeUValueBTUhrFtF, input.thermalScreenNightUValue ?? 0.65)
    : input.envelopeUValueBTUhrFtF;
  const envelopeLossBTUhr =
    effectiveUValue * input.envelopeAreaSqFt * tempDelta;

  const lightingHeatOffsetBTUhr = kWToBTUhr(
    Math.max(0, input.nightLightingKW * input.lightingHeatRecoveryFraction),
  );
  const equipmentHeatBTUhr = kWToBTUhr(Math.max(0, input.equipmentNightKW));

  const netHeatingLoadBTUhr = Math.max(
    0,
    envelopeLossBTUhr - lightingHeatOffsetBTUhr - equipmentHeatBTUhr,
  );

  const capacityCoversLoad =
    input.radiantCapacityBTUhr >= netHeatingLoadBTUhr;

  const radiantEff = Math.max(0.01, Math.min(1, input.radiantEfficiency));
  const monthlyFuelInputMMBtu =
    (netHeatingLoadBTUhr / radiantEff) *
    input.nightHoursPerDay *
    input.daysInMonth /
    1_000_000;

  if (!capacityCoversLoad) {
    notes.push(
      `Installed radiant capacity (${input.radiantCapacityBTUhr.toLocaleString()} BTU/hr) is below the design night heating load (${Math.round(netHeatingLoadBTUhr).toLocaleString()} BTU/hr).`,
    );
  }
  if (lightingHeatOffsetBTUhr > envelopeLossBTUhr && envelopeLossBTUhr > 0) {
    notes.push(
      "Lighting waste heat exceeds envelope loss — this month, lighting alone holds night setpoint and may overshoot if uncontrolled.",
    );
  }
  notes.push(
    "Radiant heating warms plant and root-zone tissue but does not remove water vapor. Dehumidification is still required at flower-stage RH targets.",
  );
  if (input.thermalScreenEnabled) {
    const reduction =
      input.envelopeUValueBTUhrFtF > 0
        ? (1 - effectiveUValue / input.envelopeUValueBTUhrFtF) * 100
        : 0;
    notes.push(
      `Thermal screen deployed at night reduces envelope heat loss by ~${reduction.toFixed(0)}% (effective U ${effectiveUValue.toFixed(2)} vs ${input.envelopeUValueBTUhrFtF.toFixed(2)} BTU/hr·ft²·°F).`,
    );
  }

  return {
    envelopeLossBTUhr,
    lightingHeatOffsetBTUhr,
    equipmentHeatBTUhr,
    netHeatingLoadBTUhr,
    capacityCoversLoad,
    monthlyFuelInputMMBtu,
    notes,
  };
}
