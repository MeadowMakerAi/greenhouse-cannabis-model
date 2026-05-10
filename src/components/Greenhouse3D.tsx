import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, Grid, Environment, Sky } from "@react-three/drei";
import { EffectComposer, Bloom, ToneMapping, Vignette } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import {
  solarDeclinationDeg,
  monthMidDayOfYear,
  solarSunriseHour,
} from "../models/photoperiodModel";
import {
  kelvinToRGB,
  rgbToHex,
  sunKelvinFromElevation,
  skyParamsFromElevation,
} from "../models/kelvinModel";

interface Props {
  floorAreaSqFt: number;
  canopyAreaSqFt: number;
  fixtureCount: number;
  gridSpacingFt: number;
  glazingPct: number;
  latitudeDeg: number;
  /** 0..11, month index for sun position */
  month?: number;
  /** Aspect ratio length:width, defaults to 1.5 */
  aspect?: number;
  /** Eave height in feet */
  eaveHeightFt?: number;
  /** Peak height in feet */
  peakHeightFt?: number;
  /** Greenhouse orientation in degrees (0 = ridge runs east-west) */
  ridgeAzimuthDeg?: number;
  /** Thermal screen deployed (drawn under ridge) */
  thermalScreenActive?: boolean;
  /** Shade cloth deployed (drawn above canopy) */
  shadeActive?: boolean;
  /** Shade transmission % (0-100) */
  shadeTransmissionPct?: number;
  /** Roof vents open */
  roofVentsOpen?: boolean;
  /** Live sun position (azimuth/elevation in degrees from N) — when supplied, overrides month-based sun */
  liveSunAzimuthDeg?: number;
  liveSunElevationDeg?: number;
  /** Lights state — emissive intensity and footprint opacity scale with this */
  lightsDimLevel?: number; // 0..1, defaults to 1
  /** Fog/atmosphere intensity (0=clear, 1=heavy) */
  atmosphereTone?: "day" | "golden" | "twilight" | "night";
  /** Phase-aware plant growth geometry from the sim clock (overrides static height) */
  plantGrowth?: PlantGrowthGeom;
}

// 1 ft = 1 unit in scene; canvas camera distance scales accordingly.

function ThermalScreen({
  length,
  width,
  height,
}: {
  length: number;
  width: number;
  height: number;
}) {
  // Gutter-to-gutter horizontal energy curtain — sits at gutter level, BELOW
  // the rafters/trusses, ABOVE the canopy. Per UMass + Ludvig Svensson refs.
  return (
    <group>
      {/* Curtain track rails along each gutter line */}
      <mesh position={[0, height + 0.08, width / 2 - 0.4]}>
        <boxGeometry args={[length, 0.06, 0.06]} />
        <meshStandardMaterial color="#3d4452" metalness={0.5} />
      </mesh>
      <mesh position={[0, height + 0.08, -width / 2 + 0.4]}>
        <boxGeometry args={[length, 0.06, 0.06]} />
        <meshStandardMaterial color="#3d4452" metalness={0.5} />
      </mesh>
      {/* Cream-colored fabric plane — energy screen typical color */}
      <mesh position={[0, height, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length * 0.95, width * 0.92]} />
        <meshStandardMaterial
          color="#e8e2d2"
          side={THREE.DoubleSide}
          opacity={0.55}
          transparent
          roughness={0.92}
        />
      </mesh>
    </group>
  );
}

function ShadeCloth({
  length,
  width,
  height,
  transmissionPct,
}: {
  length: number;
  width: number;
  height: number;
  transmissionPct: number;
}) {
  // Same gutter-to-gutter installation pattern as thermal screen. Color and
  // opacity reflect knit density (1 - transmission).
  const opacity = Math.min(0.65, Math.max(0.18, 1 - transmissionPct / 100 + 0.1));
  return (
    <group>
      <mesh position={[0, height + 0.05, width / 2 - 0.4]}>
        <boxGeometry args={[length, 0.04, 0.04]} />
        <meshStandardMaterial color="#3d4452" metalness={0.5} />
      </mesh>
      <mesh position={[0, height + 0.05, -width / 2 + 0.4]}>
        <boxGeometry args={[length, 0.04, 0.04]} />
        <meshStandardMaterial color="#3d4452" metalness={0.5} />
      </mesh>
      <mesh position={[0, height, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[length * 0.93, width * 0.90]} />
        <meshStandardMaterial
          color="#5a6a40"
          side={THREE.DoubleSide}
          opacity={opacity}
          transparent
          roughness={0.95}
        />
      </mesh>
    </group>
  );
}

function HAFFan({ position }: { position: [number, number, number] }) {
  // Round housing + propeller hint
  return (
    <group position={position}>
      <mesh>
        <cylinderGeometry args={[1.0, 1.0, 0.4, 16]} />
        <meshStandardMaterial color="#3a3f47" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.05, 0.05, 8, 24]} />
        <meshStandardMaterial color="#1a1d22" />
      </mesh>
      {/* Propeller cross */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <boxGeometry args={[1.7, 0.08, 0.15]} />
        <meshStandardMaterial color="#9aa39c" metalness={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, Math.PI / 2]}>
        <boxGeometry args={[1.7, 0.08, 0.15]} />
        <meshStandardMaterial color="#9aa39c" metalness={0.4} />
      </mesh>
    </group>
  );
}

function RoofVent({
  ventWidth,
  ventPanelLength,
  ridgeX,
  ridgeY,
  ridgeZ,
  slopeAngleRad,
  open,
  side,
}: {
  ventWidth: number;
  /** Panel length along the roof slope (downhill from ridge) */
  ventPanelLength: number;
  /** Ridge hinge position in scene coords */
  ridgeX: number;
  ridgeY: number;
  ridgeZ: number;
  /** Roof slope angle from horizontal (positive = ridge to eave going down) */
  slopeAngleRad: number;
  open: boolean;
  /** "south" = +z slope, "north" = −z slope */
  side: "south" | "north";
}) {
  // Atrium-style continuous ridge vent. Hinge sits at the ridge. Closed: flush
  // on the roof slope (rotated by ±slopeAngleRad). Open: rotates outward an
  // additional ~38° (commercial ridge vents typically 30–45°).
  // Each leaf opens AWAY from the ridge centerline — north leaf rotates one
  // way, south leaf the opposite — so together they form an inverted-V opening.
  const fullyOpenDeg = 38;
  const openRad = open ? (fullyOpenDeg * Math.PI) / 180 : 0;
  // Sign convention:
  //   Closed south leaf: rotation about X = +slopeAngleRad (panel goes +z, downhill)
  //   Closed north leaf: rotation about X = -slopeAngleRad (panel goes -z)
  //   Open: rotate further away from horizontal (lifting the outer edge up)
  const sign = side === "south" ? 1 : -1;
  const closedAngle = sign * slopeAngleRad;
  const openedAngle = closedAngle - sign * openRad; // outer edge lifts upward
  return (
    <group position={[ridgeX, ridgeY, ridgeZ]}>
      <group rotation={[openedAngle, 0, 0]}>
        {/* Panel extends from ridge outward along the slope (+y in local) */}
        <mesh position={[0, ventPanelLength / 2, 0]} castShadow>
          <planeGeometry args={[ventWidth, ventPanelLength]} />
          <meshPhysicalMaterial
            color="#d4eaf6"
            transparent
            opacity={0.55}
            transmission={0.7}
            thickness={0.2}
            roughness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
        {/* Hinge bar at ridge — the operator linkage on real continuous ridge
         * vents is concealed inside the gutter rail or end-cap; we don't
         * render decorative struts because they read as visual clutter
         * when 10+ segments × 2 leaves are open simultaneously. */}
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[ventWidth, 0.05, 0.05]} />
          <meshStandardMaterial color="#3d4452" />
        </mesh>
      </group>
    </group>
  );
}

