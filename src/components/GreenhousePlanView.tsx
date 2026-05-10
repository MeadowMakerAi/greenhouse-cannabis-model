interface Props {
  floorAreaSqFt: number;
  canopyAreaSqFt: number;
  fixtureCount: number;
  gridSpacingFt: number;
  fixtureLabel: string;
  /** Actual greenhouse length (ft). When supplied with width, overrides the 1.5:1 aspect heuristic. */
  greenhouseLengthFt?: number;
  greenhouseWidthFt?: number;
}

/**
 * Top-down schematic of the greenhouse with canopy footprint, aisles, and
 * fixture grid. NOT an architectural drawing — when explicit dimensions are
 * not supplied, geometry is derived by assuming a 1.5:1 length:width aspect.
 */
export default function GreenhousePlanView({
  floorAreaSqFt,
  canopyAreaSqFt,
  fixtureCount,
  gridSpacingFt,
  fixtureLabel,
  greenhouseLengthFt,
  greenhouseWidthFt,
}: Props) {
  const ASPECT = 1.5;
  const hasExplicitDims =
    typeof greenhouseLengthFt === "number" &&
    typeof greenhouseWidthFt === "number" &&
    greenhouseLengthFt > 0 &&
    greenhouseWidthFt > 0;
  const floorLength = hasExplicitDims
    ? greenhouseLengthFt!
    : Math.sqrt(floorAreaSqFt / ASPECT) * ASPECT;
  const floorWidth = hasExplicitDims
    ? greenhouseWidthFt!
    : Math.sqrt(floorAreaSqFt / ASPECT);
  // Canopy preserves the floor's actual aspect ratio so plants/aisles align.
  const floorAspect = floorLength / Math.max(0.001, floorWidth);
  const canopyWidth = Math.sqrt(canopyAreaSqFt / Math.max(0.001, floorAspect));
  const canopyLength = canopyWidth * floorAspect;

  // SVG canvas
  const padding = 60;
  const labelHeight = 30;
  const maxWidth = 900;
  const maxHeight = 400;
  const scaleByWidth = (maxWidth - padding * 2) / floorLength;
  const scaleByHeight = (maxHeight - padding * 2 - labelHeight) / floorWidth;
  const scale = Math.min(scaleByWidth, scaleByHeight);
  const drawnFloorLengthPx = floorLength * scale;
  const drawnFloorWidthPx = floorWidth * scale;
  const drawnCanopyLengthPx = canopyLength * scale;
  const drawnCanopyWidthPx = canopyWidth * scale;

  const svgWidth = drawnFloorLengthPx + padding * 2;
  const svgHeight = drawnFloorWidthPx + padding * 2 + labelHeight;

  const floorX = padding;
  const floorY = padding + labelHeight;
  const canopyX = floorX + (drawnFloorLengthPx - drawnCanopyLengthPx) / 2;
  const canopyY = floorY + (drawnFloorWidthPx - drawnCanopyWidthPx) / 2;

  // Lay out fixtures in a grid that matches the canopy's aspect ratio. Old
  // approach picked cols from canopyLength/gridSpacing then capped rows to
  // ceil(N/cols), which collapsed to a single row whenever the grid spacing
  // was small enough that cols >= fixtureCount. New approach picks cols
  // proportional to sqrt(N · aspect), then tightens cols back down to
  // ceil(N/rows) so the last row isn't sparse — e.g., a 60×10 canopy with
  // N=8 was producing 7×2 (last row of 1); now produces 4×2.
  const canopyAspect = canopyLength / Math.max(0.001, canopyWidth);
  let cols = Math.max(
    1,
    Math.round(Math.sqrt(Math.max(1, fixtureCount) * canopyAspect)),
  );
  const rows = Math.max(1, Math.ceil(fixtureCount / cols));
  cols = Math.max(1, Math.ceil(fixtureCount / rows));
  const colSpacingPx = drawnCanopyLengthPx / cols;
  const rowSpacingPx = drawnCanopyWidthPx / rows;
  const fixtures: { x: number; y: number }[] = [];
  outer: for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (fixtures.length >= fixtureCount) break outer;
      fixtures.push({
        x: canopyX + colSpacingPx * (c + 0.5),
        y: canopyY + rowSpacingPx * (r + 0.5),
      });
    }
  }

  // Scale bar (10 ft)
  const scaleBarFt = 10;
  const scaleBarPx = scaleBarFt * scale;

  return (
    <div className="overflow-x-auto p-2">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="block"
      >
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
          Schematic — geometry derived from area assuming 1.5:1 aspect ratio
        </text>

        {/* Floor outline (greenhouse footprint) */}
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

        {/* Aisle indicators (optional) */}
        {(floorWidth - canopyWidth) > 0.1 && (
          <>
            <text
              x={canopyX + drawnCanopyLengthPx / 2}
              y={canopyY - 6}
              textAnchor="middle"
              fontSize="9"
              className="fill-ink-500"
            >
              ←{" "}{((floorWidth - canopyWidth) / 2).toFixed(1)}′ aisle{" "}→
            </text>
          </>
        )}

        {/* Fixture grid */}
        {fixtures.map((f, i) => (
          <g key={i}>
            <circle cx={f.x} cy={f.y} r="6" fill="#e8b04a" stroke="#0d1117" strokeWidth="0.6" />
          </g>
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
            Canopy footprint
          </text>
          <rect x="0" y="22" width="12" height="8" fill="url(#hatch)" stroke="#0d1117" strokeWidth="1" />
          <text x="16" y="30" fontSize="10" className="fill-ink-700">
            Greenhouse floor
          </text>
        </g>
      </svg>
      <p className="mt-2 text-[11px] text-ink-500">
        Grid spacing: {gridSpacingFt.toFixed(1)}′ square. {rows} rows × {cols} cols populated. Replace with measured site dimensions for procurement-ready layout.
      </p>
    </div>
  );
}
