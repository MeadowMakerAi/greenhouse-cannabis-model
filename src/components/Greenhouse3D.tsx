import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { Mesh } from "three";
import {
  OrbitControls,
  Grid,
  Sky,
  Stars,
  Environment,
  Lightformer,
  Html,
} from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  ToneMapping,
  Vignette,
  SSAO,
  GodRays,
} from "@react-three/postprocessing";
import { BlendFunction, ToneMappingMode } from "postprocessing";
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
import { solveFixtureGrid } from "../models/fixtureGrid";
import { solveBenchLayout } from "../models/benchLayout";
import WeatherParticles from "./WeatherParticles";
import EquipmentObjects from "./EquipmentObjects";
import type { PlacedEquipment, BenchLayoutInputs } from "../context/ScenarioContext";
import type { LiveWeatherState } from "../context/useLiveWeather";

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
  /** Blackout curtain deployed — opaque fabric at gutter level + a
   *  permanent perimeter light-lock skirt that appears at >50 % closure.
   *  Cannabis photoperiod control: forces uninterrupted dark phase. */
  blackoutActive?: boolean;
  /** Track elevation above floor (ft) — operator-configurable so the same
   *  greenhouse geometry can host different curtain layer combinations. */
  thermalScreenElevation?: number;
  shadeElevation?: number;
  blackoutElevation?: number;
  /** Roof vents open */
  /** Ridge-vent opening fraction (0..1). Proportional, not binary. */
  roofVentFraction?: number;
  /** Live sun position (azimuth/elevation in degrees from N) — when supplied, overrides month-based sun */
  liveSunAzimuthDeg?: number;
  liveSunElevationDeg?: number;
  /** Lights state — emissive intensity and footprint opacity scale with this */
  lightsDimLevel?: number; // 0..1, defaults to 1
  /** Fog/atmosphere intensity (0=clear, 1=heavy) */
  atmosphereTone?: "day" | "golden" | "twilight" | "night";
  /** Phase-aware plant growth geometry from the sim clock (overrides static height) */
  plantGrowth?: PlantGrowthGeom;
  /** Visual form factor for the lamp mesh. "bulb" = HPS reflector hood + tube;
   *  "bar" = open bar grid (most LEDs); "panel" = solid rigid rectangle. */
  fixtureFormFactor?: "bulb" | "bar" | "panel";
  /** Color temperature in Kelvin. Drives emissive color and footprint tint. */
  fixtureKelvin?: number;
  /** Per-fixture wattage. Scales emissive intensity (more watts → brighter glow). */
  fixtureWatts?: number;
  /** Fixture type — used for any HPS-specific accent (e.g. visible bulb glow). */
  fixtureType?: "LED" | "HPS";
  /** Human-readable fixture name — currently informational only. */
  fixtureLabel?: string;
  /** Plants per ft² of canopy — drives the 3D on-center plant spacing (visual only;
   *  whole-canopy transpiration is LAI/area-based, not plant-count). Default 0.8 (SOG). */
  plantDensity?: number;
}

// 1 ft = 1 unit in scene; canvas camera distance scales accordingly.

/**
 * Retractable horizontal curtain — gutter-to-gutter, single panel that
 * deploys down the length of the greenhouse.
 *
 * Geometry verified 2026-05-23 via somersault (see reference memory
 * `reference_greenhouse_curtain_mechanics`). Commercial cannabis
 * light-dep installs (Ludvig Svensson Obscura + Wadsworth Powerpull,
 * SLS Tempest, Fullbloom): curtain hangs horizontally at gutter/eave
 * height, the metal leading-edge bar travels down the length of the
 * greenhouse, fabric anchors at one gable and concertinas there when
 * retracted. NOT roof-conformal. NOT roll-up. Blackout fabric is fully
 * opaque (light-tight); thermal/energy screens are aluminized for IR
 * reflection.
 *
 * Animation uses useFrame + lerp on per-mesh refs so we don't fight
 * React re-renders. ~0.5s transition reads as a curtain moving.
 *
 * Single shared component used by blackout, thermal, and shade — each
 * wrapper sets color/opacity/metalness for its fabric, the geometry +
 * animation are identical.
 */