function GreenhouseStructure({
  length,
  width,
  eave,
  peak,
  thermalScreenActive,
  shadeActive,
  shadeTransmissionPct,
  roofVentsOpen,
}: {
  length: number;
  width: number;
  eave: number;
  peak: number;
  thermalScreenActive?: boolean;
  shadeActive?: boolean;
  shadeTransmissionPct?: number;
  roofVentsOpen?: boolean;
}) {
  // Truss spacing — typical greenhouse 6-8 ft
  const trussSpacing = 6;
  const trussCount = Math.max(2, Math.floor(length / trussSpacing) + 1);

  const trusses = [];
  for (let i = 0; i < trussCount; i++) {
    const x = (i / (trussCount - 1)) * length - length / 2;
    trusses.push(x);
  }

  return (
    <group>
      {/* Foundation/curb (concrete) */}
      <mesh position={[0, 0.25, 0]} receiveShadow>
        <boxGeometry args={[length + 0.5, 0.5, width + 0.5]} />
        <meshStandardMaterial color="#8a8d92" roughness={0.9} />
      </mesh>

      {/* Sidewall glazing — far (north) wall */}
      <mesh position={[0, eave / 2 + 0.5, width / 2]}>
        <planeGeometry args={[length, eave]} />
        <meshPhysicalMaterial
          color="#cfe9f7"
          transparent
          opacity={0.35}
          roughness={0.05}
          metalness={0}
          transmission={0.85}
          thickness={0.3}
          ior={1.45}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Sidewall glazing — near (south) wall */}
      <mesh position={[0, eave / 2 + 0.5, -width / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[length, eave]} />
        <meshPhysicalMaterial
          color="#cfe9f7"
          transparent
          opacity={0.35}
          transmission={0.85}
          thickness={0.3}
          ior={1.45}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* End wall — east (with door cutout via overlay box) */}
      <EndGable
        length={width}
        eave={eave}
        peak={peak}
        position={[length / 2, 0.5, 0]}
        rotationY={-Math.PI / 2}
      />
      {/* End wall — west */}
      <EndGable
        length={width}
        eave={eave}
        peak={peak}
        position={[-length / 2, 0.5, 0]}
        rotationY={Math.PI / 2}
      />

      {/* Roof — south slope */}
      <RoofPanel
        width={width / 2}
        length={length}
        eave={eave}
        peak={peak}
        side="south"
      />
      {/* Roof — north slope */}
      <RoofPanel
        width={width / 2}
        length={length}
        eave={eave}
        peak={peak}
        side="north"
      />

      {/* Ridge beam */}
      <mesh position={[0, peak + 0.5, 0]}>
        <boxGeometry args={[length, 0.25, 0.25]} />
        <meshStandardMaterial color="#3d4452" />
      </mesh>

      {/* Trusses (rafters) */}
      {trusses.map((x, i) => (
        <Truss key={i} x={x} width={width} eave={eave} peak={peak} />
      ))}

      {/* Eave gutters */}
      <mesh position={[0, eave + 0.5, width / 2]}>
        <boxGeometry args={[length, 0.2, 0.3]} />
        <meshStandardMaterial color="#2c3744" />
      </mesh>
      <mesh position={[0, eave + 0.5, -width / 2]}>
        <boxGeometry args={[length, 0.2, 0.3]} />
        <meshStandardMaterial color="#2c3744" />
      </mesh>

      {/* Heating pipes along each eave (steel fin-tube radiator) */}
      <mesh position={[0, 1.2, width / 2 - 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15, 0.15, length - 1, 12]} />
        <meshStandardMaterial color="#7a3a2a" roughness={0.7} metalness={0.5} />
      </mesh>
      <mesh position={[0, 1.2, -width / 2 + 0.5]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.15, 0.15, length - 1, 12]} />
        <meshStandardMaterial color="#7a3a2a" roughness={0.7} metalness={0.5} />
      </mesh>

      {/* HAF fans on each end gable, mid-height */}
      <HAFFan position={[length / 2 - 1.2, eave * 0.7 + 0.5, width / 4]} />
      <HAFFan position={[length / 2 - 1.2, eave * 0.7 + 0.5, -width / 4]} />
      <HAFFan position={[-length / 2 + 1.2, eave * 0.7 + 0.5, width / 4]} />
      <HAFFan position={[-length / 2 + 1.2, eave * 0.7 + 0.5, -width / 4]} />

      {/* Atrium-style continuous ridge vent — paired leaves on both slopes.
       * Each leaf hinges at the ridge and lifts ~38° outward when open.
       * Commercial dimensions: 4 ft along-slope, ~85% of segment width along
       * the ridge to leave room for hinge brackets between segments. Real
       * continuous ridge vents (Stuppy, GreenTek, Nexus) span the full length.
       * Stack-effect ventilation: ΔP ≈ ρ·g·(peak−eave)·ΔT/T → primary passive
       * cooling driver in summer when paired with sidewall vents. */}
      {(() => {
        const ventCount = Math.max(2, Math.floor(length / 8));
        const ventStep = length / ventCount;
        const ventSegmentLen = ventStep * 0.88;
        const ventPanelLength = 4; // ft, along-slope (commercial 3-5 ft typical)
        const slopeAngleRad = Math.atan2(peak - eave, width / 2);
        const ridgeY = peak + 0.45;
        const leaves: React.ReactNode[] = [];
        for (let i = 0; i < ventCount; i++) {
          const x = -length / 2 + ventStep * (i + 0.5);
          leaves.push(
            <RoofVent
              key={`s-${i}`}
              ventWidth={ventSegmentLen}
              ventPanelLength={ventPanelLength}
              ridgeX={x}
              ridgeY={ridgeY}
              ridgeZ={0}
              slopeAngleRad={slopeAngleRad}
              open={!!roofVentsOpen}
              side="south"
            />,
            <RoofVent
              key={`n-${i}`}
              ventWidth={ventSegmentLen}
              ventPanelLength={ventPanelLength}
              ridgeX={x}
              ridgeY={ridgeY}
              ridgeZ={0}
              slopeAngleRad={slopeAngleRad}
              open={!!roofVentsOpen}
              side="north"
            />,
          );
        }
        return leaves;
      })()}

      {/* Thermal screen at gutter level — horizontal, below trusses, above
       * canopy. Per UMass + Ludvig Svensson: gutter-to-gutter installation. */}
      {thermalScreenActive && (
        <ThermalScreen length={length} width={width} height={eave - 0.15} />
      )}

      {/* Shade cloth slightly above thermal at gutter level — same install
       * pattern. When both are deployed they sit on adjacent tracks. */}
      {shadeActive && (
        <ShadeCloth
          length={length}
          width={width}
          height={eave + 0.4}
          transmissionPct={shadeTransmissionPct ?? 70}
        />
      )}
    </group>
  );
}

