import { solveFixtureGrid } from "../models/fixtureGrid";
import { benchFixturePositions, type BenchLayoutResult } from "../models/benchLayout";

interface Props {
  floorAreaSqFt: number;
  canopyAreaSqFt: number;
  fixtureCount: number;
  gridSpacingFt: number;
  fixtureLabel: string;
  /**
   * Benched mode (optional). When provided and `fits`, the plan view renders
   * the real bench grid + aisles at true house dimensions and aligns the
   * fixture rows to the benches — instead of the area-derived canopy rectangle.
   */
  benchLayout?: BenchLayoutResult | null;
  benchType?: "fixed" | "rolling";
  houseLengthFt?: number;
  houseWidthFt?: number;
}

/**
 * Top-down schematic of the greenhouse. In OPEN layout, geometry is derived
 * from area assuming a 1.5:1 aspect ratio (a schematic, not a drawing). In
 * BENCHED layout it uses the true house dimensions and draws each bench + aisle
 * from the bench solver, with fixtures aligned to bench rows.
 */
export default function GreenhousePlanView({
  floorAreaSqFt,
  canopyAreaSqFt,
  fixtureCount,
  gridSpacingFt,
  fixtureLabel,
  benchLayout,
  benchType,
  houseLengthFt,
  houseWidthFt,
}: Props) {
  const benched =
    !!benchLayout &&
    benchLayout.fits &&
    typeof houseLengthFt === "number" &&
    typeof houseWidthFt === "number" &&
    houseLengthFt > 0 &&
    houseWidthFt > 0;

  // Floor footprint. Benched → true dimensions; open → area @ 1.5:1.
  const ASPECT = 1.5;
  const floorLength = benched ? houseLengthFt! : Math.sqrt(floorAreaSqFt / ASPECT) * ASPECT;
  const floorWidth = benched ? houseWidthFt! : Math.sqrt(floorAreaSqFt / ASPECT);

  // SVG canvas
  const padding = 60;
  const labelHeight = 30;
  const maxWidth = 900;
  const maxHeight = 400;
  const scale = Math.min(
    (maxWidth - padding * 2) / floorLength,
    (maxHeight - padding * 2 - labelHeight) / floorWidth,
  );
  const drawnFloorLengthPx = floorLength * scale;
  const drawnFloorWidthPx = floorWidth * scale;

  const svgWidth = drawnFloorLengthPx + padding * 2;
  const svgHeight = drawnFloorWidthPx + padding * 2 + labelHeight;
  const floorX = padding;
  const floorY = padding + labelHeight;

  // Map bench-local feet (centre origin) → SVG px.
  const fx = (cxFt: number) => floorX + (cxFt + floorLength / 2) * scale;
  const fy = (czFt: number) => floorY + (czFt + floorWidth / 2) * scale;

  // ---- Open-mode canopy rectangle (unchanged legacy path) ----
  const canopyWidth = Math.sqrt(canopyAreaSqFt / ASPECT);
  const canopyLength = canopyWidth * ASPECT;
  const drawnCanopyLengthPx = canopyLength * scale;
  const drawnCanopyWidthPx = canopyWidth * scale;
  const canopyX = floorX + (drawnFloorLengthPx - drawnCanopyLengthPx) / 2;
  const canopyY = floorY + (drawnFloorWidthPx - drawnCanopyWidthPx) / 2;

  const openFixtures: { x: number; y: number }[] = [];
  const openGrid = solveFixtureGrid({
    fixtureCount,
    canopyLengthFt: canopyLength,
    canopyWidthFt: canopyWidth,
    gridSpacingFt,
  });
  if (!benched) {
    const colSpacingPx = drawnCanopyLengthPx / Math.max(1, openGrid.cols);
    const rowSpacingPx = drawnCanopyWidthPx / Math.max(1, openGrid.rows);
    for (let r = 0; r < openGrid.rows; r++) {
      for (let c = 0; c < openGrid.cols; c++) {
        openFixtures.push({
          x: canopyX + colSpacingPx * (c + 0.5),
          y: canopyY + rowSpacingPx * (r + 0.5),
        });
      }
    }
  }

  // Benched-mode fixtures: shared bench-aligned distribution (feet, centred),
  // mapped to SVG px. Same solver the 3D scene uses — no drift.
  const benchFixtures = benched
    ? benchFixturePositions(benchLayout!.benchRects, fixtureCount).map((p) => ({
        x: fx(p.x),
        y: fy(p.z),
      }))
    : [];

  // Scale bar (10 ft)
  const scaleBarFt = 10;
  const scaleBarPx = scaleBarFt * scale;
  const subtitle = benched
    ? `Bench grid at true dimensions — ${benchLayout!.benchCount} × ${benchType ?? "rolling"} benches, fixtures aligned to rows`
    : "Schematic — geometry derived from area assuming 1.5:1 aspect ratio";

  return (
    <div className="overflow-x-auto p-2">
      <svg width={svgWidth} height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="block">
        <defs>
          <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#a8b0bb" strokeWidth="0.7" />
          </pattern>
        </defs>

        {/* Title */}
        <text x={svgWidth / 2} y={20} textAnchor="middle" className="fill-ink-900" fontSize="13" fontWeight="600">
          Top-down plan · {floorLength.toFixed(0)}′ × {floorWidth.toFixed(0)}′ greenhouse · {fixtureCount} × {fixtureLabel}
        </text>
        <text x={svgWidth / 2} y={36} textAnchor="middle" className="fill-ink-500" fontSize="10">
          {subtitle}
        </text>

        {/* Floor outline — in benched mode the floor IS the aisle/negative space */}
        <rect
          x={floorX}
          y={floorY}
          width={drawnFloorLengthPx}
          height={drawnFloorWidthPx}
          fill="url(#hatch)"
          stroke="#0d1117"
          strokeWidth="1.5"
        />
        <text x={floorX + 4} y={floorY + 14} fontSize="10" className="fill-ink-700">
          Floor: {floorLength.toFixed(1)}′ × {floorWidth.toFixed(1)}′ ({floorAreaSqFt.toFixed(0)} ft²)
        </text>

        {benched ? (
          <>
            {/* Benches (canopy) */}
            {benchLayout!.benchRects.map((b, i) => (
              <rect
                key={i}
                x={fx(b.cx) - (b.lengthFt * scale) / 2}
                y={fy(b.cz) - (b.widthFt * scale) / 2}
                width={b.lengthFt * scale}
                height={b.widthFt * scale}
                fill="#2f8f6c33"
                stroke="#1f6c50"
                strokeWidth="1.2"
                rx={benchType === "rolling" ? 3 : 0}
              />
            ))}
            <text
              x={floorX + drawnFloorLengthPx / 2}
              y={floorY + drawnFloorWidthPx + 14}
              textAnchor="middle"
              fontSize="10"
              className="fill-leaf-600"
            >
              Canopy (bench tops): {Math.round(benchLayout!.canopyAreaSqFt).toLocaleString()} ft² ·
              aisle/clearance {Math.round(benchLayout!.aisleAreaSqFt).toLocaleString()} ft²
            </text>
          </>
        ) : (
          <>
            {/* Canopy footprint */}
            <rect
              x={canopyX}
              y={canopyY}
              width={drawnCanopyLengthPx}
              height={drawnCanopyWidthPx}
              fill="#2f8f6c22"
              stroke="#1f6c50"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <text
              x={canopyX + drawnCanopyLengthPx / 2}
              y={canopyY + drawnCanopyWidthPx + 14}
              textAnchor="middle"
              fontSize="10"
              className="fill-leaf-600"
            >
              Canopy: {canopyLength.toFixed(1)}′ × {canopyWidth.toFixed(1)}′ ({canopyAreaSqFt.toFixed(0)} ft²)
            </text>
            {floorWidth - canopyWidth > 0.1 && (
              <text
                x={canopyX + drawnCanopyLengthPx / 2}
                y={canopyY - 6}
                textAnchor="middle"
                fontSize="9"
                className="fill-ink-500"
              >
                ← {((floorWidth - canopyWidth) / 2).toFixed(1)}′ aisle →
              </text>
            )}
          </>
        )}

        {/* Fixture grid */}
        {(benched ? benchFixtures : openFixtures).map((f, i) => (
          <circle key={i} cx={f.x} cy={f.y} r="6" fill="#e8b04a" stroke="#0d1117" strokeWidth="0.6" />
        ))}

        {/* Scale bar */}
        <g transform={`translate(${padding}, ${svgHeight - 18})`}>
          <line x1="0" y1="0" x2={scaleBarPx} y2="0" stroke="#0d1117" strokeWidth="2" />
          <line x1="0" y1="-4" x2="0" y2="4" stroke="#0d1117" strokeWidth="2" />
          <line x1={scaleBarPx} y1="-4" x2={scaleBarPx} y2="4" stroke="#0d1117" strokeWidth="2" />
          <text x={scaleBarPx / 2} y={14} textAnchor="middle" fontSize="10" className="fill-ink-700">
            {scaleBarFt} ft
          </text>
        </g>

        {/* Legend */}
        <g transform={`translate(${svgWidth - 200}, ${svgHeight - 50})`}>
          <circle cx="6" cy="0" r="5" fill="#e8b04a" stroke="#0d1117" strokeWidth="0.6" />
          <text x="16" y="3" fontSize="10" className="fill-ink-700">
            Top-light fixture
          </text>
          <rect x="0" y="10" width="12" height="8" fill="#2f8f6c22" stroke="#1f6c50" strokeWidth="1" strokeDasharray="2 1" />
          <text x="16" y="18" fontSize="10" className="fill-ink-700">
            {benched ? "Bench (canopy)" : "Canopy footprint"}
          </text>
          <rect x="0" y="22" width="12" height="8" fill="url(#hatch)" stroke="#0d1117" strokeWidth="1" />
          <text x="16" y="30" fontSize="10" className="fill-ink-700">
            {benched ? "Aisle / floor" : "Greenhouse floor"}
          </text>
        </g>
      </svg>
      <p className="mt-2 text-[11px] text-ink-500">
        {benched
          ? `${benchLayout!.rows} bench rows × ${benchLayout!.cols} along the run. Rolling benches share one movable aisle; fixed benches keep an aisle per row.`
          : `Grid spacing: ${gridSpacingFt.toFixed(1)}′ square. ${openGrid.rows} rows × ${openGrid.cols} cols populated. Replace with measured site dimensions for procurement-ready layout.`}
      </p>
    </div>
  );
}