function RetractableCurtain({
  length,
  width,
  elevation,
  targetFraction,
  color,
  opacity,
  roughness,
  metalness = 0,
  railColor = "#3d4452",
  edgeBarColor = "#b8bcc4",
}: {
  length: number;
  width: number;
  /** Track elevation above floor (ft) */
  elevation: number;
  /** Target deployed fraction (0..1) — component lerps toward this each frame */
  targetFraction: number;
  color: string;
  opacity: number;
  roughness: number;
  metalness?: number;
  railColor?: string;
  edgeBarColor?: string;
}) {
  const panelRef = useRef<Mesh>(null);
  const edgeBarRef = useRef<Mesh>(null);
  const bundleRef = useRef<Mesh>(null);
  const currentFraction = useRef(targetFraction);
  const halfLength = length / 2;
  const halfWidth = width / 2 - 0.4; // gutter-rail setback
  const panelMaxLen = length - 0.4; // 0.2 setback at each gable
  const panelWidth = width - 0.8; // span between gutters

  useFrame(() => {
    // Lerp the live fraction toward the target. 0.08 per frame at 60fps =
    // ~95% closure in 0.5s — fast enough to feel responsive, slow enough
    // to read as a curtain moving.
    const diff = targetFraction - currentFraction.current;
    if (Math.abs(diff) > 0.001) {
      currentFraction.current += diff * 0.08;
    } else {
      currentFraction.current = targetFraction;
    }
    const f = currentFraction.current;
    const deployedLen = panelMaxLen * Math.max(0.001, f);
    if (panelRef.current) {
      // scale.x scales the plane geometry (sized to panelMaxLen on X)
      // by the deploy fraction. Anchor at the −x gable side.
      panelRef.current.scale.x = Math.max(0.001, f);
      // Position center so the anchored edge stays at x = −halfLength + 0.2.
      panelRef.current.position.x = -halfLength + 0.2 + deployedLen / 2;
    }
    if (edgeBarRef.current) {
      // Aluminum leading-edge bar travels with the moving edge.
      edgeBarRef.current.position.x = -halfLength + 0.2 + deployedLen;
      // Hide before the panel has any real extent so the bar doesn't
      // hover at the anchored side when fully retracted.
      edgeBarRef.current.visible = f > 0.01;
    }
    if (bundleRef.current) {
      // Folded bundle parked at the anchored gable. Grows with the
      // un-deployed length so the user sees "fabric stored over there"
      // rather than fabric appearing from thin air.
      const retractedFraction = Math.max(0, 1 - f);
      const bundleScale = 0.3 + retractedFraction * 1.4; // visual girth
      bundleRef.current.scale.set(1, bundleScale, 1);
      bundleRef.current.visible = f < 0.99;
    }
  });

  return (
    <group>
      {/* Gutter rails along the two long sides */}
      <mesh position={[0, elevation + 0.08, halfWidth]}>
        <boxGeometry args={[length, 0.06, 0.06]} />
        <meshStandardMaterial color={railColor} metalness={0.5} />
      </mesh>
      <mesh position={[0, elevation + 0.08, -halfWidth]}>
        <boxGeometry args={[length, 0.06, 0.06]} />
        <meshStandardMaterial color={railColor} metalness={0.5} />
      </mesh>
      {/* Curtain panel — anchored at the −x gable, deploys toward +x */}
      <mesh
        ref={panelRef}
        position={[-halfLength + 0.2, elevation, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[0.001, 1, 1]}
      >
        <planeGeometry args={[panelMaxLen, panelWidth]} />
        <meshStandardMaterial
          color={color}
          side={THREE.DoubleSide}
          opacity={opacity}
          transparent={opacity < 0.999}
          roughness={roughness}
          metalness={metalness}
        />
      </mesh>
      {/* Aluminum leading-edge bar — travels with the moving edge */}
      <mesh
        ref={edgeBarRef}
        position={[-halfLength + 0.2, elevation - 0.04, 0]}
      >
        <boxGeometry args={[0.12, 0.12, panelWidth]} />
        <meshStandardMaterial
          color={edgeBarColor}
          metalness={0.85}
          roughness={0.3}
        />
      </mesh>
      {/* Folded bundle at the anchored gable — fabric concertinas here
       * when retracted. A simple stacked box reads as "parked fabric"
       * without paying for a real fold simulation. */}
      <mesh
        ref={bundleRef}
        position={[-halfLength + 0.25, elevation - 0.1, 0]}
      >
        <boxGeometry args={[0.5, 0.2, panelWidth]} />
        <meshStandardMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
        />
      </mesh>
    </group>
  );
}

/* Thin wrappers around RetractableCurtain — each spec passes the fabric's
 * color, opacity, and deploy state. The geometry/animation lives in the
 * shared component so all three curtains behave identically. */
function ThermalScreen({
  length,
  width,
  elevation,
  deployedFraction,
}: {
  length: number;
  width: number;
  elevation: number;
  deployedFraction: number;
}) {
  // Aluminized energy screen (Ludvig Svensson XLS / Harmony — woven
  // aluminum strips reflect IR back to the canopy at night). Metallic
  // sheen + slight translucency reads as fabric, not foil.
  return (
    <RetractableCurtain
      length={length}
      width={width}
      elevation={elevation}
      targetFraction={deployedFraction}
      color="#dcd9cc"
      opacity={0.92}
      roughness={0.55}
      metalness={0.45}
      edgeBarColor="#c8ccd2"
    />
  );
}

function ShadeCloth({
  length,
  width,
  elevation,
  transmissionPct,
  deployedFraction,
}: {
  length: number;
  width: number;
  elevation: number;
  transmissionPct: number;
  deployedFraction: number;
}) {
  // Neutral grey/white knit — real shade cloth runs white, silver, or
  // black depending on type. Green was unrepresentative.
  const opacity = Math.min(0.7, Math.max(0.2, 1 - transmissionPct / 100 + 0.1));
  return (
    <RetractableCurtain
      length={length}
      width={width}
      elevation={elevation}
      targetFraction={deployedFraction}
      color="#cfd2cc"
      opacity={opacity}
      roughness={0.95}
    />
  );
}

function BlackoutCurtain({
  length,
  width,
  elevation,
  eave,
  deployedFraction,
}: {
  length: number;
  width: number;
  elevation: number;
  eave: number;
  deployedFraction: number;
}) {
  // Light-tight blackout (Obscura / SLS Tempest blackout face). Fully
  // opaque when deployed. Perimeter light-lock is a permanent skirt
  // around the structure — without it the horizontal sheet alone is
  // unrealistic because the shell glazing stays clear and daylight
  // pours through the walls. Codex challenge P1, 2026-05-23.
  const sealed = deployedFraction > 0.5;
  const halfLength = length / 2;
  const halfWidth = width / 2;
  return (
    <group>
      <RetractableCurtain
        length={length}
        width={width}
        elevation={elevation}
        targetFraction={deployedFraction}
        color="#0d0e10"
        opacity={1.0}
        roughness={0.95}
        railColor="#1a1d22"
        edgeBarColor="#9aa0aa"
      />
      {sealed && (
        <group>
          {/* Long sidewalls (perimeter light-lock skirt) */}
          <mesh position={[0, eave / 2, halfWidth - 0.05]} rotation={[0, Math.PI, 0]}>
            <planeGeometry args={[length - 0.4, eave - 0.1]} />
            <meshStandardMaterial
              color="#0d0e10"
              side={THREE.DoubleSide}
              roughness={0.95}
            />
          </mesh>
          <mesh position={[0, eave / 2, -halfWidth + 0.05]}>
            <planeGeometry args={[length - 0.4, eave - 0.1]} />
            <meshStandardMaterial
              color="#0d0e10"
              side={THREE.DoubleSide}
              roughness={0.95}
            />
          </mesh>
          {/* Gable end walls */}
          <mesh
            position={[halfLength - 0.05, eave / 2, 0]}
            rotation={[0, -Math.PI / 2, 0]}
          >
            <planeGeometry args={[width - 0.4, eave - 0.1]} />
            <meshStandardMaterial
              color="#0d0e10"
              side={THREE.DoubleSide}
              roughness={0.95}
            />
          </mesh>
          <mesh
            position={[-halfLength + 0.05, eave / 2, 0]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[width - 0.4, eave - 0.1]} />
            <meshStandardMaterial
              color="#0d0e10"
              side={THREE.DoubleSide}
              roughness={0.95}
            />
          </mesh>
        </group>
      )}
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
  openFraction,
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
  openFraction: number;
  /** "south" = +z slope, "north" = −z slope */
  side: "south" | "north";
}) {
  // Atrium-style continuous ridge vent. Hinge sits at the ridge. Closed: flush
  // on the roof slope (rotated by ±slopeAngleRad). Open: rotates outward an
  // additional 0–38° proportional to openFraction (commercial ridge vents
  // typically 30–45° at full open).
  // Each leaf opens AWAY from the ridge centerline — north leaf rotates one
  // way, south leaf the opposite — so together they form an inverted-V opening.
  const fullyOpenDeg = 38;
  const openRad =
    Math.max(0, Math.min(1, openFraction)) * (fullyOpenDeg * Math.PI) / 180;
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
  roofVentFraction,
  blackoutActive,
  thermalScreenElevation,
  shadeElevation,
  blackoutElevation,
}: {
  length: number;
  width: number;
  eave: number;
  peak: number;
  thermalScreenActive?: boolean;
  shadeActive?: boolean;
  shadeTransmissionPct?: number;
  /** Ridge-vent opening fraction (0..1). Proportional, not binary. */
  roofVentFraction?: number;
  blackoutActive?: boolean;
  thermalScreenElevation?: number;
  shadeElevation?: number;
  blackoutElevation?: number;
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
          opacity={0.32}
          roughness={0.04}
          metalness={0}
          transmission={0.88}
          thickness={0.3}
          ior={1.51}
          clearcoat={1}
          clearcoatRoughness={0.06}
          attenuationColor="#d5e6f0"
          attenuationDistance={6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Sidewall glazing — near (south) wall */}
      <mesh position={[0, eave / 2 + 0.5, -width / 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[length, eave]} />
        <meshPhysicalMaterial
          color="#cfe9f7"
          transparent
          opacity={0.32}
          roughness={0.04}
          metalness={0}
          transmission={0.88}
          thickness={0.3}
          ior={1.51}
          clearcoat={1}
          clearcoatRoughness={0.06}
          attenuationColor="#d5e6f0"
          attenuationDistance={6}
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

      {/* Longitudinal roof purlins — Phase visual-fidelity PR c.
          Horizontal structural bars between trusses on each slope.
          Adds depth + the recognizable "ladder running ridge-to-
          eave" pattern of real commercial greenhouses. */}
      <RoofPurlins length={length} width={width} eave={eave} peak={peak} />

      {/* Glazing-bar grid — Phase visual-fidelity PR c. Mullions +
          transom rails overlaid on every glazed surface. The iconic
          Dutch greenhouse signature. */}
      {/* South sidewall bars */}
      <GlazingBars
        length={length}
        height={eave}
        position={[0, eave / 2 + 0.5, -width / 2 - 0.04]}
        rotation={[0, Math.PI, 0]}
      />
      {/* North sidewall bars */}
      <GlazingBars
        length={length}
        height={eave}
        position={[0, eave / 2 + 0.5, width / 2 + 0.04]}
        rotation={[0, 0, 0]}
      />
      {/* Roof slope glazing bars — REMOVED 2026-05-26.
       *
       * The previous rotation math (slopeAngle ± π/2) put the
       * mullion+transom grid in a tilted plane that read as a
       * phantom upside-down truss next to the correct rafters.
       *
       * Roof structural depth is already conveyed by the real
       * rafters (Truss with quaternion-based Rafter helper) plus
       * the longitudinal purlins (RoofPurlins). Adding another bar
       * layer was overkill and we don't need it for the "Dutch
       * greenhouse signature" — sidewall + endwall glazing bars
       * dominate from the camera angles users actually look from. */}

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
              openFraction={roofVentFraction ?? 0}
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
              openFraction={roofVentFraction ?? 0}
              side="north"
            />,
          );
        }
        return leaves;
      })()}

      {/* Three retractable curtain layers, each at an operator-configurable
       * track elevation. Per Argus Titan + Svensson PARperfect installation
       * practice: curtains sit on adjacent tracks separated by 6-12 in so
       * any combination (0/1/2/3 layers) can deploy without colliding. The
       * deployed-fraction prop drives a useFrame lerp inside each curtain,
       * so retraction reads as a horizontal slide down the length of the
       * greenhouse (single-panel gutter-to-gutter). */}
      <ThermalScreen
        length={length}
        width={width}
        elevation={thermalScreenElevation ?? eave + 0.4}
        deployedFraction={thermalScreenActive ? 1 : 0}
      />
      <ShadeCloth
        length={length}
        width={width}
        elevation={shadeElevation ?? eave + 0.15}
        transmissionPct={shadeTransmissionPct ?? 70}
        deployedFraction={shadeActive ? 1 : 0}
      />
      <BlackoutCurtain
        length={length}
        width={width}
        elevation={blackoutElevation ?? eave - 0.05}
        eave={eave}
        deployedFraction={blackoutActive ? 1 : 0}
      />
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
          opacity={0.36}
          transmission={0.82}
          thickness={0.3}
          roughness={0.04}
          metalness={0}
          ior={1.51}
          clearcoat={1}
          clearcoatRoughness={0.06}
          attenuationColor="#d5e6f0"
          attenuationDistance={6}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Endwall door — Phase visual-fidelity PR c. Upgraded from
          flat silhouette to a recessed door with frame, vision
          panel, threshold, and lever handle. Mounted on west gable
          only (rotation flag). */}
      {rotationY > 0 && <EndwallDoor position={[0, 0, 0.08]} />}
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
  // `width` here is the half-span (ridge→eave horizontal run). The glazing
  // plane must lie ON the roof slope: it runs the full `length` along the
  // ridge and `slopeLength` down the slope, centred between ridge and eave.
  const slopeLength = Math.sqrt(width * width + (peak - eave) * (peak - eave));
  const angleFromHoriz = Math.atan2(peak - eave, width);
  // planeGeometry is vertical (x-y plane) by default. Tilt it down to sit
  // `angleFromHoriz` above horizontal — i.e. rotate (π/2 − angle) about X.
  // The previous code rotated by `angle`, leaving the pane ~70° from
  // horizontal (near-vertical), which overshot above the ridge and read as
  // two stray diagonal panels at the gable ends.
  const tilt = Math.PI / 2 - angleFromHoriz;
  const zCenter = side === "south" ? -width / 2 : width / 2;
  const yPos = (eave + peak) / 2 + 0.5;
  const rot: [number, number, number] =
    side === "south" ? [-tilt, 0, 0] : [tilt, 0, 0];

  return (
    <mesh position={[0, yPos, zCenter]} rotation={rot}>
      <planeGeometry args={[length, slopeLength]} />
      <meshPhysicalMaterial
        color="#cfe9f7"
        transparent
        opacity={0.32}
        transmission={0.88}
        thickness={0.3}
        roughness={0.04}
        metalness={0}
        ior={1.51}
        clearcoat={1}
        clearcoatRoughness={0.06}
        attenuationColor="#d5e6f0"
        attenuationDistance={6}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

/**
 * Single rafter member oriented between two explicit endpoints.
 * Cylinder geometry positioned at the midpoint and rotated via
 * quaternion so its local +Y axis points from `from` toward `to`.
 * Axis-rotation math is impossible to get wrong this way —
 * regression-proof vs the prior "guess the Euler sign" approach.
 */
function Rafter({
  from,
  to,
  thickness = 0.18,
}: {
  from: THREE.Vector3;
  to: THREE.Vector3;
  thickness?: number;
}) {
  const { mid, len, quat } = useMemo(() => {
    const len = from.distanceTo(to);
    const mid = from.clone().lerp(to, 0.5);
    const dir = to.clone().sub(from).normalize();
    // Default cylinder orientation: along local +Y. Compute the
    // quaternion that rotates +Y to point along `dir`.
    const upY = new THREE.Vector3(0, 1, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(upY, dir);
    return { mid, len, quat };
  }, [from, to]);
  return (
    <mesh position={[mid.x, mid.y, mid.z]} quaternion={quat}>
      <cylinderGeometry args={[thickness / 2, thickness / 2, len, 10]} />
      <meshStandardMaterial color="#3d4452" roughness={0.5} metalness={0.4} />
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
  // Phase visual-fidelity PR c (rewritten 2026-05-26): rafters now
  // use endpoint-driven quaternion orientation via the Rafter helper.
  // Previous box+Euler approach mis-rotated one rafter on top of the
  // correct one, producing a "phantom upside-down truss" silhouette.
  const eaveY = eave + 0.5;
  const peakY = peak + 0.5;
  const southEave = useMemo(
    () => new THREE.Vector3(x, eaveY, -width / 2),
    [x, eaveY, width],
  );
  const northEave = useMemo(
    () => new THREE.Vector3(x, eaveY, width / 2),
    [x, eaveY, width],
  );
  const peakPt = useMemo(
    () => new THREE.Vector3(x, peakY, 0),
    [x, peakY],
  );
  return (
    <group>
      {/* South rafter — endpoint-driven, guaranteed correct */}
      <Rafter from={southEave} to={peakPt} />
      {/* North rafter */}
      <Rafter from={northEave} to={peakPt} />
      {/* Tie beam (horizontal collar tie at eave level) */}
      <mesh position={[x, eaveY, 0]}>
        <boxGeometry args={[0.18, 0.18, width]} />
        <meshStandardMaterial color="#3d4452" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Kingpost (vertical from tie to ridge) */}
      <mesh position={[x, (eaveY + peakY) / 2, 0]}>
        <boxGeometry args={[0.14, peak - eave, 0.14]} />
        <meshStandardMaterial color="#3d4452" roughness={0.5} metalness={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Aluminum glazing-bar grid — Phase visual-fidelity PR c.
 *
 * The iconic Dutch/Venlo greenhouse signature: a thin aluminum bar
 * grid over every glazed surface. Mullions (vertical bars) every
 * ~4 ft along the length; transom rails (horizontal) every ~4-5 ft
 * up the height of sidewalls or along the slope of roof panels.
 *
 * Rendered as thin box geometries (~1-inch wide). PBR-lit so they
 * pick up the sun direction. Slight inset (0.04 units toward camera)
 * so they sit on top of the glazing plane without z-fighting.
 */
function GlazingBars({
  length,
  height,
  position,
  rotation,
  spacingAlong = 4,
  spacingUp = 4,
}: {
  length: number;
  height: number;
  position: [number, number, number];
  rotation: [number, number, number];
  spacingAlong?: number;
  spacingUp?: number;
}) {
  const mullionCount = Math.max(2, Math.floor(length / spacingAlong) + 1);
  const transomCount = Math.max(2, Math.floor(height / spacingUp) + 1);
  const bars: React.ReactNode[] = [];
  // Vertical mullions
  for (let i = 0; i < mullionCount; i++) {
    const x = -length / 2 + (length / (mullionCount - 1)) * i;
    bars.push(
      <mesh key={`m-${i}`} position={[x, 0, 0.04]}>
        <boxGeometry args={[0.10, height, 0.05]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.4} metalness={0.6} />
      </mesh>,
    );
  }
  // Horizontal transoms
  for (let i = 0; i < transomCount; i++) {
    const y = -height / 2 + (height / (transomCount - 1)) * i;
    bars.push(
      <mesh key={`t-${i}`} position={[0, y, 0.04]}>
        <boxGeometry args={[length, 0.08, 0.05]} />
        <meshStandardMaterial color="#9aa3ad" roughness={0.4} metalness={0.6} />
      </mesh>,
    );
  }
  return (
    <group position={position} rotation={rotation}>
      {bars}
    </group>
  );
}

/**
 * Endwall door — Phase visual-fidelity PR c. Replaces the flat dark
 * plane with a recessed frame, threshold strip, vision panel, and
 * lever handle. Mounted on the west gable.
 */
function EndwallDoor({ position }: { position: [number, number, number] }) {
  const w = 3.2;
  const h = 7;
  return (
    <group position={position}>
      {/* Frame (slightly larger box behind door) */}
      <mesh position={[0, h / 2, -0.04]}>
        <boxGeometry args={[w + 0.4, h + 0.2, 0.08]} />
        <meshStandardMaterial color="#1f2530" roughness={0.45} metalness={0.5} />
      </mesh>
      {/* Door slab — warm grey aluminum */}
      <mesh position={[0, h / 2, 0.02]}>
        <boxGeometry args={[w, h, 0.06]} />
        <meshStandardMaterial color="#3a4250" roughness={0.5} metalness={0.45} />
      </mesh>
      {/* Vision panel (small window in upper third) */}
      <mesh position={[0, h * 0.7, 0.06]}>
        <planeGeometry args={[w * 0.55, h * 0.18]} />
        <meshPhysicalMaterial
          color="#cfe9f7"
          transparent
          opacity={0.35}
          transmission={0.85}
          roughness={0.05}
          metalness={0}
          ior={1.51}
        />
      </mesh>
      {/* Threshold strip */}
      <mesh position={[0, 0.04, 0.06]}>
        <boxGeometry args={[w + 0.1, 0.08, 0.12]} />
        <meshStandardMaterial color="#2a3140" roughness={0.4} metalness={0.5} />
      </mesh>
      {/* Lever handle */}
      <mesh position={[w * 0.35, h * 0.45, 0.08]}>
        <boxGeometry args={[0.5, 0.06, 0.08]} />
        <meshStandardMaterial color="#cfd3d9" roughness={0.2} metalness={0.85} />
      </mesh>
    </group>
  );
}

/**
 * Roof purlins — Phase visual-fidelity PR c. Longitudinal horizontal
 * structural members running the full greenhouse length on each
 * roof slope, sitting between trusses to support the glazing. Real
 * greenhouses have 3-5 per slope at evenly-spaced intervals from
 * eave to ridge. Adds depth + scale to the structure.
 */
function RoofPurlins({
  length,
  width,
  eave,
  peak,
}: {
  length: number;
  width: number;
  eave: number;
  peak: number;
}) {
  const slopeLen = Math.sqrt((width / 2) * (width / 2) + (peak - eave) * (peak - eave));
  const slopeAngle = Math.atan2(peak - eave, width / 2);
  const purlinsPerSlope = 4;
  const lines: React.ReactNode[] = [];
  // Distance along slope from eave at fractional t in [0,1]
  const purlinAt = (t: number, side: "south" | "north") => {
    const distAlongSlope = t * slopeLen;
    const yLift = Math.sin(slopeAngle) * distAlongSlope;
    const horizFromEave = Math.cos(slopeAngle) * distAlongSlope;
    const sign = side === "south" ? -1 : 1;
    const z = sign * (width / 2 - horizFromEave);
    const y = eave + 0.5 + yLift;
    return [0, y, z] as [number, number, number];
  };
  for (let i = 1; i < purlinsPerSlope; i++) {
    const t = i / purlinsPerSlope;
    const sPos = purlinAt(t, "south");
    const nPos = purlinAt(t, "north");
    lines.push(
      <mesh key={`ps-${i}`} position={sPos}>
        <boxGeometry args={[length, 0.10, 0.10]} />
        <meshStandardMaterial color="#5a626d" roughness={0.5} metalness={0.5} />
      </mesh>,
      <mesh key={`pn-${i}`} position={nPos}>
        <boxGeometry args={[length, 0.10, 0.10]} />
        <meshStandardMaterial color="#5a626d" roughness={0.5} metalness={0.5} />
      </mesh>,
    );
  }
  return <group>{lines}</group>;
}

/** Bar-grid LED form factor (Fluence SPYDR, Gavita 1700e/RS 1900e, generic LED).
 *  Open driver box on top, multiple emitting bars on bottom. */
function FixtureMeshBar({
  length,
  width,
  dimLevel,
  emissiveColor,
  emissiveIntensity,
  surfaceColor,
}: {
  length: number;
  width: number;
  dimLevel: number;
  emissiveColor: string;
  emissiveIntensity: number;
  surfaceColor: string;
}) {
  const bars = Math.max(2, Math.round(length / 1.0));
  const barWidth = (length / bars) * 0.85;
  const barOffset = length / bars;
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
              color={dimLevel > 0 ? surfaceColor : "#3a3a3a"}
              emissive={dimLevel > 0 ? emissiveColor : "#000000"}
              emissiveIntensity={emissiveIntensity}
              roughness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

/** Compact rigid panel form factor (Gavita RS 2400e V2, square broad-spectrum
 *  panels). One contiguous emitting face on the bottom — no bar gaps. */
function FixtureMeshPanel({
  length,
  width,
  dimLevel,
  emissiveColor,
  emissiveIntensity,
  surfaceColor,
}: {
  length: number;
  width: number;
  dimLevel: number;
  emissiveColor: string;
  emissiveIntensity: number;
  surfaceColor: string;
}) {
  return (
    <group>
      {/* Heatsink top */}
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[length * 0.92, 0.16, width * 0.9]} />
        <meshStandardMaterial color="#2a2f36" metalness={0.75} roughness={0.45} />
      </mesh>
      {/* Driver mount block */}
      <mesh position={[0, 0.32, 0]}>
        <boxGeometry args={[length * 0.45, 0.12, width * 0.55]} />
        <meshStandardMaterial color="#1a1d22" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Diffuser body (slight chamfer reads via two stacked boxes) */}
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[length * 0.95, 0.08, width * 0.95]} />
        <meshStandardMaterial color="#15181c" metalness={0.5} roughness={0.6} />
      </mesh>
      {/* Single emitting face */}
      <mesh position={[0, -0.02, 0]}>
        <boxGeometry args={[length * 0.92, 0.03, width * 0.9]} />
        <meshStandardMaterial
          color={dimLevel > 0 ? surfaceColor : "#3a3a3a"}
          emissive={dimLevel > 0 ? emissiveColor : "#000000"}
          emissiveIntensity={emissiveIntensity * 1.1}
          roughness={0.18}
        />
      </mesh>
    </group>
  );
}

/** HPS reflector hood + horizontal arc-tube. Reflector is broad and
 *  slightly tilted so the inner mirror surface catches the camera; the
 *  bulb is a small bright capsule that glows even when "off" (residual
 *  heat) is suppressed via dimLevel. */
function FixtureMeshBulb({
  length,
  width,
  dimLevel,
  emissiveColor,
  emissiveIntensity,
}: {
  length: number;
  width: number;
  dimLevel: number;
  emissiveColor: string;
  emissiveIntensity: number;
}) {
  const reflectorLen = length * 1.05;
  const reflectorWid = width * 1.7;
  return (
    <group>
      {/* Reflector outer shell — wide aluminum hood */}
      <mesh position={[0, 0.18, 0]} rotation={[Math.PI, 0, 0]}>
        <boxGeometry args={[reflectorLen, 0.22, reflectorWid]} />
        <meshStandardMaterial color="#2a2f36" metalness={0.85} roughness={0.35} />
      </mesh>
      {/* Reflector inner mirror — bright when lights on (catches bulb glow) */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[reflectorLen * 0.95, reflectorWid * 0.92]} />
        <meshStandardMaterial
          color={dimLevel > 0 ? "#f5e8c8" : "#9ea0a6"}
          metalness={0.95}
          roughness={0.15}
          side={THREE.DoubleSide}
          emissive={dimLevel > 0 ? emissiveColor : "#000000"}
          emissiveIntensity={emissiveIntensity * 0.45}
        />
      </mesh>
      {/* Socket end caps */}
      <mesh position={[length / 2 + 0.12, 0.0, 0]}>
        <boxGeometry args={[0.25, 0.18, 0.4]} />
        <meshStandardMaterial color="#1a1d22" metalness={0.6} roughness={0.5} />
      </mesh>
      <mesh position={[-length / 2 - 0.12, 0.0, 0]}>
        <boxGeometry args={[0.25, 0.18, 0.4]} />
        <meshStandardMaterial color="#1a1d22" metalness={0.6} roughness={0.5} />
      </mesh>
      {/* Arc-tube — horizontal capsule, the actual point of light */}
      <mesh position={[0, -0.05, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, length * 0.7, 12]} />
        <meshStandardMaterial
          color={dimLevel > 0 ? "#fff4dc" : "#5b6573"}
          emissive={dimLevel > 0 ? emissiveColor : "#000000"}
          emissiveIntensity={emissiveIntensity * 1.6}
          roughness={0.1}
        />
      </mesh>
      {/* Soft glow halo around the tube — only when lit */}
      {dimLevel > 0.05 && (
        <mesh position={[0, -0.05, 0]}>
          <sphereGeometry args={[Math.max(length * 0.45, 0.6), 12, 8]} />
          <meshBasicMaterial
            color={emissiveColor}
            transparent
            opacity={0.18 * dimLevel}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}

function FixtureMesh({
  length,
  width,
  dimLevel = 1,
  formFactor,
  emissiveColor,
  emissiveIntensity,
  surfaceColor,
}: {
  length: number;
  width: number;
  dimLevel?: number;
  formFactor: "bulb" | "bar" | "panel";
  emissiveColor: string;
  emissiveIntensity: number;
  surfaceColor: string;
}) {
  const dl = Math.max(0, Math.min(1, dimLevel));
  if (formFactor === "bulb") {
    return (
      <FixtureMeshBulb
        length={length}
        width={width}
        dimLevel={dl}
        emissiveColor={emissiveColor}
        emissiveIntensity={emissiveIntensity}
      />
    );
  }
  if (formFactor === "panel") {
    return (
      <FixtureMeshPanel
        length={length}
        width={width}
        dimLevel={dl}
        emissiveColor={emissiveColor}
        emissiveIntensity={emissiveIntensity}
        surfaceColor={surfaceColor}
      />
    );
  }
  return (
    <FixtureMeshBar
      length={length}
      width={width}
      dimLevel={dl}
      emissiveColor={emissiveColor}
      emissiveIntensity={emissiveIntensity}
      surfaceColor={surfaceColor}
    />
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
  formFactor,
  emissiveColor,
  emissiveIntensity,
  surfaceColor,
}: {
  positions: { x: number; z: number }[];
  fixtureLength?: number;
  fixtureWidth?: number;
  hangHeight: number;
  ridgeHeight: number;
  /** Length of hanger cable in ft. Real fixtures hang on 1-2 ft chains/cables, not all the way to ridge. */
  cableLengthFt?: number;
  dimLevel?: number;
  formFactor: "bulb" | "bar" | "panel";
  emissiveColor: string;
  emissiveIntensity: number;
  surfaceColor: string;
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
          <FixtureMesh
            length={fixtureLength}
            width={fixtureWidth}
            dimLevel={dimLevel}
            formFactor={formFactor}
            emissiveColor={emissiveColor}
            emissiveIntensity={emissiveIntensity}
            surfaceColor={surfaceColor}
          />
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
  color,
  opacity = 0.13,
}: {
  position: [number, number, number];
  geometry: THREE.BufferGeometry;
  color: string;
  opacity?: number;
}) {
  return (
    <mesh position={position}>
      <primitive object={geometry} attach="geometry" />
      <meshBasicMaterial
        color={color}
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
  color,
  formFactor,
  intensityScale = 1,
}: {
  positions: { x: number; z: number }[];
  fixtureZ: number;
  canopyZ: number;
  footprintLength: number;
  footprintWidth: number;
  dimLevel?: number;
  color: string;
  formFactor: "bulb" | "bar" | "panel";
  /** Multiplier on opacity, e.g. driven by fixture wattage. */
  intensityScale?: number;
}) {
  // HPS reflector hood throws a wider, softer footprint than a directional LED
  // bar — bias the spread by form factor so the visual matches the physics.
  const spreadFactor =
    formFactor === "bulb" ? 1.18 : formFactor === "panel" ? 0.95 : 1.0;
  // The cone's apex (fixture-side rectangle) is bigger for bulb (broad
  // reflector) and smaller for panel (narrower diffuser face).
  const apexFactor =
    formFactor === "bulb" ? 0.55 : formFactor === "panel" ? 0.32 : 0.4;
  const geometry = useMemo(
    () =>
      buildFrustumGeometry(
        footprintLength * apexFactor,
        footprintWidth * apexFactor,
        footprintLength * spreadFactor,
        footprintWidth * spreadFactor,
        fixtureZ - canopyZ,
      ),
    [footprintLength, footprintWidth, fixtureZ, canopyZ, spreadFactor, apexFactor],
  );
  if (dimLevel <= 0.001) return null;
  // HPS reads as much warmer + slightly more visible glow at the same dim
  // level — so bias the base opacity for bulb form factor.
  const baseOpacity = formFactor === "bulb" ? 0.18 : 0.13;
  return (
    <group>
      {positions.map((p, i) => (
        <LightFootprint
          key={i}
          position={[p.x, fixtureZ, p.z]}
          geometry={geometry}
          color={color}
          opacity={baseOpacity * dimLevel * intensityScale}
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
  lod = "high",
}: {
  position: [number, number, number];
  rotationY: number;
  /** Overall cluster radius in feet */
  size: number;
  color: string;
  rng: (n: number) => number;
  /** "low" halves the leaflet count for dense canopies where each plant is
   *  a few px tall and the palmate detail is invisible. */
  lod?: "high" | "low";
}) {
  // Cannabis fan leaf: 5–7 elongated palmate leaflets. Each leaflet ≈ thin
  // cone (length ≈ size × 1.0, base ≈ size × 0.18). Center leaflet longest,
  // outer leaflets shorter — classic palmate gradient. Each leaflet is its own
  // draw call, so this count is the dominant per-plant mesh multiplier.
  const leaflets = lod === "low" ? 3 : 5 + Math.round(rng(70) * 2); // 3 | 5–7
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
            {/* Each leaflet rendered as a stretched cone pointing +Y in local.
                Physical material with subtle transmission — light passes
                through the leaflet at grazing angles the way real foliage
                does. Sheen gives the soft falloff at glancing angles.
                ~2× memory of meshStandardMaterial but reads as alive. */}
            <coneGeometry args={[leafThick, leafLen * lenScale, 5]} />
            {/* Leaf subsurface scattering (Axel #1 realism — Habel 2007).
                transmission=0.28: light passes through thin leaf tissue.
                attenuationColor: the warm yellow-green you see when sunlight
                backlights a cannabis leaf — the key "alive" cue.
                sheen: soft velvet falloff at grazing angles (waxy cuticle). */}
            <meshPhysicalMaterial
              color={color}
              roughness={0.82}
              metalness={0}
              transmission={0.28}
              thickness={0.06}
              ior={1.42}
              attenuationColor="#c8e87a"
              attenuationDistance={0.18}
              sheen={0.9}
              sheenRoughness={0.65}
              sheenColor="#d4f0a0"
              side={THREE.DoubleSide}
            />
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
  lod = "high",
}: {
  position: [number, number, number];
  growth: PlantGrowthGeom;
  seed: number;
  /** "low" (dense canopies): fewer tiers, 3-leaflet clusters, and skip the
   *  translucent trichome-shimmer inner cones — invisible at that scale but
   *  ~2× material cost. Cuts per-plant draw calls roughly in half. */
  lod?: "high" | "low";
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
          lod={lod}
        />
      </group>
    );
  }

  // Determine node count based on plant size — taller plants have more tiers.
  // Cap tiers lower in low-LOD (dense canopy) — each tier is 2 branches ×
  // (cylinder + leaf cluster), so this compounds with the leaflet reduction.
  const tierCap = lod === "low" ? 4 : 6;
  const tierCount = Math.max(3, Math.min(tierCap, Math.round(2 + height * 0.6)));
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
                  lod={lod}
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
                  {lod === "high" && (
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
                  )}
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
          {lod === "high" && (
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
          )}
        </group>
      ) : (
        <FanLeafCluster
          position={[0, height + 0.05, 0]}
          rotationY={r(99) * Math.PI}
          size={Math.max(0.25, foliageR * 0.55)}
          color={fanLeafColorLight}
          rng={r}
          lod={lod}
        />
      )}
    </group>
  );
}

/** Bench rows on the greenhouse floor — the top-down layout made physical.
 *  Green trays read as planted benches; the gaps between/around them are the
 *  aisles. Shares the plan view's bench solver so 3D and plan stay in sync
 *  (rolling packs tight with one aisle; fixed spreads by benchWidth+aisle). */
function Benches({
  footprintLength,
  footprintWidth,
  benchLayout,
  plantHeight,
  plantDensity,
  plantGrowth,
}: {
  footprintLength: number;
  footprintWidth: number;
  benchLayout: BenchLayoutInputs;
  plantHeight: number;
  plantDensity: number;
  plantGrowth?: PlantGrowthGeom;
}) {
  // Solve on the RAW footprint (same dims plan view + ScenarioContext use), not
  // the min-clamped 3D floor — otherwise a small house packs more/longer rows
  // here than the plan view + the derived canopy number report.
  const layout = solveBenchLayout(footprintLength, footprintWidth, benchLayout);
  if (layout.rows === 0) return null;
  const deckY = 2.1; // rolling-bench tops sit ~2.4 ft — deck reads at bench height
  const DECK_TOP = deckY + 0.07; // deck box is 0.14 tall, centered at deckY
  const INSET = 0.4; // keep plants off the deck edge
  const PLANT_SPACING_FT = 1 / Math.sqrt(Math.max(0.05, plantDensity)); // on-center from the
  // plants/ft² input (default 0.8 = 1.25 sqft/plant — OBSERVED across 5 Terp Mansion 1-gal
  // SOG grows, "800 plants per 1,000 sqft"). Adjustable; visual only (transpiration is LAI-based).
  // ponytail: each detailed plant is ~60 meshes, so ~240 is the visual ceiling before jank.
  // Full-canopy density on a commercial house (thousands of plants) needs an InstancedMesh
  // low-poly canopy — deferred. Target for that pass: 0.8 plants/sqft of canopy.
  const MAX_BENCH_PLANTS = 240; // total across all benches — same budget as floor mode

  // Global cap: widen spacing uniformly so the TOTAL plant count across every
  // bench stays bounded on a many-bench house (mirrors CanopyAndPlants).
  let totalPlants = 0;
  for (const b of layout.rowRects) {
    const pw = Math.max(0, b.wFt - INSET * 2);
    const pd = Math.max(0, b.hFt - INSET * 2);
    if (pw < 0.5 || pd < 0.5) continue;
    totalPlants +=
      Math.max(1, Math.round(pw / PLANT_SPACING_FT)) *
      Math.max(1, Math.round(pd / PLANT_SPACING_FT));
  }
  const spacing =
    totalPlants > MAX_BENCH_PLANTS
      ? PLANT_SPACING_FT * Math.sqrt(totalPlants / MAX_BENCH_PLANTS)
      : PLANT_SPACING_FT;

  // Reuse the floor-mode fallback growth so benched + open crops read identically.
  const growth: PlantGrowthGeom = plantGrowth ?? {
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
    <group>
      {layout.rowRects.map((b, i) => {
        // Solver rects are in corner-origin feet; the footprint is centered on
        // the floor origin, so shift each rect center by half the footprint.
        const cx = b.xFt + b.wFt / 2 - footprintLength / 2;
        const cz = b.yFt + b.hFt / 2 - footprintWidth / 2;
        // Plant sub-grid for THIS bench (local coords, centered on the group).
        const pw = Math.max(0, b.wFt - INSET * 2);
        const pd = Math.max(0, b.hFt - INSET * 2);
        const cols = pw < 0.5 ? 0 : Math.max(1, Math.round(pw / spacing));
        const rows = pd < 0.5 ? 0 : Math.max(1, Math.round(pd / spacing));
        const cellW = cols ? pw / cols : 0;
        const cellD = rows ? pd / rows : 0;
        return (
          <group key={i} position={[cx, 0, cz]}>
            {/* white powder-coat / plastic bench deck (ebb-flow tray) */}
            <mesh position={[0, deckY, 0]} castShadow receiveShadow>
              <boxGeometry args={[b.wFt, 0.14, b.hFt]} />
              <meshStandardMaterial color="#eef1f4" roughness={0.65} metalness={0.08} />
            </mesh>
            {/* support rail below so the deck doesn't read as floating */}
            <mesh position={[0, deckY - 0.9, 0]}>
              <boxGeometry args={[b.wFt, 0.1, b.hFt * 0.6]} />
              <meshStandardMaterial color="#b9bec4" roughness={0.9} metalness={0.3} />
            </mesh>
            {/* real plants sitting ON the deck (replaces the old green box) —
                tiled across the bench footprint, base on the deck surface. */}
            {Array.from({ length: rows }).flatMap((_, rr) =>
              Array.from({ length: cols }).map((__, cc) => (
                <CannabisPlant
                  key={`p-${rr}-${cc}`}
                  position={[
                    -pw / 2 + cellW * (cc + 0.5),
                    DECK_TOP,
                    -pd / 2 + cellD * (rr + 0.5),
                  ]}
                  growth={growth}
                  seed={i * 1000 + rr * 40 + cc}
                />
              )),
            )}
          </group>
        );
      })}
    </group>
  );
}

/** A single floating callout chip — DOM text billboarded to the camera via drei
 *  <Html>. pointerEvents:none so it never blocks OrbitControls. Identity/location
 *  only (what/where); sensor readouts live in the DOM HUD. */
function CalloutChip({
  position,
  text,
  tone = "slate",
}: {
  position: [number, number, number];
  text: string;
  tone?: "slate" | "leaf";
}) {
  return (
    <Html
      position={position}
      center
      distanceFactor={26}
      occlude={false}
      zIndexRange={[20, 0]}
      style={{ pointerEvents: "none" }}
    >
      <div
        className={`whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium shadow-sm backdrop-blur-md ${
          tone === "leaf"
            ? "border-leaf-500/40 bg-white/75 text-leaf-600"
            : "border-white/45 bg-white/70 text-ink-900"
        }`}
      >
        {text}
      </div>
    </Html>
  );
}

/** Data-driven scene callouts: ONE chip per category (never per-bench/fixture,
 *  to avoid clutter). Fixture name+wattage always (under a greenhouse roof);
 *  bench type + aisle only when benched. */
function SceneCallouts({
  benchLayout,
  derivedLength,
  derivedWidth,
  fixtures,
  fixtureZ,
  fixtureLabel,
  fixtureWatts,
  fixtureType,
  showEnvelope,
}: {
  benchLayout?: BenchLayoutInputs;
  derivedLength: number;
  derivedWidth: number;
  fixtures: { x: number; z: number }[];
  fixtureZ: number;
  fixtureLabel?: string;
  fixtureWatts?: number;
  fixtureType?: "LED" | "HPS";
  showEnvelope: boolean;
}) {
  const chips: {
    key: string;
    position: [number, number, number];
    text: string;
    tone?: "slate" | "leaf";
  }[] = [];

  // Fixture identity — the real selected fixture name + wattage.
  if (showEnvelope && fixtures.length > 0) {
    const f = fixtures[Math.floor(fixtures.length / 2)];
    const name = fixtureLabel ?? `${fixtureType ?? "LED"} fixture`;
    chips.push({
      key: "fixture",
      position: [f.x, fixtureZ + 1.4, f.z],
      text: `${name} — ${Math.round(fixtureWatts ?? 720)} W`,
      tone: "slate",
    });
  }

  // Bench + aisle identity — geometry from the same solver the meshes use.
  if (benchLayout?.enabled) {
    const layout = solveBenchLayout(derivedLength, derivedWidth, benchLayout);
    if (layout.rows > 0) {
      const b0 = layout.rowRects[0];
      const bcx0 = b0.xFt + b0.wFt / 2 - derivedLength / 2;
      const bcz0 = b0.yFt + b0.hFt / 2 - derivedWidth / 2;
      chips.push({
        key: "bench",
        position: [bcx0, 4.6, bcz0],
        text: benchLayout.type === "fixed" ? "Fixed benches" : "Rolling benches",
        tone: "leaf",
      });
      if (layout.rowRects.length > 1) {
        const b1 = layout.rowRects[1];
        const bcx1 = b1.xFt + b1.wFt / 2 - derivedLength / 2;
        const bcz1 = b1.yFt + b1.hFt / 2 - derivedWidth / 2;
        chips.push({
          key: "aisle",
          position: [(bcx0 + bcx1) / 2, 1.0, (bcz0 + bcz1) / 2],
          text: benchLayout.type === "rolling" ? "Movable aisle" : "Walkway",
          tone: "slate",
        });
      }
    }
  }

  return (
    <>
      {chips.map((c) => (
        <CalloutChip key={c.key} position={c.position} text={c.text} tone={c.tone} />
      ))}
    </>
  );
}

function CanopyAndPlants({
  canopyOffsetX,
  canopyOffsetZ,
  canopyLength,
  canopyWidth,
  plantHeight,
  plantDensity,
  plantGrowth,
  benched = false,
}: {
  canopyOffsetX: number;
  canopyOffsetZ: number;
  canopyLength: number;
  canopyWidth: number;
  plantHeight: number;
  plantDensity: number;
  plantGrowth?: PlantGrowthGeom;
  /** When benched, the <Benches> group renders the canopy as planted decks —
   *  suppress the centered plant block + highlight plane to avoid a misaligned
   *  double canopy. */
  benched?: boolean;
}) {
  // Benched: benches ARE the canopy in 3D (see <Benches>). Skip the centered
  // block so plants don't float in the aisles.
  if (benched) return null;
  // Realistic plant layout — decoupled from the FIXTURE grid. (The bug: plants
  // were tiled one-per-fixture, so rows went sparse/unrealistic as the
  // greenhouse grew.) Flowering cannabis sits ~2 ft on-center, far denser than
  // fixtures. We derive the plant grid from canopy size + plant spacing, cap
  // the rendered count for performance, and scale spacing up on very large
  // canopies so rows stay uniform instead of exploding into thousands of meshes.
  const PLANT_SPACING_FT = 1 / Math.sqrt(Math.max(0.05, plantDensity)); // from plants/ft² input; matches Benches
  const MAX_PLANTS = 240;
  let cols = Math.max(2, Math.round(canopyLength / PLANT_SPACING_FT));
  let rows = Math.max(2, Math.round(canopyWidth / PLANT_SPACING_FT));
  if (rows * cols > MAX_PLANTS) {
    const scale = Math.sqrt((rows * cols) / MAX_PLANTS);
    cols = Math.max(2, Math.round(cols / scale));
    rows = Math.max(2, Math.round(rows / scale));
  }
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
      {/* Plants — phase-aware geometry from sim clock if provided, else static.
          LOD by count: below ~60 plants (hero view / small house) each plant is
          large on screen → full detail. Denser than that, each plant is a few
          px and the palmate/trichome detail is invisible → "low" roughly halves
          per-plant draw calls. ponytail: fixed 60 threshold; make it a distance
          test if the camera ever pushes in on a dense house. */}
      {(() => {
        const lod: "high" | "low" = plants.length > 60 ? "low" : "high";
        return plants.map((p, i) => {
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
            lod={lod}
          />
        );
        });
      })()}
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
  diskRef,
  onDiskReady,
}: {
  latitudeDeg: number;
  month?: number;
  liveAzimuthDeg?: number;
  liveElevationDeg?: number;
  /** Ref to the sun-disk mesh so the GodRays effect can use it as its source. */
  diskRef?: React.MutableRefObject<Mesh | null>;
  /** Fires once the disk mesh exists / disappears, so GodRays can mount/unmount. */
  onDiskReady?: (ready: boolean) => void;
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
        <mesh
          position={[x, Math.max(2, y), z]}
          ref={(m) => {
            if (diskRef) diskRef.current = m;
            onDiskReady?.(!!m && elevDeg > 1);
          }}
        >
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

/**
 * Realistic terrain — Phase visual-fidelity PR b.
 *
 * Replaces the flat grey ground plane with three layered surfaces:
 *
 *   1. Grass field — large plane (1500×1500 ft) using
 *      MeshStandardMaterial with a custom GLSL injection (via
 *      `onBeforeCompile`) that adds value-noise color variation in
 *      the fragment shader. Three different hash-derived scales
 *      blend together so the grass reads as natural variation, not
 *      a tiling pattern. PBR lighting still works (the sun tints it
 *      at golden hour because we only modulate albedo, not normals).
 *
 *   2. Gravel apron — slightly elevated frame of plates just outside
 *      the greenhouse footprint (~6 ft wide). Lighter / tanner color
 *      with its own coarser noise. Sells the "this is a real
 *      maintained site" feel.
 *
 *   3. Distant horizon ring — very faint dark plane at the
 *      perimeter to soften the grass→sky boundary when the camera
 *      pitches up.
 *
 * Why shader injection instead of canvas texture: zero asset deps
 * (CSP locked-down project), zero memory cost for a high-resolution
 * texture, perfect zoom-independence (noise is computed per fragment,
 * so close-up doesn't look pixelated).
 */
function Ground({
  greenhouseLength,
  greenhouseWidth,
}: {
  greenhouseLength: number;
  greenhouseWidth: number;
}) {
  // Grass field stretches well past the greenhouse so the camera
  // doesn't see the edge from any normal angle. Scaled with greenhouse
  // size so big sites still feel like part of a larger property.
  const grassSize = Math.max(1500, Math.max(greenhouseLength, greenhouseWidth) * 12);

  // Gravel apron is a frame of 4 rectangles around the greenhouse,
  // ~6 ft wide each side. Building this as separate planes is simpler
  // than a hole-in-the-middle plane and renders just as well.
  const apronWidth = 6;
  const gravelOuterL = greenhouseLength + apronWidth * 2;

  // Grass material with value-noise color variation. We inject GLSL
  // into the standard material's fragment shader so PBR lighting +
  // shadows still work — we only modulate the diffuse color.
  const grassMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#5a7a3e",
      roughness: 0.95,
      metalness: 0,
    });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        // 2D hash + value noise. Three octaves of variation so the
        // grass reads as natural patchiness, not a single-frequency
        // tiling pattern.
        float gh_hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float gh_noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = gh_hash(i);
          float b = gh_hash(i + vec2(1.0, 0.0));
          float c = gh_hash(i + vec2(0.0, 1.0));
          float d = gh_hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        // Use world-space XZ position for noise so the pattern doesn't
        // stretch with UVs. Three scales of noise blended.
        vec2 wxz = vWorldPosition.xz;
        float n1 = gh_noise(wxz * 0.08);
        float n2 = gh_noise(wxz * 0.4);
        float n3 = gh_noise(wxz * 1.6);
        float n = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
        // Modulate hue between deeper green (#3d5a26) and lighter
        // sun-bleached green (#7a9a52) per fragment.
        vec3 deepGreen = vec3(0.24, 0.35, 0.15);
        vec3 lightGreen = vec3(0.48, 0.60, 0.32);
        vec3 grassColor = mix(deepGreen, lightGreen, n);
        // Slight desaturation toward the brown end at low noise values
        // (sells the "patches of dry grass" effect)
        vec3 dryPatch = vec3(0.45, 0.42, 0.22);
        float dryness = smoothstep(0.15, 0.0, n1) * 0.4;
        grassColor = mix(grassColor, dryPatch, dryness);
        diffuseColor.rgb = grassColor;`,
      );
      // We need vWorldPosition in the fragment shader — add a varying
      // and pass it through from the vertex shader.
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorldPosition;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vWorldPosition = worldPosition.xyz;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorldPosition;`,
      );
    };
    return mat;
  }, []);

  const gravelMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: "#8a8478",
      roughness: 0.85,
      metalness: 0.02,
    });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        float gv_hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float gv_noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = gv_hash(i);
          float b = gv_hash(i + vec2(1.0, 0.0));
          float c = gv_hash(i + vec2(0.0, 1.0));
          float d = gv_hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorldPositionG;`,
      );
      shader.vertexShader = shader.vertexShader.replace(
        "#include <worldpos_vertex>",
        `#include <worldpos_vertex>
        vWorldPositionG = worldPosition.xyz;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <common>",
        `#include <common>
        varying vec3 vWorldPositionG;`,
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        `#include <color_fragment>
        vec2 wxz = vWorldPositionG.xz;
        float n = gv_noise(wxz * 1.2) * 0.6 + gv_noise(wxz * 4.0) * 0.4;
        vec3 base = vec3(0.54, 0.51, 0.46);
        vec3 hi = vec3(0.72, 0.68, 0.60);
        vec3 lo = vec3(0.38, 0.36, 0.32);
        vec3 col = mix(lo, hi, n);
        col = mix(col, base, 0.3);
        diffuseColor.rgb = col;`,
      );
    };
    return mat;
  }, []);

  return (
    <group>
      {/* Grass field */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
        material={grassMaterial}
      >
        <planeGeometry args={[grassSize, grassSize, 1, 1]} />
      </mesh>

      {/* Gravel apron — 4 rectangles forming a frame around the
          greenhouse footprint. Tiny lift to avoid z-fighting. */}
      {(() => {
        const lift = 0.015;
        // North + south strips (full outer length)
        const lengthwise = gravelOuterL;
        // East + west strips (only the canopy width, not overlapping the
        // corners we just covered)
        const widthwise = greenhouseWidth;
        return (
          <>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, lift, -greenhouseWidth / 2 - apronWidth / 2]}
              receiveShadow
              material={gravelMaterial}
            >
              <planeGeometry args={[lengthwise, apronWidth]} />
            </mesh>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, lift, greenhouseWidth / 2 + apronWidth / 2]}
              receiveShadow
              material={gravelMaterial}
            >
              <planeGeometry args={[lengthwise, apronWidth]} />
            </mesh>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[-greenhouseLength / 2 - apronWidth / 2, lift, 0]}
              receiveShadow
              material={gravelMaterial}
            >
              <planeGeometry args={[apronWidth, widthwise]} />
            </mesh>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[greenhouseLength / 2 + apronWidth / 2, lift, 0]}
              receiveShadow
              material={gravelMaterial}
            >
              <planeGeometry args={[apronWidth, widthwise]} />
            </mesh>
          </>
        );
      })()}
    </group>
  );
}