function EndGable({
  length,
  eave,
  peak,
  position,
  rotationY,
}: {
  length: number;
  eave: number;
  peak: number;
  position: [number, number, number];
  rotationY: number;
}) {
  // Build a vertical wall + triangular gable as one geometry
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-length / 2, 0);
    s.lineTo(length / 2, 0);
    s.lineTo(length / 2, eave);
    s.lineTo(0, peak);
    s.lineTo(-length / 2, eave);
    s.closePath();
    return s;
  }, [length, eave, peak]);

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh>
        <shapeGeometry args={[shape]} />
        <meshPhysicalMaterial
          color="#cfe9f7"
          transparent
          opacity={0.4}
          transmission={0.8}
          thickness={0.3}
          roughness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Door silhouette on west wall only (flag via rotation) */}
      {rotationY > 0 && (
        <mesh position={[0, 1.5, 0.05]}>
          <planeGeometry args={[3, 7]} />
          <meshStandardMaterial color="#1a2230" side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function RoofPanel({
  width,
  length,
  eave,
  peak,
  side,
}: {
  width: number;
  length: number;
  eave: number;
  peak: number;
  side: "north" | "south";
}) {
  // Slope from eave to peak
  const slopeLength = Math.sqrt(width * width + (peak - eave) * (peak - eave));
  const angle = Math.atan2(peak - eave, width);
  const z = side === "south" ? -width / 2 : width / 2;
  const yPos = (eave + peak) / 2 + 0.5;
  const rot: [number, number, number] =
    side === "south" ? [angle, 0, 0] : [-angle, 0, 0];
  const localZ = side === "south" ? width / 4 : -width / 4;

  return (
    <mesh position={[0, yPos, z + localZ]} rotation={rot}>
      <planeGeometry args={[length, slopeLength]} />
      <meshPhysicalMaterial
        color="#cfe9f7"
        transparent
        opacity={0.35}
        transmission={0.85}
        thickness={0.3}
        roughness={0.05}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

function Truss({
  x,
  width,
  eave,
  peak,
}: {
  x: number;
  width: number;
  eave: number;
  peak: number;
}) {
  // Two diagonal rafters from eaves to peak, plus vertical kingpost
  const points = useMemo(() => {
    return [
      new THREE.Vector3(x, eave + 0.5, -width / 2),
      new THREE.Vector3(x, peak + 0.5, 0),
      new THREE.Vector3(x, eave + 0.5, width / 2),
    ];
  }, [x, width, eave, peak]);
  const rafterGeom = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    return g;
  }, [points]);

  return (
    <group>
      <line>
        <primitive object={rafterGeom} attach="geometry" />
        <lineBasicMaterial color="#3d4452" linewidth={2} />
      </line>
      {/* Tie beam */}
      <mesh position={[x, eave + 0.5, 0]}>
        <boxGeometry args={[0.15, 0.15, width]} />
        <meshStandardMaterial color="#3d4452" />
      </mesh>
    </group>
  );
}

function FixtureMesh({
  length,
  width,
  dimLevel = 1,
}: {
  length: number;
  width: number;
  dimLevel?: number;
}) {
  const bars = Math.max(2, Math.round(length / 1.0));
  const barWidth = (length / bars) * 0.85;
  const barOffset = length / bars;
  const emissive = 1.8 * Math.max(0, Math.min(1, dimLevel));
  return (
    <group>
      <mesh position={[0, 0.12, 0]}>
        <boxGeometry args={[length, 0.18, width]} />
        <meshStandardMaterial color="#3a3f47" metalness={0.7} roughness={0.55} />
      </mesh>
      <mesh position={[length / 2 + 0.15, 0.05, 0]}>
        <boxGeometry args={[0.3, 0.18, width * 0.9]} />
        <meshStandardMaterial color="#1a1d22" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[-length / 2 - 0.15, 0.05, 0]}>
        <boxGeometry args={[0.3, 0.18, width * 0.9]} />
        <meshStandardMaterial color="#1a1d22" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[length, 0.08, width]} />
        <meshStandardMaterial color="#2a2a2a" metalness={0.7} roughness={0.4} />
      </mesh>
      {Array.from({ length: bars }).map((_, i) => {
        const x = -length / 2 + barOffset * (i + 0.5);
        return (
          <mesh key={i} position={[x, -0.045, 0]}>
            <boxGeometry args={[barWidth, 0.02, width * 0.78]} />
            <meshStandardMaterial
              color={dimLevel > 0 ? "#fff4d6" : "#3a3a3a"}
              emissive={dimLevel > 0 ? "#ffe6a0" : "#000000"}
              emissiveIntensity={emissive}
              roughness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Fixtures({
  positions,
  fixtureLength = 4,
  fixtureWidth = 1.4,
  hangHeight,
  ridgeHeight,
  cableLengthFt = 1.5,
  dimLevel = 1,
}: {
  positions: { x: number; z: number }[];
  fixtureLength?: number;
  fixtureWidth?: number;
  hangHeight: number;
  ridgeHeight: number;
  /** Length of hanger cable in ft. Real fixtures hang on 1-2 ft chains/cables, not all the way to ridge. */
  cableLengthFt?: number;
  dimLevel?: number;
}) {
  // Per-fixture cable-to-rafter geometry. Cables are short hangers attaching
  // the fixture to the truss/rafter above — NOT continuous all the way to the
  // ridge. Cap at min(cableLengthFt, ridgeHeight - hangHeight - 0.5) to ensure
  // the cable never pokes through the roof for low-peak greenhouses.
  const cableTopY = Math.min(
    cableLengthFt,
    Math.max(0.3, ridgeHeight - hangHeight - 0.5),
  );
  const cableGeom = useMemo(() => {
    const verts = new Float32Array([
      -fixtureLength / 2 + 0.3, 0.1, -fixtureWidth / 2 + 0.2,
      -fixtureLength / 2 + 0.3, cableTopY, -fixtureWidth / 2 + 0.2,
      fixtureLength / 2 - 0.3, 0.1, -fixtureWidth / 2 + 0.2,
      fixtureLength / 2 - 0.3, cableTopY, -fixtureWidth / 2 + 0.2,
      -fixtureLength / 2 + 0.3, 0.1, fixtureWidth / 2 - 0.2,
      -fixtureLength / 2 + 0.3, cableTopY, fixtureWidth / 2 - 0.2,
      fixtureLength / 2 - 0.3, 0.1, fixtureWidth / 2 - 0.2,
      fixtureLength / 2 - 0.3, cableTopY, fixtureWidth / 2 - 0.2,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
    return g;
  }, [fixtureLength, fixtureWidth, cableTopY]);

  return (
    <group>
      {positions.map((p, i) => (
        <group key={i} position={[p.x, hangHeight, p.z]}>
          <FixtureMesh length={fixtureLength} width={fixtureWidth} dimLevel={dimLevel} />
          <lineSegments>
            <primitive object={cableGeom} attach="geometry" />
            <lineBasicMaterial color="#9aa39c" />
          </lineSegments>
        </group>
      ))}
    </group>
  );
}

function buildFrustumGeometry(
  fixtureLengthFt: number,
  fixtureWidthFt: number,
  footprintLength: number,
  footprintWidth: number,
  height: number,
): THREE.BufferGeometry {
  const verts = new Float32Array([
    // Top (smaller — the fixture)
    -fixtureLengthFt / 2, 0, -fixtureWidthFt / 2,
    fixtureLengthFt / 2, 0, -fixtureWidthFt / 2,
    fixtureLengthFt / 2, 0, fixtureWidthFt / 2,
    -fixtureLengthFt / 2, 0, fixtureWidthFt / 2,
    // Bottom (larger — the canopy footprint)
    -footprintLength / 2, -height, -footprintWidth / 2,
    footprintLength / 2, -height, -footprintWidth / 2,
    footprintLength / 2, -height, footprintWidth / 2,
    -footprintLength / 2, -height, footprintWidth / 2,
  ]);
  const idx = new Uint16Array([
    0, 4, 1, 1, 4, 5,
    1, 5, 2, 2, 5, 6,
    2, 6, 3, 3, 6, 7,
    3, 7, 0, 0, 7, 4,
    4, 5, 6, 4, 6, 7,
  ]);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(verts, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

function LightFootprint({
  position,
  geometry,
  opacity = 0.13,
}: {
  position: [number, number, number];
  geometry: THREE.BufferGeometry;
  opacity?: number;
}) {
  return (
    <mesh position={position}>
      <primitive object={geometry} attach="geometry" />
      <meshBasicMaterial
        color="#ffe6a0"
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function LightFootprints({
  positions,
  fixtureZ,
  canopyZ,
  footprintLength,
  footprintWidth,
  dimLevel = 1,
}: {
  positions: { x: number; z: number }[];
  fixtureZ: number;
  canopyZ: number;
  footprintLength: number;
  footprintWidth: number;
  dimLevel?: number;
}) {
  const geometry = useMemo(
    () =>
      buildFrustumGeometry(
        footprintLength * 0.4,
        footprintWidth * 0.4,
        footprintLength,
        footprintWidth,
        fixtureZ - canopyZ,
      ),
    [footprintLength, footprintWidth, fixtureZ, canopyZ],
  );
  if (dimLevel <= 0.001) return null;
  return (
    <group>
      {positions.map((p, i) => (
        <LightFootprint
          key={i}
          position={[p.x, fixtureZ, p.z]}
          geometry={geometry}
          opacity={0.13 * dimLevel}
        />
      ))}
    </group>
  );
}

interface PlantGrowthGeom {
  phase: "clone" | "veg" | "flower-stretch" | "flower-mid" | "flower-late";
  heightFt: number;
  foliageRadiusFt: number;
  colaCount: number;
  colaSizeFt: number;
  colaDevelopment: number;
  foliageHueDeg: number;
  foliageSat: number;
  foliageLight: number;
}

/**
 * Cannabis plant geometry. Built from real anatomy (not a green orb):
 *
 *  - Central stalk, woody texture, taper top
 *  - 4–5 node tiers along the stalk, each producing a pair of opposing
 *    branches (vegetative phyllotaxy)
 *  - Each branch ends in a palmate fan leaf cluster — 5–7 elongated
 *    leaflet cones radiating outward (cannabis sativa/indica fan-leaf
 *    pattern, 5–7 fingers typical)
 *  - Apical meristem at top: in veg = a vegetative tip + small leaves;
 *    in flower = main cola (vertical cone with trichome shimmer)
 *  - Lateral colas at each branch node in flower phases
 *
 * All scale params come from PlantGrowthGeom — height, foliageRadius,
 * colaCount, colaDevelopment all advance with sim time.
 */
function FanLeafCluster({
  position,
  rotationY,
  size,
  color,
  rng,
}: {
  position: [number, number, number];
  rotationY: number;
  /** Overall cluster radius in feet */
  size: number;
  color: string;
  rng: (n: number) => number;
}) {
  // Cannabis fan leaf: 5–7 elongated palmate leaflets. Each leaflet ≈ thin
  // cone (length ≈ size × 1.0, base ≈ size × 0.18). Center leaflet longest,
  // outer leaflets shorter — classic palmate gradient.
  const leaflets = 5 + Math.round(rng(70) * 2); // 5–7
  const tilt = -Math.PI / 6; // leaflets pitch slightly upward from horizontal
  const leafLen = size;
  const leafThick = size * 0.16;
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      {Array.from({ length: leaflets }).map((_, i) => {
        const t = leaflets === 1 ? 0 : i / (leaflets - 1) - 0.5; // -0.5..0.5
        // Spread leaflets in a fan ±50°. Center leaflet longer.
        const fanAng = t * (Math.PI * 0.55);
        const lenScale = 1 - Math.abs(t) * 0.55; // outer leaflets ~45% of center
        return (
          <mesh
            key={i}
            position={[0, 0, 0]}
            rotation={[tilt, 0, fanAng]}
          >
            {/* Each leaflet rendered as a stretched cone pointing +Y in local */}
            <coneGeometry args={[leafThick, leafLen * lenScale, 5]} />
            <meshStandardMaterial color={color} roughness={0.92} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

function CannabisPlant({
  position,
  growth,
  seed,
}: {
  position: [number, number, number];
  growth: PlantGrowthGeom;
  seed: number;
}) {
  // Deterministic per-plant variation from seed
  const r = (n: number) => {
    const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };

  const height = growth.heightFt;
  const foliageR = growth.foliageRadiusFt;
  const stalkRadiusBase = Math.max(0.045, 0.05 + height * 0.022);
  const stalkRadiusTop = Math.max(0.025, stalkRadiusBase * 0.4);

  const fanLeafColor = `hsl(${growth.foliageHueDeg + (r(9) - 0.5) * 8}, ${
    growth.foliageSat + (r(10) - 0.5) * 6
  }%, ${growth.foliageLight + (r(11) - 0.5) * 6}%)`;
  const fanLeafColorLight = `hsl(${growth.foliageHueDeg + 6}, ${
    growth.foliageSat + 6
  }%, ${Math.min(55, growth.foliageLight + 12)}%)`;
  const colaColor = `hsl(${growth.foliageHueDeg - 8}, ${
    growth.foliageSat + 6
  }%, ${growth.foliageLight + 6}%)`;
  const stalkColor = `hsl(${growth.foliageHueDeg - 25}, 28%, ${
    Math.max(22, growth.foliageLight - 4)
  }%)`;

  // Clone phase: tiny seedling. Stem + 2 cotyledons + 1 small fan-leaf cluster.
  if (growth.phase === "clone") {
    return (
      <group position={position}>
        <mesh position={[0, height / 2, 0]}>
          <cylinderGeometry args={[0.018, 0.028, height, 6]} />
          <meshStandardMaterial color="#7d8b3a" roughness={0.95} />
        </mesh>
        {/* Cotyledons (first round leaves) */}
        {[0, Math.PI].map((ang, i) => (
          <mesh
            key={i}
            position={[Math.cos(ang) * 0.08, height * 0.45, Math.sin(ang) * 0.08]}
            rotation={[Math.PI / 2.5, ang, 0]}
          >
            <sphereGeometry args={[0.07, 6, 4]} />
            <meshStandardMaterial color="#88a045" roughness={0.95} />
          </mesh>
        ))}
        {/* First true fan-leaf set at the apex */}
        <FanLeafCluster
          position={[0, height, 0]}
          rotationY={r(1) * Math.PI}
          size={Math.max(0.18, foliageR * 0.7)}
          color={fanLeafColorLight}
          rng={r}
        />
      </group>
    );
  }

  // Determine node count based on plant size — taller plants have more tiers.
  const tierCount = Math.max(3, Math.min(6, Math.round(2 + height * 0.6)));
  const tiers: { y: number; branchLen: number; tierFrac: number }[] = [];
  for (let i = 0; i < tierCount; i++) {
    // Skip the bottom 20% (bare stalk near base), distribute the rest evenly
    const tierFrac = 0.22 + (i / Math.max(1, tierCount - 1)) * 0.78;
    // Branches longer in the middle, shorter at top + bottom
    const triangle = 1 - Math.abs(tierFrac - 0.55) * 1.4;
    const branchLen = Math.max(0.25, foliageR * (0.5 + triangle * 0.5));
    tiers.push({ y: height * tierFrac, branchLen, tierFrac });
  }

  const isFlower =
    growth.phase === "flower-stretch" ||
    growth.phase === "flower-mid" ||
    growth.phase === "flower-late";
  const trichomeAlpha = 0.5 + 0.4 * Math.min(1, growth.colaDevelopment);

  return (
    <group position={position}>
      {/* Central stalk — woody at base, greener at top */}
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[stalkRadiusTop, stalkRadiusBase, height, 7]} />
        <meshStandardMaterial color={stalkColor} roughness={0.95} />
      </mesh>

      {/* Branches + fan leaves at each node tier. Cannabis has opposite (then
       * alternate) phyllotaxy — pair of opposing branches per tier with a
       * 90° rotation between consecutive tiers (decussate → alternate).
       * Each branch is rendered inside a yaw-rotated <group>, so the local
       * frame is "+X = outward, +Y = up". A simple Z-axis tilt then leans
       * the branch upward toward the light. */}
      {tiers.map((tier, ti) => {
        const baseAng = (ti % 2 === 0 ? 0 : Math.PI / 2) + r(80 + ti) * 0.4;
        return [0, Math.PI].map((branchAng, bi) => {
          const ang = baseAng + branchAng;
          const branchHoriz = tier.branchLen;
          const branchRise = tier.branchLen * 0.18; // apical dominance lift
          const branchTotalLen = Math.sqrt(
            branchHoriz * branchHoriz + branchRise * branchRise,
          );
          // Tilt from horizontal: positive angle lifts the tip upward.
          // In the local yaw-rotated frame, branch goes outward along +X
          // and up along +Y. A cylinder default is +Y; we rotate it by
          // (90° − tilt) around Z so it lies along the branch vector.
          const tiltFromHoriz = Math.atan2(branchRise, branchHoriz);
          const cylRotZ = -(Math.PI / 2 - tiltFromHoriz);
          const branchRBase = Math.max(0.018, stalkRadiusTop * 0.7);
          const branchRTip = Math.max(0.012, branchRBase * 0.55);
          const leafSize = Math.max(0.22, tier.branchLen * 0.85);
          const showLateralCola =
            isFlower && tier.tierFrac > 0.55 && bi < Math.max(0, growth.colaCount - 1);
          const colaSize = growth.colaSizeFt * (0.7 + r(90 + ti * 2 + bi) * 0.25);
          return (
            <group key={`${ti}-${bi}`} position={[0, tier.y, 0]} rotation={[0, ang, 0]}>
              {/* Branch cylinder — local frame: outward = +X, up = +Y.
                  Place midpoint at half the branch in local +X/+Y, rotate
                  Y-cylinder onto branch vector. */}
              <mesh
                position={[branchHoriz / 2, branchRise / 2, 0]}
                rotation={[0, 0, cylRotZ]}
              >
                <cylinderGeometry args={[branchRTip, branchRBase, branchTotalLen, 5]} />
                <meshStandardMaterial color={stalkColor} roughness={0.95} />
              </mesh>
              {/* Fan-leaf cluster at the tip — back into world coords */}
              <group position={[branchHoriz, branchRise, 0]}>
                <FanLeafCluster
                  position={[0, 0, 0]}
                  rotationY={0}
                  size={leafSize}
                  color={tier.tierFrac > 0.7 ? fanLeafColorLight : fanLeafColor}
                  rng={r}
                />
              </group>
              {/* Lateral cola at upper branches in flower */}
              {showLateralCola && (
                <group position={[branchHoriz, branchRise + colaSize * 0.5, 0]}>
                  <mesh>
                    <coneGeometry
                      args={[Math.max(0.06, colaSize * 1.0), Math.max(0.16, colaSize * 2.4), 7]}
                    />
                    <meshStandardMaterial color={colaColor} roughness={0.85} />
                  </mesh>
                  <mesh scale={[0.92, 0.92, 0.92]} position={[0, 0.04, 0]}>
                    <coneGeometry
                      args={[Math.max(0.05, colaSize * 0.85), Math.max(0.12, colaSize * 1.7), 7]}
                    />
                    <meshStandardMaterial
                      color={`hsl(${growth.foliageHueDeg - 10}, ${
                        Math.max(20, growth.foliageSat - 12)
                      }%, ${Math.min(72, growth.foliageLight + 24)}%)`}
                      roughness={0.55}
                      metalness={0.05}
                      transparent
                      opacity={trichomeAlpha}
                    />
                  </mesh>
                </group>
              )}
            </group>
          );
        });
      })}

      {/* Apical meristem — main cola in flower, vegetative tip + leaves in veg */}
      {isFlower ? (
        <group position={[0, height + growth.colaSizeFt * 0.3, 0]}>
          <mesh>
            <coneGeometry
              args={[
                Math.max(0.1, growth.colaSizeFt * 1.4),
                Math.max(0.3, growth.colaSizeFt * 3.2),
                8,
              ]}
            />
            <meshStandardMaterial color={colaColor} roughness={0.85} />
          </mesh>
          {/* Main-cola trichome shimmer */}
          <mesh scale={[0.94, 0.94, 0.94]} position={[0, 0.06, 0]}>
            <coneGeometry
              args={[
                Math.max(0.08, growth.colaSizeFt * 1.18),
                Math.max(0.22, growth.colaSizeFt * 2.4),
                8,
              ]}
            />
            <meshStandardMaterial
              color={`hsl(${growth.foliageHueDeg - 12}, ${
                Math.max(22, growth.foliageSat - 12)
              }%, ${Math.min(72, growth.foliageLight + 26)}%)`}
              roughness={0.5}
              metalness={0.05}
              transparent
              opacity={trichomeAlpha}
            />
          </mesh>
        </group>
      ) : (
        <FanLeafCluster
          position={[0, height + 0.05, 0]}
          rotationY={r(99) * Math.PI}
          size={Math.max(0.25, foliageR * 0.55)}
          color={fanLeafColorLight}
          rng={r}
        />
      )}
    </group>
  );
}

function CanopyAndPlants({
  canopyOffsetX,
  canopyOffsetZ,
  canopyLength,
  canopyWidth,
  rows,
  cols,
  plantHeight,
  plantGrowth,
}: {
  canopyOffsetX: number;
  canopyOffsetZ: number;
  canopyLength: number;
  canopyWidth: number;
  rows: number;
  cols: number;
  plantHeight: number;
  plantGrowth?: PlantGrowthGeom;
}) {
  const colSpacing = canopyLength / cols;
  const rowSpacing = canopyWidth / rows;
  const plants: { x: number; z: number; seed: number }[] = [];
  let id = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      plants.push({
        x: canopyOffsetX + colSpacing * (c + 0.5),
        z: canopyOffsetZ + rowSpacing * (r + 0.5),
        seed: id++,
      });
    }
  }

  // Aisle stripes between plant rows
  const aisleWidth = Math.max(0.4, rowSpacing * 0.15);

  return (
    <group>
      {/* Canopy floor highlight */}
      <mesh
        position={[
          canopyOffsetX + canopyLength / 2,
          0.55,
          canopyOffsetZ + canopyWidth / 2,
        ]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[canopyLength, canopyWidth]} />
        <meshStandardMaterial color="#2a4d3a" opacity={0.6} transparent />
      </mesh>
      {/* Aisle stripes (lighter colored paths between rows) */}
      {Array.from({ length: rows + 1 }).map((_, r) => {
        const z = canopyOffsetZ + rowSpacing * r;
        return (
          <mesh
            key={`aisle-${r}`}
            position={[canopyOffsetX + canopyLength / 2, 0.56, z]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[canopyLength, aisleWidth]} />
            <meshStandardMaterial color="#a8a395" roughness={0.95} opacity={0.85} transparent />
          </mesh>
        );
      })}
      {/* Plants — phase-aware geometry from sim clock if provided, else static. */}
      {plants.map((p, i) => {
        const fallbackGrowth: PlantGrowthGeom = {
          phase: "flower-mid",
          heightFt: plantHeight,
          foliageRadiusFt: Math.min(1.6, plantHeight * 0.55),
          colaCount: 5,
          colaSizeFt: 0.25,
          colaDevelopment: 0.6,
          foliageHueDeg: 122,
          foliageSat: 48,
          foliageLight: 32,
        };
        return (
          <CannabisPlant
            key={i}
            position={[p.x, 0.5, p.z]}
            growth={plantGrowth ?? fallbackGrowth}
            seed={p.seed}
          />
        );
      })}
    </group>
  );
}

function CompassRose({
  size = 8,
  position,
  ridgeAzimuthDeg,
}: {
  size?: number;
  position: [number, number, number];
  ridgeAzimuthDeg: number;
}) {
  return (
    <group position={position} rotation={[0, (ridgeAzimuthDeg * Math.PI) / 180, 0]}>
      {/* N-S axis */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[size * 0.8, size, 32]} />
        <meshBasicMaterial color="#5b6573" side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

function Sun({
  latitudeDeg,
  month = 5,
  liveAzimuthDeg,
  liveElevationDeg,
}: {
  latitudeDeg: number;
  month?: number;
  liveAzimuthDeg?: number;
  liveElevationDeg?: number;
}) {
  let azDeg: number;
  let elevDeg: number;
  if (typeof liveAzimuthDeg === "number" && typeof liveElevationDeg === "number") {
    azDeg = liveAzimuthDeg;
    elevDeg = liveElevationDeg;
  } else {
    const dayOfYear = monthMidDayOfYear(month);
    const decl = solarDeclinationDeg(dayOfYear);
    elevDeg = 90 - latitudeDeg + decl;
    azDeg = 180;
  }

  const elevRad = (elevDeg * Math.PI) / 180;
  const azRad = (azDeg * Math.PI) / 180;
  const dist = 220;
  const horizDist = dist * Math.cos(elevRad);
  const x = horizDist * Math.sin(azRad);
  const z = -horizDist * Math.cos(azRad);
  const y = dist * Math.sin(elevRad);

  const elevAbove = Math.max(0, elevDeg);
  const sunIntensity = elevAbove > 0 ? 0.4 + 1.0 * Math.sin(elevRad) : 0;

  // Color via Kelvin temperature — perceptually accurate transition
  const kelvin = sunKelvinFromElevation(elevDeg);
  const sunRGB = kelvinToRGB(kelvin);
  const sunColor = rgbToHex(sunRGB);

  // Ambient: a much-desaturated, slightly cooler version of the sun color +
  // a gentle blue floor for realism in shade.
  const ambientIntensity = elevAbove > 0 ? 0.32 + 0.28 * Math.sin(elevRad) : 0.10;
  const ambientColor = elevDeg > 0
    ? rgbToHex({
        r: sunRGB.r * 0.6 + 60,
        g: sunRGB.g * 0.6 + 70,
        b: sunRGB.b * 0.6 + 100,
      })
    : "#1f2942";

  void solarSunriseHour;

  return (
    <group>
      {elevAbove > 0 && (
        <directionalLight
          position={[x, y, z]}
          intensity={sunIntensity}
          color={sunColor}
          castShadow
        />
      )}
      {elevAbove > -2 && (
        <mesh position={[x, Math.max(2, y), z]}>
          <sphereGeometry args={[elevDeg > 5 ? 7 : 11, 16, 16]} />
          <meshBasicMaterial color={sunColor} />
        </mesh>
      )}
      <ambientLight intensity={ambientIntensity} color={ambientColor} />
      {elevDeg < -5 && (
        <mesh position={[-x * 0.5, 80, -z * 0.5]}>
          <sphereGeometry args={[5, 16, 16]} />
          <meshBasicMaterial color="#dfe4ec" />
        </mesh>
      )}
    </group>
  );
}

function ElegantSky({
  azimuthDeg,
  elevationDeg,
}: {
  azimuthDeg: number;
  elevationDeg: number;
}) {
  // drei <Sky> uses Hosek-Wilkie atmospheric scattering. Smooth curves driven
  // by sun elevation give us elegant dawn → noon → dusk transitions for free.
  const params = skyParamsFromElevation(elevationDeg);
  // Convert sun position to drei format (vector pointing from origin)
  const elevRad = (elevationDeg * Math.PI) / 180;
  const azRad = (azimuthDeg * Math.PI) / 180;
  const horizDist = Math.cos(elevRad);
  const sunX = horizDist * Math.sin(azRad);
  const sunZ = -horizDist * Math.cos(azRad);
  const sunY = Math.sin(elevRad);

  // Below horizon: render a calm dark backdrop instead of drei Sky's confused state
  if (elevationDeg < -3) {
    return (
      <mesh>
        <sphereGeometry args={[450, 24, 12]} />
        <meshBasicMaterial color="#0d1422" side={THREE.BackSide} />
      </mesh>
    );
  }

  return (
    <Sky
      distance={450}
      sunPosition={[sunX, Math.max(0.02, sunY), sunZ]}
      turbidity={params.turbidity}
      rayleigh={params.rayleigh}
      mieCoefficient={params.mieCoefficient}
      mieDirectionalG={params.mieDirectionalG}
    />
  );
}

function Atmosphere({ elevationDeg }: { elevationDeg: number }) {
  // Subtle haze that mirrors what the eye actually sees — low sun = slightly
  // warmer fog, but never theatrical. Density caps at 0.0014.
  const kelvin = sunKelvinFromElevation(elevationDeg);
  const rgb = kelvinToRGB(kelvin);
  // Mute the fog color toward neutral gray to avoid over-saturation
  const fogColor =
    elevationDeg > 0
      ? rgbToHex({
          r: rgb.r * 0.4 + 140,
          g: rgb.g * 0.4 + 150,
          b: rgb.b * 0.4 + 160,
        })
      : "#1a2236";
  const density =
    elevationDeg > 30 ? 0.0004
      : elevationDeg > 10 ? 0.0007
      : elevationDeg > 0 ? 0.0012
      : 0.0018;
  return <fogExp2 attach="fog" args={[fogColor, density]} />;
}

function CameraRig({
  floorLength,
  floorWidth,
  peak,
  resetSignal,
}: {
  floorLength: number;
  floorWidth: number;
  peak: number;
  resetSignal: number;
}) {
  const { camera } = useThree();
  const controls = useThree((s) => s.controls) as
    | { target: THREE.Vector3; update: () => void }
    | null;
  const lastSignal = useRef<number>(-1);
  const initialMount = useRef(true);

  useEffect(() => {
    if (!camera) return;
    // Always re-frame on first mount + when reset clicked
    const shouldReframe = initialMount.current || resetSignal !== lastSignal.current;
    if (!shouldReframe) return;
    camera.position.set(floorLength * 0.95, peak * 1.7, floorWidth * 1.25);
    camera.lookAt(0, peak / 2, 0);
    if (controls) {
      controls.target.set(0, peak / 2, 0);
      controls.update();
    }
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.updateProjectionMatrix();
    }
    initialMount.current = false;
    lastSignal.current = resetSignal;
  }, [camera, controls, floorLength, floorWidth, peak, resetSignal]);

  return null;
}

export default function Greenhouse3D({
  floorAreaSqFt,
  canopyAreaSqFt,
  fixtureCount,
  gridSpacingFt,
  glazingPct,
  latitudeDeg,
  month = 5,
  aspect = 1.5,
  eaveHeightFt = 8,
  peakHeightFt = 14,
  ridgeAzimuthDeg = 0,
  resetCameraSignal = 0,
  thermalScreenActive = false,
  shadeActive = false,
  shadeTransmissionPct = 70,
  roofVentsOpen = false,
  liveSunAzimuthDeg,
  liveSunElevationDeg,
  lightsDimLevel = 1,
  greenhouseLengthFt,
  greenhouseWidthFt,
  plantGrowth,
}: Props & {
  resetCameraSignal?: number;
  greenhouseLengthFt?: number;
  greenhouseWidthFt?: number;
}) {
  // Canopy footprint (assume same aspect as floor unless explicit dims given)
  const canopyWidth = Math.sqrt(canopyAreaSqFt / aspect);
  const canopyLength = canopyWidth * aspect;

  // Floor: explicit dimensions take precedence; fall back to area-derived.
  // Floor must be at least canopy + 6 ft aisles (3 ft each side).
  const minAisleFt = 6;
  const minFloorLength = canopyLength + minAisleFt;
  const minFloorWidth = canopyWidth + minAisleFt;
  let derivedLength: number;
  let derivedWidth: number;
  if (
    typeof greenhouseLengthFt === "number" &&
    typeof greenhouseWidthFt === "number" &&
    greenhouseLengthFt > 0 &&
    greenhouseWidthFt > 0
  ) {
    derivedLength = greenhouseLengthFt;
    derivedWidth = greenhouseWidthFt;
  } else {
    const fromAreaWidth = Math.sqrt(floorAreaSqFt / aspect);
    derivedLength = fromAreaWidth * aspect;
    derivedWidth = fromAreaWidth;
  }
  const floorLength = Math.max(derivedLength, minFloorLength);
  const floorWidth = Math.max(derivedWidth, minFloorWidth);

  const canopyOffsetX = -canopyLength / 2;
  const canopyOffsetZ = -canopyWidth / 2;

  // Derive both rows and cols from gridSpacingFt so the grid always renders
  // as a clean rectangle. Prior code computed rows = ceil(fixtureCount / cols)
  // which produced a partial last row when fixtureCount didn't fit a clean
  // rectangle (commercial designs always snap to perfect grids).
  // If the snapped grid differs from fixtureCount by ≤ 2, prefer the perfect
  // grid (visual). If it differs by more (user manually overrode count), bias
  // rows toward fixtureCount to keep the BoM honest.
  const colsFromSpacing = Math.max(1, Math.round(canopyLength / gridSpacingFt));
  const rowsFromSpacing = Math.max(1, Math.round(canopyWidth / gridSpacingFt));
  const perfectGridCount = colsFromSpacing * rowsFromSpacing;
  let cols = colsFromSpacing;
  let rows = rowsFromSpacing;
  if (Math.abs(perfectGridCount - fixtureCount) > 2 && fixtureCount > 0) {
    // Big mismatch — re-fit a rectangle to match the requested count more
    // closely while keeping aspect ratio reasonable. Search for the (rows,cols)
    // pair whose product is closest to fixtureCount and whose aspect roughly
    // matches the canopy aspect.
    const targetAspect = canopyLength / canopyWidth;
    let best = { rows: rowsFromSpacing, cols: colsFromSpacing, score: Infinity };
    for (let testCols = 1; testCols <= fixtureCount; testCols++) {
      const testRows = Math.max(1, Math.round(fixtureCount / testCols));
      const product = testCols * testRows;
      const aspect = testCols / testRows;
      const countErr = Math.abs(product - fixtureCount);
      const aspectErr = Math.abs(aspect - targetAspect);
      const score = countErr * 5 + aspectErr;
      if (score < best.score) best = { rows: testRows, cols: testCols, score };
    }
    rows = best.rows;
    cols = best.cols;
  }
  const colSpacing = canopyLength / cols;
  const rowSpacing = canopyWidth / rows;
  const fixtures: { x: number; z: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      fixtures.push({
        x: canopyOffsetX + colSpacing * (c + 0.5),
        z: canopyOffsetZ + rowSpacing * (r + 0.5),
      });
    }
  }

  const fixtureZ = peakHeightFt - 5; // Hang ~5 ft below ridge
  const canopyTopZ = 4; // canopy plant tops ~4 ft from floor
  const footprintLength = colSpacing * 0.95;
  const footprintWidth = rowSpacing * 0.95;

  void glazingPct;

  // Plant height grows with canopy spacing — more headroom = taller training
  const plantHeight = Math.min(5, Math.max(3, Math.min(rowSpacing, colSpacing) * 0.45));

  return (
    <div className="overflow-hidden rounded border border-ink-300/40 bg-ink-900/[0.02]" style={{ height: 760 }}>
      <Canvas
        shadows
        camera={{ fov: 35, near: 1, far: 1500 }}
      >
        <Suspense fallback={null}>
          <Sun
            latitudeDeg={latitudeDeg}
            month={month}
            liveAzimuthDeg={liveSunAzimuthDeg}
            liveElevationDeg={liveSunElevationDeg}
          />
          <ElegantSky
            azimuthDeg={liveSunAzimuthDeg ?? 180}
            elevationDeg={liveSunElevationDeg ?? 60}
          />
          <Atmosphere elevationDeg={liveSunElevationDeg ?? 60} />
          <Environment preset="warehouse" environmentIntensity={0.18} />

          <CameraRig
            floorLength={floorLength}
            floorWidth={floorWidth}
            peak={peakHeightFt}
            resetSignal={resetCameraSignal}
          />

          {/* Ground */}
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0, 0]}
            receiveShadow
          >
            <planeGeometry args={[Math.max(200, floorLength * 4), Math.max(200, floorWidth * 4)]} />
            <meshStandardMaterial color="#9aa39c" roughness={0.95} />
          </mesh>

          {/* Grid for scale (every 5 ft) */}
          <Grid
            args={[
              Math.max(60, Math.ceil(floorLength * 1.6)),
              Math.max(60, Math.ceil(floorWidth * 1.6)),
            ]}
            cellSize={1}
            cellColor="#a8b0bb"
            sectionSize={5}
            sectionColor="#5b6573"
            fadeDistance={Math.max(120, floorLength * 1.5)}
            position={[0, 0.01, 0]}
            infiniteGrid={false}
          />

          <group rotation={[0, (ridgeAzimuthDeg * Math.PI) / 180, 0]}>
            <GreenhouseStructure
              length={floorLength}
              width={floorWidth}
              eave={eaveHeightFt}
              peak={peakHeightFt}
              thermalScreenActive={thermalScreenActive}
              shadeActive={shadeActive}
              shadeTransmissionPct={shadeTransmissionPct}
              roofVentsOpen={roofVentsOpen}
            />

            <CanopyAndPlants
              canopyOffsetX={canopyOffsetX}
              canopyOffsetZ={canopyOffsetZ}
              canopyLength={canopyLength}
              canopyWidth={canopyWidth}
              rows={Math.max(2, rows)}
              cols={Math.max(2, cols)}
              plantHeight={plantHeight}
              plantGrowth={plantGrowth}
            />

            <Fixtures
              positions={fixtures}
              hangHeight={fixtureZ + 0.5}
              ridgeHeight={peakHeightFt + 0.5}
              dimLevel={lightsDimLevel}
            />

            <LightFootprints
              positions={fixtures}
              fixtureZ={fixtureZ + 0.5}
              canopyZ={canopyTopZ}
              footprintLength={footprintLength}
              footprintWidth={footprintWidth}
              dimLevel={lightsDimLevel}
            />
          </group>

          <CompassRose
            size={6}
            position={[floorLength / 2 + 8, 0.05, floorWidth / 2 + 6]}
            ridgeAzimuthDeg={ridgeAzimuthDeg}
          />

          <OrbitControls
            makeDefault
            target={[0, peakHeightFt / 2, 0]}
            enableDamping
            dampingFactor={0.08}
            minDistance={20}
            maxDistance={Math.max(250, floorLength * 5)}
            maxPolarAngle={Math.PI / 2 - 0.05}
          />

          <EffectComposer multisampling={2}>
            <Bloom
              intensity={0.35}
              luminanceThreshold={0.65}
              luminanceSmoothing={0.85}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.18} darkness={0.55} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>
        </Suspense>
      </Canvas>
    </div>
  );
}
