import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNasaPowerMonthly } from "../services/nasaPowerClient";

afterEach(() => vi.unstubAllGlobals());

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** Build a POWER climatology response body. `overrides` can inject a sentinel
 *  or drop a field for a single month to exercise the validation guard. */
function powerBody(overrides?: (m: Record<string, Record<string, number>>) => void) {
  const monthMap = (v: number) => Object.fromEntries(MONTHS.map((mk) => [mk, v]));
  const parameter: Record<string, Record<string, number>> = {
    ALLSKY_SFC_SW_DWN: monthMap(15),
    T2M: monthMap(12),
    T2M_MIN: monthMap(4),
    T2M_MAX: monthMap(20),
    RH2M: monthMap(65),
    T2MDEW: monthMap(6),
  };
  overrides?.(parameter);
  return new Response(JSON.stringify({ properties: { parameter } }), { status: 200 });
}

function stubFetch(body: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => body));
}

describe("fetchNasaPowerMonthly validation", () => {
  it("returns 12 months on a complete response", async () => {
    stubFetch(powerBody());
    const out = await fetchNasaPowerMonthly(41.475, -74.245);
    expect(out).toHaveLength(12);
    // MJ→kWh: 15 / 3.6 ≈ 4.1667
    expect(out[0].shortwaveKwhPerM2PerDay).toBeCloseTo(15 / 3.6, 4);
  });

  it("throws on a -999 sentinel rather than silently zeroing the model", async () => {
    stubFetch(powerBody((p) => { p.ALLSKY_SFC_SW_DWN.JUL = -999; }));
    await expect(fetchNasaPowerMonthly(41.475, -74.245)).rejects.toThrow(/incomplete|sentinel/i);
  });

  it("throws when a load-bearing parameter is missing entirely", async () => {
    stubFetch(powerBody((p) => { delete (p as Record<string, unknown>).T2M; }));
    await expect(fetchNasaPowerMonthly(41.475, -74.245)).rejects.toThrow();
  });
});
