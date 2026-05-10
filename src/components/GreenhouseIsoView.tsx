interface Props {
  floorAreaSqFt: number;
  canopyAreaSqFt: number;
  fixtureCount: number;
  gridSpacingFt: number;
  glazingPct: number;
  /** Actual greenhouse length (ft). When supplied with width, overrides the 1.5:1 aspect heuristic. */
  greenhouseLengthFt?: number;
  greenhouseWidthFt?: number;
  /** Actual eave/peak heights (ft). Defaults to 8/14 when not supplied. */
  eaveHeightFt?: number;
  peakHeightFt?: number;
}

/**
 * Isometric (3D-look) schematic of the greenhouse rendered in pure SVG.
 *
 * Honest framing: this is a *parameterized schematic*, not a WebGL render.
 * The geometry projects from a unit cube using a standard isometric
 * transform. Plants are stylized; fixtures are represented as orange bars
 * hanging from the ridge. Scales with greenhouse and canopy area inputs.
 *
 * Use as a planning aid, not as an architectural drawing.
 */
export default function GreenhouseIsoView({
  floorAreaSqFt,
  canopyAreaSqFt,
  fixtureCount,
  gridSpacingFt,
  glazingPct,
  greenhouseLengthFt,
  greenhouseWidthFt,
  eaveHeightFt,
  peakHeightFt,
}: Props) {
  // Isometric projection: x→ (right-down), y→ (right-up), z→ (up)
  // angle = 30°
  const cos30 = Math.cos(Math.PI / 6);
  const sin30 = Math.sin(Math.PI / 6);
  const project = (x: number, y: number, z: number) => ({
    px: (x - y) * cos30,
    py: (x + y) * sin30 - z,
  });

  // Use explicit dimensions when supplied; otherwise fall back to a 1.5:1
  // aspect heuristic so the schematic still renders for legacy callers.
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
  const eaveHeight = typeof eaveHeightFt === "number" && eaveHeightFt > 0 ? eaveHeightFt : 8;
  // Clamp peak >= eave so an inverted-gable input doesn't produce negative
  // roof angles in the projection.
  const peakHeight = Math.max(
    eaveHeight,
    typeof peakHeightFt === "number" && peakHeightFt > 0 ? peakHeightFt : 14,
  );

  // Canopy footprint inside floor — preserve floor aspect so plants/aisles align.
  const floorAspect = floorLength / Math.max(0.001, floorWidth);
  const canopyWidth = Math.sqrt(canopyAreaSqFt / Math.max(0.001, floorAspect));
  const canopyLength = canopyWidth * floorAspect;
  const canopyOffsetX = (floorLength - canopyLength) / 2;
  const canopyOffsetY = (floorWidth - canopyWidth) / 2;

  // SVG scaling
  const ftPerPx = 1 / 8; // 8 px per foot
  const scale = 1 / ftPerPx;
  const projAndScale = (x: number, y: number, z: number) => {
    const p = project(x, y, z);
    return { px: p.px * scale, py: p.py * scale };
  };

  // Define the 8 corners of the greenhouse (rectangular box with gable roof)
  const c000 = projAndScale(0, 0, 0);
  const c100 = projAndScale(floorLength, 0, 0);
  const c110 = projAndScale(floorLength, floorWidth, 0);
  const c010 = projAndScale(0, floorWidth, 0);
  const c001 = projAndScale(0, 0, eaveHeight);
  const c101 = projAndScale(floorLength, 0, eaveHeight);
  const c111 = projAndScale(floorLength, floorWidth, eaveHeight);
  const c011 = projAndScale(0, floorWidth, eaveHeight);
  const peakNear = projAndScale(floorLength / 2, 0, peakHeight);
  const peakFar = projAndScale(floorLength / 2, floorWidth, peakHeight);

  // Fixtures: lay out on grid hung ~6 ft below ridge. Cols proportional to
  // sqrt(N · canopyAspect), then tightened to ceil(N/rows) so the last row
  // isn't sparse for non-perfectly-fitting fixture counts.
  const fixtureZ = peakHeight - 6;
  const canopyAspect = canopyLength / Math.max(0.001, canopyWidth);
  let cols = Math.max(
    1,
    Math.round(Math.sqrt(Math.max(1, fixtureCount) * canopyAspect)),
  );
  const rows = Math.max(1, Math.ceil(fixtureCount / cols));
  cols = Math.max(1, Math.ceil(fixtureCount / rows));
  const colSpacing = canopyLength / cols;
  const rowSpacing = canopyWidth / rows;
  const fixtures: { x: number; y: number; z: number }[] = [];
  outer: for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (fixtures.length >= fixtureCount) break outer;
      fixtures.push({
        x: canopyOffsetX + colSpacing * (c + 0.5),
        y: canopyOffsetY + rowSpacing * (r + 0.5),
        z: fixtureZ,
      });
    }
  }

  // Plant rows: simple stylized clumps over canopy floor
  const plantsPerRow = Math.max(2, cols);
  const plantRows: { x: number; y: number }[] = [];
  for (let r = 0; r < Math.max(2, rows); r++) {
    for (let c = 0; c < plantsPerRow; c++) {
      plantRows.push({
        x: canopyOffsetX + colSpacing * (c + 0.5),
        y: canopyOffsetY + rowSpacing * (r + 0.5),
      });
    }
  }

  // Compute SVG bounds from all projected points
  const allPoints = [
    c000,
    c100,
    c110,
    c010,
    c001,
    c101,
    c111,
    c011,
    peakNear,
    peakFar,
  ];
  const minX = Math.min(...allPoints.map((p) => p.px));
  const maxX = Math.max(...allPoints.map((p) => p.px));
  const minY = Math.min(...allPoints.map((p) => p.py));
  const maxY = Math.max(...allPoints.map((p) => p.py));
  const margin = 80;
  const titleHeight = 50;
  const w = maxX - minX + margin * 2;
  const h = maxY - minY + margin * 2 + titleHeight;
  const ox = margin - minX;
  const oy = margin - minY + titleHeight;

  const fp = (p: { px: number; py: number }) => ({
    px: p.px + ox,
    py: p.py + oy,
  });
  const path = (...pts: { px: number; py: number }[]) =>
    pts.map((p, i) => `${i === 0 ? "M" : "L"}${fp(p).px},${fp(p).py}`).join(" ") + " Z";

  // Glazing opacity scales with transmission %
  const glazingOpacity = Math.max(0.10, Math.min(0.45, glazingPct / 200));

  return (
    <div className="overflow-x-auto p-2">
      <svg width={Math.min(w, 1100)} height={Math.min(h, 600)} viewBox={`0 0 ${w} ${h}`} className="block">
        <defs>
          <linearGradient id="glazing" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7fb3d5" stopOpacity={glazingOpacity * 1.4} />
            <stop offset="100%" stopColor="#aed6f1" stopOpacity={glazingOpacity} />
          </linearGradient>
          <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6e8ec" />
            <stop offset="100%" stopColor="#d3d7dc" />
          </linearGradient>
        </defs>

        <text
          x={w / 2}
          y={20}
          textAnchor="middle"
          fontSize="13"
          fontWeight="600"
          className="fill-ink-900"
        >
          Isometric schematic · {floorLength.toFixed(0)}′ × {floorWidth.toFixed(0)}′ × {peakHeight.toFixed(0)}′ peak
        </text>
        <text x={w / 2} y={36} textAnchor="middle" fontSize="10" className="fill-ink-500">
          {fixtureCount} top-light fixtures · ≈{(canopyAreaSqFt / Math.max(1, fixtureCount)).toFixed(1)} ft²/fixture · {gridSpacingFt.toFixed(1)}′ grid
        </text>

        {/* Floor (ground) */}
        <path d={path(c000, c100, c110, c010)} fill="url(#ground)" stroke="#5b6573" strokeWidth="1" />

        {/* Canopy footprint highlighted on floor */}
        {(() => {
          const a = projAndScale(canopyOffsetX, canopyOffsetY, 0.05);
          const b = projAndScale(canopyOffsetX + canopyLength, canopyOffsetY, 0.05);
          const c = projAndScale(canopyOffsetX + canopyLength, canopyOffsetY + canopyWidth, 0.05);
          const d = projAndScale(canopyOffsetX, canopyOffsetY + canopyWidth, 0.05);
          return (
            <path d={path(a, b, c, d)} fill="#2f8f6c22" stroke="#1f6c50" strokeWidth="1" strokeDasharray="4 3" />
          );
        })()}

        {/* Plants (simple ellipsoid clumps) */}
        {plantRows.map((p, i) => {
          const base = projAndScale(p.x, p.y, 0);
          const top = projAndScale(p.x, p.y, 3.5);
          const fb = fp(base);
          const ft = fp(top);
          return (
            <g key={`plant-${i}`}>
              <ellipse cx={fb.px} cy={fb.py} rx="6" ry="2.5" fill="#0d1117" opacity="0.15" />
              <ellipse cx={ft.px} cy={ft.py + 2} rx="9" ry="13" fill="#1f6c50" />
              <ellipse cx={ft.px - 2} cy={ft.py - 2} rx="6" ry="9" fill="#2f8f6c" />
            </g>
          );
        })}

        {/* Sidewall glazing — far side first (depth order) */}
        <path d={path(c010, c110, c111, c011)} fill="url(#glazing)" stroke="#5b6573" strokeWidth="0.8" />
        {/* End walls (left = near, right = far) — gable triangle */}
        <path d={path(c000, c010, c011, peakFar, c001)} fill="url(#glazing)" stroke="#5b6573" strokeWidth="0.8" />
        <path d={path(c100, c110, c111, peakFar, c101)} fill="url(#glazing)" stroke="#5b6573" strokeWidth="0.8" />

        {/* Roof — far slope (back of ridge) */}
        <path d={path(c011, c111, peakFar)} fill="url(#glazing)" stroke="#5b6573" strokeWidth="0.8" />
        {/* Roof — near slope (front of ridge) */}
        <path d={path(c001, c101, peakNear)} fill="url(#glazing)" stroke="#5b6573" strokeWidth="0.8" />

        {/* Ridge beam */}
        <line
          x1={fp(peakNear).px}
          y1={fp(peakNear).py}
          x2={fp(peakFar).px}
          y2={fp(peakFar).py}
          stroke="#0d1117"
          strokeWidth="1.5"
        />

        {/* Fixtures hanging from grid */}
        {fixtures.map((f, i) => {
          const top = projAndScale(f.x, f.y, peakHeight - 1);
          const bot = projAndScale(f.x, f.y, f.z);
          // Fixture body — stylized 4ft bar in iso
          const ftLen = 4;
          const a = projAndScale(f.x - ftLen / 2, f.y, f.z);
          const b = projAndScale(f.x + ftLen / 2, f.y, f.z);
          const c = projAndScale(f.x + ftLen / 2, f.y, f.z - 0.3);
          const dd = projAndScale(f.x - ftLen / 2, f.y, f.z - 0.3);
          return (
            <g key={`fx-${i}`}>
              <line
                x1={fp(top).px}
                y1={fp(top).py}
                x2={fp(bot).px}
                y2={fp(bot).py}
                stroke="#5b6573"
                strokeWidth="0.7"
              />
              <path d={path(a, b, c, dd)} fill="#e8b04a" stroke="#0d1117" strokeWidth="0.6" />
              {/* Light cone (subtle) */}
              <line
                x1={fp(bot).px}
                y1={fp(bot).py + 1}
                x2={fp(projAndScale(f.x, f.y, 0.05)).px}
                y2={fp(projAndScale(f.x, f.y, 0.05)).py}
                stroke="#e8b04a"
                strokeWidth="0.4"
                opacity="0.4"
                strokeDasharray="2 3"
              />
            </g>
          );
        })}

        {/* Compass */}
        <g transform={`translate(${w - 80}, ${h - 60})`}>
          <text x="0" y="-30" fontSize="9" textAnchor="middle" className="fill-ink-500">N</text>
          <text x="0" y="20" fontSize="9" textAnchor="middle" className="fill-ink-500">S</text>
          <text x="-25" y="0" fontSize="9" textAnchor="middle" className="fill-ink-500">W</text>
          <text x="25" y="0" fontSize="9" textAnchor="middle" className="fill-ink-500">E</text>
          <line x1="0" y1="-20" x2="0" y2="15" stroke="#5b6573" strokeWidth="0.7" />
          <line x1="-15" y1="0" x2="15" y2="0" stroke="#5b6573" strokeWidth="0.7" />
        </g>
      </svg>
      <p className="mt-2 text-[11px] text-ink-500">
        Schematic isometric. Greenhouse drawn at {floorLength.toFixed(0)}′ × {floorWidth.toFixed(0)}′ × {peakHeight}′ peak height. Fixture meshes are stylized; plant clumps are placeholder geometry. Replace with architectural CAD for procurement-grade renders.
      </p>
    </div>
  );
}