/**
 * Night sky — star field + moon disc + optional Milky Way arc.
 *
 * Visibility logic driven by sun elevation:
 *   sun > +3°  → fully transparent (broad daylight, no celestials)
 *   sun -6°…+3° → fading in (civil + early twilight)
 *   sun < -6°  → fully visible (astronomical twilight + night)
 *
 * Moon position uses the simple "opposite-of-sun" approximation
 * (180° azimuth offset, mirrored elevation) — this gives the right
 * feel for sunset/sunrise transitions without an ephemeris library.
 * Real moon ephemeris is a future polish item (see issue).
 *
 * Milky Way: a faint backdrop sphere with a gradient texture that
 * only renders when sun is deep below horizon AND when "season"
 * (proxied by day-of-year) puts the galactic core above the
 * latitude's horizon. Skipped for now — pure star field looks fine.
 */
/**
 * Milky Way arc — Phase visual-fidelity PR d.
 *
 * A dim luminous band sweeping across the night sky. Renders as a
 * big inside-facing sphere with a custom shader that brightens a
 * great-circle band at a fixed orientation (galactic plane tilted
 * 60° from the celestial equator, which is close to reality for
 * mid-northern latitudes). The band uses two octaves of value noise
 * for cloud-like patchiness (dust lanes, brighter cores).
 *
 * Visibility tied to sun elevation — fully visible at sun < -10°
 * (astronomical twilight), fades to 0 at sun > -3°. Color is a warm
 * cream tinted toward orange in the galactic core direction.
 */
