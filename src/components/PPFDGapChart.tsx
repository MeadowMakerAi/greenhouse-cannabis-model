import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useDerived } from "../context/useDerived";
import { useScenario } from "../context/ScenarioContext";
import { sqftToSqm } from "../utils/unitConversions";
import { fmt1, fmtInt } from "../utils/formatting";

/**
 * Engineering-requirement view: what the CANOPY needs.
 *
 * These quantities are fixture-independent — they say nothing about kW
 * because kW depends on which fixture delivers the photons. The fixture
 * comparison happens in the chart below.
 */
export default function PPFDGapChart() {
  const { inputs } = useScenario();
  const d = useDerived();

  const canopyM2 = sqftToSqm(inputs.canopyAreaSqFt);
  const photoperiodSec = inputs.flowerPhotoperiodHours * 3600;
  const annualPhotonsMolPerM2 = d.months.reduce(
    (a, m) => a + m.supplementalDLIRequired * 30, // approx monthly mol/m²
    0,
  );

  const data = d.months.map((m) => ({
    month: m.monthLabel,
    "Supplemental PPFD": Math.round(m.supplementalPPFDRequired),
    "Supplemental DLI": +m.supplementalDLIRequired.toFixed(1),
    photonFlux_umol_s: Math.round(m.supplementalPPFDRequired * canopyM2),
  }));

  const peakPPFD = Math.max(...data.map((r) => r["Supplemental PPFD"] as number));
  const peakDLI = Math.max(...data.map((r) => r["Supplemental DLI"] as number));
  const peakFlux = Math.max(...data.map((r) => r.photonFlux_umol_s as number));
  // µmol/s × seconds × days × 12 months / 1e6 = mol/m²/yr (canopy-zone)
  const annualMolPerM2 = annualPhotonsMolPerM2;

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="card-header">
          <span>Engineering requirement · what the canopy needs (fixture-independent)</span>
        </div>
        <div className="card-body grid grid-cols-2 gap-3 md:grid-cols-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Peak supplemental PPFD</div>
            <div className="text-xl font-semibold">{fmtInt(peakPPFD)} <span className="text-sm font-normal text-ink-500">µmol/m²/s</span></div>
            <div className="text-[11px] text-ink-500">at canopy</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Peak supplemental DLI</div>
            <div className="text-xl font-semibold">{fmt1(peakDLI)} <span className="text-sm font-normal text-ink-500">mol/m²/d</span></div>
            <div className="text-[11px] text-ink-500">target {d.target.targetDLI} − natural</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Peak photon flux</div>
            <div className="text-xl font-semibold">{fmtInt(peakFlux / 1000)} <span className="text-sm font-normal text-ink-500">mmol/s</span></div>
            <div className="text-[11px] text-ink-500">over {fmtInt(canopyM2)} m² canopy</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Annual supplemental</div>
            <div className="text-xl font-semibold">{fmtInt(annualMolPerM2)} <span className="text-sm font-normal text-ink-500">mol/m²/yr</span></div>
            <div className="text-[11px] text-ink-500">total photon delivery required</div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>Active fixture · density & layout</span>
          <span className="text-xs text-ink-500">{d.fixture.label}</span>
        </div>
        <div className="card-body grid grid-cols-2 gap-3 md:grid-cols-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Peak fixture count</div>
            <div className="text-xl font-semibold">{fmtInt(d.peakFixtureCount)}</div>
            <div className="text-[11px] text-ink-500">over {fmtInt(inputs.canopyAreaSqFt)} ft² canopy</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Coverage / fixture</div>
            <div className="text-xl font-semibold">
              {fmt1(d.peakCoveragePerFixtureSqFt)} <span className="text-sm font-normal text-ink-500">ft²</span>
            </div>
            <div className="text-[11px] text-ink-500">{fmt1(d.peakCoveragePerFixtureSqM)} m²</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Grid spacing</div>
            <div className="text-xl font-semibold">{fmt1(d.peakSquareGridSpacingFt)}′</div>
            <div className="text-[11px] text-ink-500">{fmt1(d.peakSquareGridSpacingM)} m square grid</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Density / 100 ft²</div>
            <div className="text-xl font-semibold">{fmt1(d.peakFixturesPer100SqFt)}</div>
            <div className="text-[11px] text-ink-500">{(d.peakFixturesPer100SqFt / 100 / 0.0929).toFixed(2)} / m²</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-500">Lighting density</div>
            <div className="text-xl font-semibold">{fmt1(d.peakWattsPerSqFt)} <span className="text-sm font-normal text-ink-500">W/ft²</span></div>
            <div className="text-[11px] text-ink-500">{fmt1(d.peakWattsPerSqFt * 10.7639)} W/m²</div>
          </div>
        </div>
        <p className="card-body pt-0 text-[11px] text-ink-500">
          Square-grid spacing assumes a uniform layout. Actual greenhouse layouts use rectangular grids (e.g., 4×6′ rather than 5×5′), but the equivalent square-grid edge length is the cleanest single-number planning input.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span>Electrical · per-fixture amperage & branch circuits</span>
          <span className="text-xs text-ink-500">
            {d.fixture.label} · driver range {d.fixture.minVoltage}–{d.fixture.maxVoltage}V · PF {(d.fixture.powerFactor ?? inputs.servicePowerFactor).toFixed(2)}
          </span>
        </div>
        <div className="card-body space-y-3">
          {!d.activeFixtureSupports120V && !d.activeFixtureSupports240V && (
            <div className="rounded border border-warn-500/40 bg-warn-500/10 p-2 text-xs text-warn-500">
              ⚠ This fixture requires {d.fixture.minVoltage}V or higher. Cottage Grove farm has only {inputs.serviceVoltagePrimary}/{inputs.serviceVoltageSecondary}V single-phase — service upgrade needed before specifying.
            </div>
          )}
          {!d.activeFixtureSupports120V && d.activeFixtureSupports240V && (
            <div className="rounded border border-sun-500/40 bg-sun-500/10 p-2 text-xs text-ink-700">
              ℹ Driver requires ≥{d.fixture.minVoltage}V. Will run on the farm's 240V service but <strong>not</strong> on 120V branches — plan dedicated 240V circuits.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-500">Per fixture @ 120V</div>
              <div className="text-xl font-semibold">
                {d.activeFixtureSupports120V ? `${d.peakAmpsPerFixture120V.toFixed(2)} A` : "—"}
              </div>
              <div className="text-[11px] text-ink-500">
                {d.activeFixtureSupports120V ? `${d.fixture.wattsPerFixture}W ÷ 120 ÷ ${(d.fixture.powerFactor ?? 0.95).toFixed(2)} PF` : "Not supported"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-500">Per fixture @ 240V</div>
              <div className="text-xl font-semibold">
                {d.activeFixtureSupports240V ? `${d.peakAmpsPerFixture240V.toFixed(2)} A` : "—"}
              </div>
              <div className="text-[11px] text-ink-500">
                {d.activeFixtureSupports240V ? `${d.fixture.wattsPerFixture}W ÷ 240 ÷ ${(d.fixture.powerFactor ?? 0.95).toFixed(2)} PF` : "Not supported"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-500">Total branch @ 120V</div>
              <div className="text-xl font-semibold">
                {d.activeFixtureSupports120V ? `${fmtInt(d.peakTotalAmps120V)} A` : "—"}
              </div>
              <div className="text-[11px] text-ink-500">
                {d.activeFixtureSupports120V ? `${d.peakCircuits20A_120V} × 20A circuits` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-ink-500">Total branch @ 240V</div>
              <div className="text-xl font-semibold">
                {d.activeFixtureSupports240V ? `${fmtInt(d.peakTotalAmps240V)} A` : "—"}
              </div>
              <div className="text-[11px] text-ink-500">
                {d.activeFixtureSupports240V
                  ? `${d.peakCircuits20A_240V} × 20A or ${d.peakCircuits30A_240V} × 30A`
                  : "—"}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-ink-500">
            Circuit counts apply NEC 80% continuous-load derating: 20A = 16A usable, 30A = 24A usable. Each light circuit must be on its own breaker for safety and the per-circuit count above is the minimum to support the peak month's installed kW. Add spare capacity for inrush, dimming margins, and future expansion.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <span>
            Supplemental PPFD required · target {d.target.targetDLI} DLI · {inputs.flowerPhotoperiodHours}h flower
          </span>
          <span className="text-xs text-ink-500">[µmol/m²/s]</span>
        </div>
        <div className="card-body" style={{ height: 260 }}>
          <ResponsiveContainer>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis stroke="#5b6573" label={{ value: "PPFD µmol/m²/s", angle: -90, position: "insideLeft", fill: "#5b6573" }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Supplemental PPFD">
                {data.map((row, i) => (
                  <Cell
                    key={i}
                    fill={
                      (row["Supplemental PPFD"] as number) > d.target.targetTopCanopyPPFD * 0.7
                        ? "#c0573a"
                        : "#1f6c50"
                    }
                  />
                ))}
              </Bar>
              <ReferenceLine
                y={d.target.targetTopCanopyPPFD}
                stroke="#0d1117"
                strokeDasharray="4 3"
                label={{ value: `${d.target.targetTopCanopyPPFD} target`, fill: "#0d1117", fontSize: 11 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="card-body pt-0 text-[11px] text-ink-500">
          Red bars = supplemental PPFD &gt; 70% of target — months where lighting must do most of the work. Green = comfortable. Reference line is the full top-canopy PPFD target.
        </p>
      </div>

      <div className="card">
        <div className="card-header">
          <span>Supplemental DLI gap · how much daily photon integral the lights must add</span>
          <span className="text-xs text-ink-500">[mol/m²/d]</span>
        </div>
        <div className="card-body" style={{ height: 260 }}>
          <ResponsiveContainer>
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ec" />
              <XAxis dataKey="month" stroke="#5b6573" />
              <YAxis stroke="#5b6573" />
              <Tooltip />
              <Legend />
              <Bar dataKey="Supplemental DLI" fill="#e8b04a" />
              <Line dataKey="Supplemental DLI" stroke="#c0573a" strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine y={d.target.targetDLI} stroke="#0d1117" strokeDasharray="4 3" label={{ value: `${d.target.targetDLI} (full target)`, fill: "#0d1117", fontSize: 11 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* photoperiodSec used implicitly by DLI conversion */}
      {void photoperiodSec}
    </div>
  );
}
