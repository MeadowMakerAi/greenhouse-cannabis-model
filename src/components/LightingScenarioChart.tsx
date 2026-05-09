import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { useAllFixtures } from "../context/useAllFixtures";
import { fixtureKWFromPPFD, type FixtureSpec } from "../models/fixtureModel";
import { DAYS_IN_MONTH } from "../utils/formatting";
import { fmtCurrency, fmtInt } from "../utils/formatting";

const SOURCE_TAG: Record<FixtureSpec["source"], { label: string; cls: string }> = {
  preset: { label: "preset", cls: "tag-muted" },
  "vendor-verified": { label: "vendor-verified", cls: "tag-info" },
  custom: { label: "custom", cls: "tag-info" },
};

export default function LightingScenarioChart() {
  const { inputs, setInputs } = useScenario();
  const all = useAllFixtures();
  const d = useDerived();
  const ids = Object.keys(all);

  const compareData = d.months.map((m, idx) => {
    const row: Record<string, number | string> = { month: m.monthLabel };
    ids.forEach((fid) => {
      const sized = fixtureKWFromPPFD({
        supplementalPPFDRequired: m.supplementalPPFDRequired,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        fixture: all[fid],
        photoperiodHours: inputs.flowerPhotoperiodHours,
        electricityRatePerKwh: inputs.electricityRatePerKwh,
        daysInMonth: DAYS_IN_MONTH[idx],
      });
      row[all[fid].label] = +sized.installedKW.toFixed(1);
    });
    return row;
  });

  const annual = ids.map((fid) => {
    const f = all[fid];
    let kwh = 0;
    let cost = 0;
    let peakKW = 0;
    let peakBTU = 0;
    let peakWatts = 0;
    let peakFixtures = 0;
    d.months.forEach((m, idx) => {
      const sized = fixtureKWFromPPFD({
        supplementalPPFDRequired: m.supplementalPPFDRequired,
        canopyAreaSqFt: inputs.canopyAreaSqFt,
        fixture: f,
        photoperiodHours: inputs.flowerPhotoperiodHours,
        electricityRatePerKwh: inputs.electricityRatePerKwh,
        daysInMonth: DAYS_IN_MONTH[idx],
      });
      kwh += sized.monthlyKwh;
      cost += sized.monthlyCostUSD;
      peakKW = Math.max(peakKW, sized.installedKW);
      peakBTU = Math.max(peakBTU, sized.lightingHeatBTUhr);
      peakWatts = Math.max(peakWatts, sized.electricalWatts);
      peakFixtures = Math.max(peakFixtures, sized.fixtureCount);
    });
    const coverageFt2 = peakFixtures > 0 ? inputs.canopyAreaSqFt / peakFixtures : 0;
    const gridSpacingFt = coverageFt2 > 0 ? Math.sqrt(coverageFt2) : 0;
    return {
      fixture: f,
      kwh,
      cost,
      peakKW,
      peakBTU,
      peakWatts,
      peakFixtures,
      wattsPerSqFt: peakWatts / Math.max(1, inputs.canopyAreaSqFt),
      coverageFt2,
      coverageM2: coverageFt2 / 10.7639,
      gridSpacingFt,
      gridSpacingM: gridSpacingFt / 3.2808,
      fixturesPer100Ft2:
        inputs.canopyAreaSqFt > 0 ? (peakFixtures / inputs.canopyAreaSqFt) * 100 : 0,
    };
  });

  const palette = ["#1f6c50", "#2f8f6c", "#c0573a", "#e8b04a", "#5b6573", "#08323b", "#aa3bff", "#0d6efd"];

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="card-header">
          <span>
            All fixtures · installed kW required by month · target {d.target.targetDLI} DLI · {inputs.flowerPhotoperiodHours}h flower
          </span>
          <span className="text-xs text-ink-500">[kW]</span>
        </div>
        <div className="card-body" style={{ height: 360 }}>
          <ResponsiveContainer>
            <BarChart data={compareData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis stroke="#5b6573" />
              <Tooltip />
              <Legend />
              {ids.map((fid, i) => (
                <Bar
                  key={fid}
                  dataKey={all[fid].label}
                  fill={palette[i % palette.length]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {annual.map((a) => {
          const tag = SOURCE_TAG[a.fixture.source];
          const isSelected = a.fixture.id === inputs.fixtureId;
          return (
            <div
              key={a.fixture.id}
              className={`card ${isSelected ? "ring-2 ring-leaf-500" : ""}`}
            >
              <div className="card-header">
                <span className="truncate">
                  {a.fixture.vendor ? (
                    <>
                      <strong>{a.fixture.vendor}</strong>{" "}
                      <span className="text-ink-500">{a.fixture.model}</span>
                    </>
                  ) : (
                    a.fixture.label
                  )}
                </span>
                <div className="flex gap-1">
                  <span className="tag tag-muted">{a.fixture.type}</span>
                  <span className={`tag ${tag.cls}`}>{tag.label}</span>
                </div>
              </div>
              <div className="card-body space-y-1">
                {a.fixture.notes && (
                  <p className="mb-2 rounded bg-ink-300/15 p-2 text-[11px] text-ink-700">
                    {a.fixture.notes}
                  </p>
                )}
                {a.fixture.source === "vendor-verified" && a.fixture.verifiedSource && (
                  <p className="mb-2 text-[10px] text-leaf-600">
                    Verified {a.fixture.verifiedAt} ·{" "}
                    <a
                      href={a.fixture.verifiedSource}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      source
                    </a>
                  </p>
                )}
                <div className="kv">
                  <span className="kv-label">PPE</span>
                  <span className="kv-value">{a.fixture.ppe.toFixed(2)} µmol/J</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Watts/fixture</span>
                  <span className="kv-value">{fmtInt(a.fixture.wattsPerFixture)} W</span>
                </div>
                {a.fixture.ppf_umol_s !== undefined && (
                  <div className="kv">
                    <span className="kv-label">Datasheet PPF</span>
                    <span className="kv-value">{fmtInt(a.fixture.ppf_umol_s)} µmol/s</span>
                  </div>
                )}
                <div className="kv">
                  <span className="kv-label">Optical util.</span>
                  <span className="kv-value">{(a.fixture.opticalUtilization * 100).toFixed(0)}%</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Peak fixture count</span>
                  <span className="kv-value">{fmtInt(a.peakFixtures)}</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Coverage per fixture</span>
                  <span className="kv-value">
                    {a.coverageFt2.toFixed(1)} ft² · {a.coverageM2.toFixed(2)} m²
                  </span>
                </div>
                <div className="kv">
                  <span className="kv-label">Square-grid spacing</span>
                  <span className="kv-value">
                    {a.gridSpacingFt.toFixed(1)}′ · {a.gridSpacingM.toFixed(2)} m
                  </span>
                </div>
                <div className="kv">
                  <span className="kv-label">Density</span>
                  <span className="kv-value">{a.fixturesPer100Ft2.toFixed(1)} / 100 ft²</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Peak installed kW</span>
                  <span className="kv-value">{a.peakKW.toFixed(1)} kW</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Lighting density</span>
                  <span className="kv-value">{a.wattsPerSqFt.toFixed(1)} W/ft²</span>
                </div>
                <div className="mt-2 rounded border border-ink-300/30 bg-ink-300/10 p-2 text-xs">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-ink-500">
                    Electrical · driver {a.fixture.minVoltage}–{a.fixture.maxVoltage}V · PF {(a.fixture.powerFactor ?? 0.95).toFixed(2)}
                  </div>
                  <div className="kv">
                    <span className="kv-label">@ 120V per fixture</span>
                    <span className="kv-value">
                      {a.fixture.minVoltage <= 120 && a.fixture.maxVoltage >= 120
                        ? `${(a.fixture.wattsPerFixture / 120 / (a.fixture.powerFactor ?? 0.95)).toFixed(2)} A`
                        : "n/a"}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="kv-label">@ 240V per fixture</span>
                    <span className="kv-value">
                      {a.fixture.minVoltage <= 240 && a.fixture.maxVoltage >= 240
                        ? `${(a.fixture.wattsPerFixture / 240 / (a.fixture.powerFactor ?? 0.95)).toFixed(2)} A`
                        : "n/a"}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="kv-label">Total @ 120V</span>
                    <span className="kv-value">
                      {a.fixture.minVoltage <= 120 && a.fixture.maxVoltage >= 120
                        ? `${(a.peakWatts / 120 / (a.fixture.powerFactor ?? 0.95)).toFixed(0)} A`
                        : "n/a"}
                    </span>
                  </div>
                  <div className="kv">
                    <span className="kv-label">Total @ 240V</span>
                    <span className="kv-value">
                      {a.fixture.minVoltage <= 240 && a.fixture.maxVoltage >= 240
                        ? `${(a.peakWatts / 240 / (a.fixture.powerFactor ?? 0.95)).toFixed(0)} A`
                        : "n/a"}
                    </span>
                  </div>
                  {a.fixture.minVoltage > 120 && (
                    <div className="mt-1 text-[10px] text-warn-500">
                      ⚠ Requires ≥{a.fixture.minVoltage}V — won't run on 120V branches
                    </div>
                  )}
                </div>
                <div className="kv">
                  <span className="kv-label">Peak heat load</span>
                  <span className="kv-value">{fmtInt(a.peakBTU)} BTU/hr</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Annual energy</span>
                  <span className="kv-value">{fmtInt(a.kwh)} kWh</span>
                </div>
                <div className="kv">
                  <span className="kv-label">Annual cost</span>
                  <span className="kv-value">{fmtCurrency(a.cost)}</span>
                </div>
                {!isSelected && (
                  <button
                    type="button"
                    className="mt-2 w-full rounded border border-leaf-500 px-2 py-1 text-xs text-leaf-600 hover:bg-leaf-500/5"
                    onClick={() => setInputs({ fixtureId: a.fixture.id })}
                  >
                    Use this fixture
                  </button>
                )}
                {isSelected && (
                  <div className="mt-2 rounded bg-leaf-500/10 px-2 py-1 text-center text-xs font-semibold text-leaf-600">
                    Currently selected
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
