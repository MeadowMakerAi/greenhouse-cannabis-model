import { sqftToSqm, kWToBTUhr } from "../utils/unitConversions";

export type FixtureSource = "preset" | "vendor-verified" | "custom";

export interface FixtureSpec {
  id: string;
  label: string;
  vendor?: string;
  model?: string;
  type: "LED" | "HPS";
  ppe: number; // µmol/J
  opticalUtilization: number; // 0..1 (engineering estimate, NOT a vendor spec)
  dimmable: boolean;
  radiantFraction: number; // 0..1
  convectiveFraction: number; // 0..1
  wattsPerFixture: number; // typical bench draw per fixture (W)
  ppf_umol_s?: number; // datasheet PPF (µmol/s)
  /** Min voltage the fixture's driver supports (V). */
  minVoltage: number;
  /** Max voltage the fixture's driver supports (V). */
  maxVoltage: number;
  /** Power factor of the fixture's driver. Defaults to 0.95 for LEDs. */
  powerFactor?: number;
  source: FixtureSource;
  notes?: string;
  verifiedAt?: string;
  verifiedSource?: string;
}

export interface FixtureSizingInput {
  supplementalPPFDRequired: number;
  canopyAreaSqFt: number;
  fixture: FixtureSpec;
  photoperiodHours: number;
  electricityRatePerKwh: number;
  daysInMonth: number;
}

export interface FixtureSizingOutput {
  requiredPhotonFlux_umol_s: number;
  electricalWatts: number;
  installedKW: number;
  dailyKwh: number;
  monthlyKwh: number;
  monthlyCostUSD: number;
  lightingHeatBTUhr: number;
  fixtureCount: number;
  wattsPerSqFt: number;
  coveragePerFixtureSqFt: number;
  coveragePerFixtureSqM: number;
  fixturesPer100SqFt: number;
  squareGridSpacingFt: number;
  squareGridSpacingM: number;
  /** Per-fixture amperage at 120V single-phase (A). NaN if voltage unsupported. */
  ampsPerFixture120V: number;
  /** Per-fixture amperage at 240V single-phase (A). NaN if voltage unsupported. */
  ampsPerFixture240V: number;
  totalAmps120V: number;
  totalAmps240V: number;
  /** Whether the fixture supports 120V single-phase. */
  supports120V: boolean;
  /** Whether the fixture supports 240V single-phase. */
  supports240V: boolean;
  /** Number of 20A 120V circuits required (NEC 80% continuous loading). */
  circuits20A_120V: number;
  /** Number of 20A 240V circuits required. */
  circuits20A_240V: number;
  /** Number of 30A 240V dedicated circuits required. */
  circuits30A_240V: number;
}

export function fixtureKWFromPPFD(input: FixtureSizingInput): FixtureSizingOutput {
  const ppfd = Math.max(0, input.supplementalPPFDRequired);
  const canopyM2 = sqftToSqm(input.canopyAreaSqFt);
  const requiredPhotonFlux_umol_s = ppfd * canopyM2;
  const electricalWatts =
    input.fixture.ppe > 0 && input.fixture.opticalUtilization > 0
      ? requiredPhotonFlux_umol_s / (input.fixture.ppe * input.fixture.opticalUtilization)
      : 0;
  const installedKW = electricalWatts / 1000;
  const dailyKwh = installedKW * input.photoperiodHours;
  const monthlyKwh = dailyKwh * input.daysInMonth;
  const monthlyCostUSD = monthlyKwh * input.electricityRatePerKwh;
  const lightingHeatBTUhr = kWToBTUhr(installedKW);
  const fixtureCount =
    input.fixture.wattsPerFixture > 0
      ? Math.ceil(electricalWatts / input.fixture.wattsPerFixture)
      : 0;
  const wattsPerSqFt =
    input.canopyAreaSqFt > 0 ? electricalWatts / input.canopyAreaSqFt : 0;
  const coveragePerFixtureSqFt =
    fixtureCount > 0 ? input.canopyAreaSqFt / fixtureCount : 0;
  const coveragePerFixtureSqM = coveragePerFixtureSqFt / 10.7639;
  const fixturesPer100SqFt =
    input.canopyAreaSqFt > 0 ? (fixtureCount / input.canopyAreaSqFt) * 100 : 0;
  const squareGridSpacingFt =
    coveragePerFixtureSqFt > 0 ? Math.sqrt(coveragePerFixtureSqFt) : 0;
  const squareGridSpacingM = squareGridSpacingFt / 3.2808;

  const supports120V =
    input.fixture.minVoltage <= 120 && input.fixture.maxVoltage >= 120;
  const supports240V =
    input.fixture.minVoltage <= 240 && input.fixture.maxVoltage >= 240;
  const pf = input.fixture.powerFactor ?? 0.95;
  // Single-phase amperage: I = P / (V × PF)
  const ampsPerFixture120V = supports120V
    ? input.fixture.wattsPerFixture / (120 * pf)
    : Number.NaN;
  const ampsPerFixture240V = supports240V
    ? input.fixture.wattsPerFixture / (240 * pf)
    : Number.NaN;
  const totalAmps120V = supports120V
    ? (electricalWatts / (120 * pf))
    : Number.NaN;
  const totalAmps240V = supports240V
    ? (electricalWatts / (240 * pf))
    : Number.NaN;
  // NEC 210.20 — circuit must handle 125% of continuous load → usable amps = 0.8 × rated
  const usableAmps20A = 20 * 0.8; // 16A continuous
  const usableAmps30A = 30 * 0.8; // 24A continuous
  const circuits20A_120V = supports120V
    ? Math.ceil((electricalWatts / (120 * pf)) / usableAmps20A)
    : 0;
  const circuits20A_240V = supports240V
    ? Math.ceil((electricalWatts / (240 * pf)) / usableAmps20A)
    : 0;
  const circuits30A_240V = supports240V
    ? Math.ceil((electricalWatts / (240 * pf)) / usableAmps30A)
    : 0;

  return {
    requiredPhotonFlux_umol_s,
    electricalWatts,
    installedKW,
    dailyKwh,
    monthlyKwh,
    monthlyCostUSD,
    lightingHeatBTUhr,
    fixtureCount,
    wattsPerSqFt,
    coveragePerFixtureSqFt,
    coveragePerFixtureSqM,
    fixturesPer100SqFt,
    squareGridSpacingFt,
    squareGridSpacingM,
    ampsPerFixture120V,
    ampsPerFixture240V,
    totalAmps120V,
    totalAmps240V,
    supports120V,
    supports240V,
    circuits20A_120V,
    circuits20A_240V,
    circuits30A_240V,
  };
}
