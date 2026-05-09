export const defaultClimateControl = {
  shade: {
    shadeEnabled: true,
    shadeTransmissionPct: 70, // 30% shade cloth
    shadeStartMonth: 5, // June (0-indexed 5)
    shadeEndMonth: 8, // September
    shadeDeployMode: "seasonal" as const,
    shadeTriggerOutdoorTempF: 80,
    shadeTriggerSolarWm2: 600,
  },
  evap: {
    evapCoolingEnabled: true,
    evapEfficiencyPct: 75,
    indoorTargetDryBulbF: 78,
  },
  radiant: {
    radiantHeatingEnabled: true,
    radiantHeatingCapacityBTUhr: 250000,
    radiantEfficiency: 0.92,
    targetNightTempF: 65,
    targetDayTempF: 78,
    rootZoneHeatingEnabled: true,
    rootZoneTargetTempF: 68,
    thermalScreenEnabled: false,
    thermalScreenNightUValue: 0.65,
  },
  cooling: {
    mechanicalCoolingEnabled: true,
    designIndoorTempF: 78,
    envelopeUValueBTUhrFtF: 1.1, // single layer poly
    equipmentKW: 3,
    ventilationCFM: 0,
    ventilationDeltaTempF: 0,
  },
  dehumid: {
    dehumidificationEnabled: true,
    plantDensity: 0.4, // plants per ft²
    plantTranspirationGalPerDayPer1000SqFt: 35,
    irrigationRateGalDay: 800,
    runoffPct: 20,
    dehumidifierEfficiencyPintsPerKwh: 7,
    ventilationMoistureRemovalGalDay: 25,
    targetRHPct: 55,
  },
};