function MilkyWay({ visibility }: { visibility: number }) {
  const material = useMemo(() => {
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uVisibility: { value: 0 },
      },
      transparent: true,
      side: THREE.BackSide,
      depthWrite: false,
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uVisibility;
        varying vec3 vWorldPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
        }

        void main() {
          // Normalize direction from origin to this fragment
          vec3 dir = normalize(vWorldPos);

          // Galactic plane normal: tilted ~60° from world Y. This
          // gives the Milky Way a diagonal sweep across the sky
          // instead of a flat horizontal band.
          vec3 galacticNormal = normalize(vec3(0.5, 0.7, 0.2));
          float planeDist = abs(dot(dir, galacticNormal));

          // Band intensity: peaks when fragment is on the great
          // circle (planeDist=0), falls off with cosine roll.
          float band = smoothstep(0.32, 0.0, planeDist);

          // Two-octave noise for cloud-like dust lanes
          vec2 nc = vec2(atan(dir.x, dir.z) * 2.0, dir.y * 2.0);
          float n = noise(nc * 1.5) * 0.55 + noise(nc * 5.0) * 0.35 + noise(nc * 14.0) * 0.15;

          // Bright core region: stronger near "galactic center"
          // direction (we use the +X axis of galactic frame as proxy)
          vec3 galCenter = normalize(vec3(0.8, -0.4, 0.4));
          float coreBoost = pow(max(0.0, dot(dir, galCenter)), 4.0) * 0.6;

          // Final luminance + color
          float lum = band * (0.5 + n * 0.5) + coreBoost * band;
          vec3 cool = vec3(0.78, 0.84, 1.0);
          vec3 warm = vec3(1.0, 0.85, 0.65);
          vec3 col = mix(cool, warm, coreBoost);

          // Twinkle individual bright spots
          float twinkle = step(0.78, noise(nc * 28.0)) * 0.5;

          float alpha = clamp((lum + twinkle * 0.3) * uVisibility, 0.0, 0.85);
          gl_FragColor = vec4(col * lum, alpha);
        }
      `,
    });
    return mat;
  }, []);

  // Update uniform when visibility changes (re-render keeps it fresh)
  material.uniforms.uVisibility.value = visibility;

  if (visibility <= 0.02) return null;

  return (
    <mesh>
      <sphereGeometry args={[480, 60, 30]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/**
 * Approximate lunar phase fraction (0=new, 0.5=full, 1=new again)
 * from a day-of-year proxy. Uses a fixed lunar synodic cycle of
 * 29.5 days and a known new-moon reference (Jan 6, 2026). Good
 * enough for "feel" — phase advances visibly week-to-week without
 * needing a real ephemeris. Phase ∈ [0, 1) returned.
 */
function approximateLunarPhase(dayOfYear: number): number {
  // Reference: Jan 6, 2026 = new moon (DOY ≈ 6). Cycle 29.5 days.
  const refDOY = 6;
  const cycle = 29.5;
  const elapsed = (dayOfYear - refDOY) % cycle;
  return ((elapsed + cycle) % cycle) / cycle;
}

function NightSky({
  sunElevationDeg,
  sunAzimuthDeg,
  monthIndex,
}: {
  sunElevationDeg: number;
  sunAzimuthDeg: number;
  monthIndex: number;
}) {
  // Star + moon visibility ramp 0..1 across sun -6° → +3°
  const v = sunElevationDeg <= -6 ? 1
    : sunElevationDeg >= 3 ? 0
    : 1 - (sunElevationDeg + 6) / 9;

  // Milky Way needs deeper darkness — visible only at sun < -10°
  // (astronomical twilight), peaks at sun < -18°
  const milkyWayV = sunElevationDeg <= -18 ? 1
    : sunElevationDeg >= -10 ? 0
    : (-sunElevationDeg - 10) / 8;

  if (v <= 0.02 && milkyWayV <= 0.02) return null;

  // Moon position: rough antipode of sun. Real moon orbits
  // independently; this gives the right "opposite the sun" feel for
  // sunrise/sunset transitions without needing an ephemeris.
  const moonAz = (sunAzimuthDeg + 180) % 360;
  const moonElev = -sunElevationDeg;
  const moonElevRad = (moonElev * Math.PI) / 180;
  const moonAzRad = (moonAz * Math.PI) / 180;
  const moonDist = 420;
  const moonHoriz = Math.cos(moonElevRad) * moonDist;
  const moonX = Math.sin(moonAzRad) * moonHoriz;
  const moonZ = -Math.cos(moonAzRad) * moonHoriz;
  const moonY = Math.sin(moonElevRad) * moonDist;
  // Hide moon when below horizon
  const moonVisible = moonElev > -2;

  // Lunar phase from month index — proxy day-of-year is the 15th
  // of the active month (sufficient for visual change across the
  // year; real ephemeris would require currentDayOfYear plumbed
  // through every consumer).
  const cumStart = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const dayOfYear = (cumStart[monthIndex] ?? 0) + 15;
  const phase = approximateLunarPhase(dayOfYear);
  // illuminationFraction: 0 at new, 1 at full
  const illuminationFraction = 0.5 * (1 - Math.cos(phase * Math.PI * 2));
  // phaseAngle ∈ [0, 2π) — used by the moon shader to position the
  // terminator. 0 = full moon (terminator behind), π = new moon.
  const phaseAngle = phase * Math.PI * 2;

  // Moon shader material — applies a terminator across the sphere
  // so we see crescent / gibbous / full phases. The sphere is
  // rotated so the lit hemisphere faces the sun (we use a rough
  // sun-direction unit vector for this).
  const moonMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        uPhaseAngle: { value: 0 },
        uVisibility: { value: 0 },
      },
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform float uPhaseAngle;
        uniform float uVisibility;
        varying vec3 vNormal;
        void main() {
          // Direction "toward the sun" in moon-local frame. As
          // phase advances, this vector rotates around the moon.
          vec3 sunDir = vec3(sin(uPhaseAngle), 0.0, cos(uPhaseAngle));
          float lit = max(0.0, dot(vNormal, sunDir));
          // Smooth terminator
          float lightness = smoothstep(0.0, 0.15, lit);
          // Base moon color (pearl) + slight earthshine on dark side
          vec3 litColor = vec3(0.95, 0.93, 0.85);
          vec3 darkColor = vec3(0.10, 0.11, 0.15);
          vec3 col = mix(darkColor, litColor, lightness);
          gl_FragColor = vec4(col, uVisibility);
        }
      `,
      transparent: true,
    });
  }, []);
  moonMaterial.uniforms.uPhaseAngle.value = phaseAngle;
  moonMaterial.uniforms.uVisibility.value = Math.min(0.98, 0.4 + v * 0.58);

  return (
    <group>
      {/* Milky Way arc — deepest layer, very subtle */}
      <MilkyWay visibility={milkyWayV} />

      {/* Dense star field. Larger count + slightly cooler saturation
          for richness. */}
      <Stars
        radius={400}
        depth={80}
        count={9000}
        factor={4}
        saturation={0.05}
        fade
        speed={0.5}
      />

      {moonVisible && (
        <group>
          <mesh position={[moonX, moonY, moonZ]}>
            <sphereGeometry args={[14, 64, 32]} />
            <primitive object={moonMaterial} attach="material" />
          </mesh>
          {/* Soft halo */}
          <mesh position={[moonX, moonY, moonZ]}>
            <sphereGeometry args={[18 * (0.5 + illuminationFraction * 0.5), 24, 12]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={0.05 * v * (0.4 + illuminationFraction * 0.6)}
            />
          </mesh>
        </group>
      )}
    </group>
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
  roofVentFraction = 0,
  blackoutActive = false,
  thermalScreenElevation,
  shadeElevation,
  blackoutElevation,
  liveSunAzimuthDeg,
  liveSunElevationDeg,
  lightsDimLevel = 1,
  greenhouseLengthFt,
  greenhouseWidthFt,
  benchLayout,
  plantGrowth,
  fixtureFormFactor = "bar",
  fixtureKelvin = 3500,
  fixtureWatts = 720,
  fixtureType = "LED",
  fixtureLabel,
  bleed = false,
  fill = false,
  heightOverride,
  weather,
  equipment,
  showEnvelope = true,
  showLabels = true,
  plantDensity = 0.8,
}: Props & {
  resetCameraSignal?: number;
  greenhouseLengthFt?: number;
  greenhouseWidthFt?: number;
  /** Optional bench layout — renders physical bench rows on the floor. */
  benchLayout?: BenchLayoutInputs;
  /** When true, drop the panel border/bg and let the canvas read as the
   *  page substrate (Tesla 2026.14 / Bookmap pattern). Used on Live +
   *  Cultivation Science tabs where the scene IS the focus. */
  bleed?: boolean;
  /** When true, the canvas fills its parent (h-full w-full) instead of using
   *  the responsive fixed height. Used by the mobile full-screen overlay so
   *  the greenhouse owns the whole viewport. */
  fill?: boolean;
  /** Override the default 760px canvas height. Useful for substrate mode. */
  heightOverride?: number;
  /** Live weather conditions for precipitation / thunder / cloud-cover rendering. */
  weather?: LiveWeatherState;
  /** Placed equipment objects to render inside the greenhouse. */
  equipment?: PlacedEquipment[];
  /** When false (outdoor mode), hide the glass envelope, fixtures, light
   *  footprints, and placed equipment — the scene becomes an open-air field of
   *  plants under sky. Plants + ground + sun stay. Defaults true (greenhouse). */
  showEnvelope?: boolean;
  /** Show/hide the in-scene identity callout chips (bench type, aisle,
   *  fixture name+wattage). Defaults true. */
  showLabels?: boolean;
}) {
  // God-rays source: a ref to the sun-disk mesh + a ready flag so the
  // volumetric light shafts only mount when the sun is actually up.
  const sunDiskRef = useRef<Mesh | null>(null);
  const [sunDiskReady, setSunDiskReady] = useState(false);
  const cloudCover = weather?.cloudCover ?? 0;
  // Mesh when rays should show (sun up + not fully overcast), else null.
  const godRaysSun: Mesh | null =
    sunDiskReady && cloudCover <= 0.8 ? sunDiskRef.current : null;

  // Canopy footprint — match the GREENHOUSE aspect when explicit
  // length/width are provided, falling back to the legacy 1.5 default
  // only when dimensions aren't passed. Previously the canopy always
  // used the 1.5 default regardless of actual greenhouse shape, which
  // distorted the fixture grid (a 100×30 ft long-span house at 3.3:1
  // got rendered with a 1.5:1 canopy, collapsing the row count for
  // wider-coverage fixtures like HPS down to ~1 row).
  const effectiveAspect =
    typeof greenhouseLengthFt === "number" &&
    typeof greenhouseWidthFt === "number" &&
    greenhouseWidthFt > 0 &&
    greenhouseLengthFt > 0
      ? greenhouseLengthFt / greenhouseWidthFt
      : aspect;
  const canopyWidth = Math.sqrt(canopyAreaSqFt / effectiveAspect);
  const canopyLength = canopyWidth * effectiveAspect;

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
  // Shared solver (src/models/fixtureGrid.ts) — keeps this in lockstep with
  // GreenhousePlanView and guards against the single-row collapse.
  const { rows, cols } = solveFixtureGrid({
    fixtureCount,
    canopyLengthFt: canopyLength,
    canopyWidthFt: canopyWidth,
    gridSpacingFt,
  });
  const colSpacing = canopyLength / Math.max(1, cols);
  const rowSpacing = canopyWidth / Math.max(1, rows);
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

  // ---- Fixture-driven visuals --------------------------------------------
  // Translate the fixture's color temperature into an RGB hex string for
  // emissive material + light footprint. HPS lands around #ffaf60 (amber);
  // typical horticultural LED lands around #fff0d0 - #ffe6a8 (warm white).
  const emissiveRGB = kelvinToRGB(fixtureKelvin);
  const emissiveColor = rgbToHex(emissiveRGB);
  // Cooler surface tint for the lamp face — same hue, more white. We mix
  // 65% pure white with the emissive color so even amber HPS reads as a
  // hot bright surface, not a flat orange paint chip.
  const surfaceColor = rgbToHex({
    r: Math.round(emissiveRGB.r * 0.35 + 255 * 0.65),
    g: Math.round(emissiveRGB.g * 0.35 + 255 * 0.65),
    b: Math.round(emissiveRGB.b * 0.35 + 255 * 0.65),
  });
  // Wattage drives apparent intensity. Reference 720W LED ≈ 1.0; 1055W HPS
  // pushes brighter; small <500W panels look softer. Clamped so a custom
  // 4000W spec doesn't melt the bloom pass.
  const wattRatio = Math.min(1.6, Math.max(0.55, fixtureWatts / 720));
  const baseEmissive = fixtureFormFactor === "bulb" ? 2.6 : 1.8;
  const emissiveIntensity = baseEmissive * wattRatio * lightsDimLevel;
  // Per-form-factor lamp footprint in FEET (scene unit = 1 ft). HPS reflectors
  // are wide+shallow; panels nearly square; "bar" covers modern horticultural
  // LEDs, most of which are near-square 6-bar spiders — a Gavita Pro 1700e is
  // 44.1"×43.7" ≈ 3.7×3.6 ft (growpackage.com / lightrail3.com brochure), NOT a
  // long thin bar. Rendering it as 4.0×1.4 both mis-shaped it and made adjacent
  // fixtures in a tight row touch, so a correct rows×cols grid read as N solid
  // "lines." Widened to the real near-square footprint.
  const baseMeshLength =
    fixtureFormFactor === "panel" ? 3.2 : fixtureFormFactor === "bulb" ? 3.0 : 3.7;
  const baseMeshWidth =
    fixtureFormFactor === "panel" ? 2.6 : fixtureFormFactor === "bulb" ? 2.2 : 3.4;
  // Clamp the mesh strictly inside the grid cell (≤72% of the center-to-center
  // spacing) so there is ALWAYS a visible gap between neighbors — the layout
  // reads as a discrete equidistant matrix at any density, never merged lines.
  const fixtureMeshLength = Math.min(baseMeshLength, colSpacing * 0.72);
  const fixtureMeshWidth = Math.min(baseMeshWidth, rowSpacing * 0.72);

  // Responsive canvas height. The fixed 760px is taller than a phone
  // screen, so on mobile it both overflowed the fold and (with the canvas
  // eating touch) blocked scroll. Cap to ~60% of the small viewport on
  // mobile with a usable floor; restore the exact 760px at md+. An
  // explicit heightOverride (substrate mode) still wins via inline style.
  const heightClass = fill
    ? "h-full w-full"
    : bleed
      ? "h-[58svh] min-h-[300px] md:h-[760px]"
      : "h-[60svh] min-h-[320px] md:h-[760px]";
  // `gh-scene` is the hook for the canvas touch-action rule in index.css —
  // R3F's <Canvas style> lands on an inner container it then forces to
  // touch-action:none, so the <canvas> itself must be targeted via CSS to
  // let a vertical swipe scroll the page on mobile (see index.css).
  // In `fill` mode the overlay owns scroll, so the canvas can keep full
  // touch (pan-y still applies via the rule below; harmless there).
  const wrapperClass = fill
    ? `gh-scene gh-scene-fill scene-bleed relative overflow-hidden ${heightClass}`
    : bleed
      ? `gh-scene scene-bleed relative overflow-hidden ${heightClass}`
      : `gh-scene relative overflow-hidden rounded border border-ink-300/40 bg-ink-900/[0.02] ${heightClass}`;

  return (
    <div
      className={wrapperClass}
      style={!fill && heightOverride ? { height: heightOverride } : undefined}
    >
      <Canvas
        shadows
        // Clamp DPR: on a 3× retina panel, rendering at native 3× is ~2.8× the
        // fragment work of 1.75× for detail the eye barely resolves on a busy
        // scene. 1.75 keeps edges crisp while capping the pixel budget.
        // powerPreference nudges the browser onto the discrete GPU on laptops.
        // (frameloop stays "always" — 4 useFrame animations need per-frame
        // paints; "demand" would freeze them. Deferred with the mesh rewrite.)
        dpr={[1, 1.75]}
        gl={{ powerPreference: "high-performance" }}
        camera={{ fov: 35, near: 1, far: 1500 }}
      >
        <Suspense fallback={null}>
          <Sun
            latitudeDeg={latitudeDeg}
            month={month}
            liveAzimuthDeg={liveSunAzimuthDeg}
            liveElevationDeg={liveSunElevationDeg}
            diskRef={sunDiskRef}
            onDiskReady={setSunDiskReady}
          />
          <ElegantSky
            azimuthDeg={liveSunAzimuthDeg ?? 180}
            elevationDeg={liveSunElevationDeg ?? 60}
          />
          <NightSky
            sunElevationDeg={liveSunElevationDeg ?? 60}
            sunAzimuthDeg={liveSunAzimuthDeg ?? 180}
            monthIndex={month}
          />
          <Atmosphere elevationDeg={liveSunElevationDeg ?? 60} />

          {/* Custom IBL: place rectangular Lightformers shaped like the
              ridge bays + side glazing so the metal/glass/leaf materials
              get realistic indirect reflections without an HDRI fetch
              (no CSP widening). resolution=128 + frames=1 = bake once
              cost. The Lightformer rectangles are ~ridge length × bay
              width, lifted above the peak so they wash light downward
              the way ridge skylights do. This is what makes the
              fixtures, gutters, and plant tops look "production lit"
              rather than directional-only. */}
          <Environment frames={1} resolution={128}>
            {/* Top — broad warm skylight wash (sun-tinted) */}
            <Lightformer
              form="rect"
              intensity={2.0}
              color="#fff4dc"
              position={[0, peakHeightFt + 30, 0]}
              rotation-x={Math.PI / 2}
              scale={[Math.max(floorLength, 30), Math.max(floorWidth, 20), 1]}
            />
            {/* Ridge-line skylight (cool sky) */}
            <Lightformer
              form="rect"
              intensity={1.4}
              color="#dfe9f4"
              position={[0, peakHeightFt + 8, 0]}
              rotation-x={Math.PI / 2}
              scale={[floorLength * 0.85, 4, 1]}
            />
            {/* East glaze fill — cool reflective bounce */}
            <Lightformer
              form="rect"
              intensity={0.9}
              color="#b8c7d9"
              position={[floorLength * 0.7, eaveHeightFt * 0.7, 0]}
              rotation-y={-Math.PI / 2}
              scale={[floorWidth * 1.2, eaveHeightFt * 1.2, 1]}
            />
            {/* West glaze fill — warm ground bounce */}
            <Lightformer
              form="rect"
              intensity={0.7}
              color="#d8c3a0"
              position={[-floorLength * 0.7, eaveHeightFt * 0.5, 0]}
              rotation-y={Math.PI / 2}
              scale={[floorWidth * 1.2, eaveHeightFt * 1.2, 1]}
            />
            {/* Floor bounce — warm leaf-tinted upward fill */}
            <Lightformer
              form="rect"
              intensity={0.5}
              color="#9aaa6a"
              position={[0, 0.5, 0]}
              rotation-x={-Math.PI / 2}
              scale={[floorLength, floorWidth, 1]}
            />
          </Environment>

          <CameraRig
            floorLength={floorLength}
            floorWidth={floorWidth}
            peak={peakHeightFt}
            resetSignal={resetCameraSignal}
          />

          {/* Ground — Phase visual-fidelity PR b.
              Three-layer terrain replacing the flat grey plane:
                1. Grass field (large, distant horizon fade)
                2. Gravel apron around the greenhouse footprint
                3. Measurement grid kept but faded back so the ground
                   reads as land, not as graph paper.
              All PBR-lit so the sun direction tints the surfaces at
              dawn/dusk/noon. */}
          <Ground
            greenhouseLength={floorLength}
            greenhouseWidth={floorWidth}
          />

          {/* Grid for scale (every 5 ft) — backed off so the ground
              reads as terrain, not a blueprint. Smaller fade radius,
              softer colors, lower z-position so the grass shows
              through. */}
          <Grid
            args={[
              Math.max(40, Math.ceil(floorLength * 1.2)),
              Math.max(40, Math.ceil(floorWidth * 1.2)),
            ]}
            cellSize={1}
            cellColor="#5d6b5e"
            cellThickness={0.4}
            sectionSize={10}
            sectionColor="#3d4a3e"
            sectionThickness={0.6}
            fadeDistance={Math.max(80, floorLength * 1.0)}
            fadeStrength={2.5}
            position={[0, 0.02, 0]}
            infiniteGrid={false}
          />

          <group rotation={[0, (ridgeAzimuthDeg * Math.PI) / 180, 0]}>
            {/* Outdoor mode (showEnvelope=false) drops the glass house entirely —
                the crop stands in an open field. Plants below are unconditional. */}
            {showEnvelope && (
              <GreenhouseStructure
                length={floorLength}
                width={floorWidth}
                eave={eaveHeightFt}
                peak={peakHeightFt}
                thermalScreenActive={thermalScreenActive}
                shadeActive={shadeActive}
                shadeTransmissionPct={shadeTransmissionPct}
                roofVentFraction={roofVentFraction}
                blackoutActive={blackoutActive}
                thermalScreenElevation={thermalScreenElevation}
                shadeElevation={shadeElevation}
                blackoutElevation={blackoutElevation}
              />
            )}

            <CanopyAndPlants
              canopyOffsetX={canopyOffsetX}
              canopyOffsetZ={canopyOffsetZ}
              canopyLength={canopyLength}
              canopyWidth={canopyWidth}
              plantHeight={plantHeight}
              plantGrowth={plantGrowth}
              plantDensity={plantDensity}
              benched={!!benchLayout?.enabled}
            />

            {benchLayout?.enabled && (
              <Benches
                footprintLength={derivedLength}
                footprintWidth={derivedWidth}
                benchLayout={benchLayout}
                plantHeight={plantHeight}
                plantGrowth={plantGrowth}
                plantDensity={plantDensity}
              />
            )}

            {showLabels && (
              <SceneCallouts
                benchLayout={benchLayout}
                derivedLength={derivedLength}
                derivedWidth={derivedWidth}
                fixtures={fixtures}
                fixtureZ={fixtureZ}
                fixtureLabel={fixtureLabel}
                fixtureWatts={fixtureWatts}
                fixtureType={fixtureType}
                showEnvelope={showEnvelope}
              />
            )}

            {/* Supplemental lighting only exists under a greenhouse roof. */}
            {showEnvelope && (
              <>
                <Fixtures
                  positions={fixtures}
                  fixtureLength={fixtureMeshLength}
                  fixtureWidth={fixtureMeshWidth}
                  hangHeight={fixtureZ + 0.5}
                  ridgeHeight={peakHeightFt + 0.5}
                  dimLevel={lightsDimLevel}
                  formFactor={fixtureFormFactor}
                  emissiveColor={emissiveColor}
                  emissiveIntensity={emissiveIntensity}
                  surfaceColor={surfaceColor}
                />

                <LightFootprints
                  positions={fixtures}
                  fixtureZ={fixtureZ + 0.5}
                  canopyZ={canopyTopZ}
                  footprintLength={footprintLength}
                  footprintWidth={footprintWidth}
                  dimLevel={lightsDimLevel}
                  color={emissiveColor}
                  formFactor={fixtureFormFactor}
                  intensityScale={wattRatio}
                />
              </>
            )}
          </group>

          {/* Placed equipment objects — real-scale 3D with physics-aware dimensions. */}
          {showEnvelope && equipment && equipment.length > 0 && (
            <EquipmentObjects
              equipment={equipment}
              eaveHeightFt={eaveHeightFt}
              peakHeightFt={peakHeightFt}
            />
          )}

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

          {/* Post-process chain.
              · SSAO at half-res adds contact darkening between leaves,
                under fixtures, in canopy gaps — the single biggest
                "depth feels real" upgrade. ~1.5-2.5ms paint cost.
              · Bloom is selective: luminanceThreshold raised to 0.92
                so only actual emissive surfaces (lit fixtures, sun
                mesh) bloom — not glass or white labels. Default 0.65
                was too generous; the new value reads "lights are
                on" rather than "everything is glowing."
              · Vignette grounds the frame.
              · ACES Filmic tone mapping last — applies after all
                effects so the LDR conversion sees the full HDR
                range. */}
          {/* enableNormalPass is required: SSAO reads the scene normal
              buffer. Without it the SSAO effect silently no-ops and logs
              "enable the NormalPass" every frame the scene mounts. */}
          <EffectComposer multisampling={2} enableNormalPass>
            <SSAO
              blendFunction={BlendFunction.MULTIPLY}
              samples={20}
              radius={0.12}
              intensity={22}
              luminanceInfluence={0.6}
              worldDistanceThreshold={50}
              worldDistanceFalloff={5}
              worldProximityThreshold={6}
              worldProximityFalloff={1}
            />
            {/* Volumetric god-rays streaming through the glazing + structure
                (Axel #1). Only mounts when the sun disk is up; weight eased
                back under cloud cover so overcast days don't shaft. The cast
                satisfies EffectComposer's strict child type — React.Children
                filters the null at runtime when the sun is down. */}
            {(godRaysSun ? (
              <GodRays
                sun={godRaysSun}
                blendFunction={BlendFunction.SCREEN}
                samples={60}
                density={0.95}
                decay={0.9}
                weight={0.5 * (1 - cloudCover * 0.7)}
                exposure={0.32 * (1 - cloudCover * 0.6)}
                clampMax={1}
                blur
              />
            ) : null) as React.ReactElement}
            <Bloom
              intensity={0.55}
              luminanceThreshold={0.92}
              luminanceSmoothing={0.6}
              mipmapBlur
            />
            <Vignette eskil={false} offset={0.22} darkness={0.6} />
            <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          </EffectComposer>

          {/* Live weather — rain, snow, lightning, cloud cover, fog.
              Rendered outside EffectComposer so particles don't get
              SSAO contact-darkening (they're atmospheric, not solid). */}
          {weather && weather.loaded && (
            <WeatherParticles
              weather={weather}
              floorLength={floorLength}
              floorWidth={floorWidth}
              peak={peakHeightFt}
              eave={eaveHeightFt}
            />
          )}

        </Suspense>
      </Canvas>
    </div>
  );
}
