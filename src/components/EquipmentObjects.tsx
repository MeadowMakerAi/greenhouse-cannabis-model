"use client";
import * as THREE from "three";
import { useRef } from "react";
import type { PlacedEquipment } from "../context/ScenarioContext";
import { EQUIPMENT_BY_ID } from "../data/equipmentLibrary";

/**
 * Renders placed greenhouse equipment as real-scale 3D objects inside
 * the R3F scene. Each object is positioned at the stored x/z, raised to
 * the correct mount height (floor or hung-from-structure).
 *
 * The geometry is intentionally schematic — well-shaped boxes with
 * accurate real-world dimensions, accent stripes, and labels. They read
 * as "this is what's here and how big it is" without CAD-file complexity.
 * Replace with GLTF assets as they become available.
 */

function EquipmentLabel({
  text,
  width,
  height,
}: {
  text: string;
  width: number;
  height: number;
}) {
  // Use a canvas texture to paint a readable label on the front face.
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.roundRect(4, 4, 248, 56, 8);
  ctx.fill();
  ctx.fillStyle = "#f0f0f0";
  ctx.font = "bold 20px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 24), 128, 32);
  const tex = new THREE.CanvasTexture(canvas);
  const aspect = (width / height) * 0.18; // label occupies ~18% of face height
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[Math.min(width * 0.8, 3), aspect]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

function DehumidifierMesh({ w, d, h }: { w: number; d: number; h: number }) {
  return (
    <group>
      {/* Main body */}
      <mesh>
        <boxGeometry args={[d, h, w]} />
        <meshStandardMaterial color="#c2c8d2" roughness={0.7} metalness={0.3} />
      </mesh>
      {/* Front panel accent */}
      <mesh position={[d / 2 + 0.01, 0, 0]}>
        <boxGeometry args={[0.02, h * 0.85, w * 0.9]} />
        <meshStandardMaterial color="#9aaabf" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Air-inlet louvers (dark strip) */}
      <mesh position={[-d / 2 + 0.1, h * 0.1, 0]}>
        <boxGeometry args={[0.15, h * 0.6, w * 0.9]} />
        <meshStandardMaterial color="#2a3240" roughness={0.9} metalness={0} />
      </mesh>
      {/* Mounting arms */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[0, h / 2 + 0.15, s * (w / 2 - 0.1)]}>
          <boxGeometry args={[d * 0.3, 0.1, 0.15]} />
          <meshStandardMaterial color="#444c56" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function UnitHeaterMesh({ w, d, h }: { w: number; d: number; h: number }) {
  return (
    <group>
      {/* Body */}
      <mesh>
        <boxGeometry args={[d, h, w]} />
        <meshStandardMaterial color="#8b6b50" roughness={0.8} metalness={0.2} />
      </mesh>
      {/* Exhaust flue stub at top */}
      <mesh position={[0, h / 2 + 0.25, 0]}>
        <cylinderGeometry args={[0.12, 0.12, 0.5, 8]} />
        <meshStandardMaterial color="#3d3d3d" roughness={0.6} metalness={0.5} />
      </mesh>
      {/* Fan face grille */}
      <mesh position={[d / 2 + 0.01, 0, 0]}>
        <circleGeometry args={[Math.min(w, h) * 0.36, 16]} />
        <meshStandardMaterial color="#2a2a2a" roughness={0.95} wireframe />
      </mesh>
      {/* Mounting bracket */}
      <mesh position={[0, h / 2 + 0.05, 0]}>
        <boxGeometry args={[d * 0.5, 0.08, w + 0.3]} />
        <meshStandardMaterial color="#555" metalness={0.5} roughness={0.5} />
      </mesh>
    </group>
  );
}

function RollingBenchMesh({ w, d, h }: { w: number; d: number; h: number }) {
  const legH = h - 0.15;
  return (
    <group>
      {/* Tray surface */}
      <mesh position={[0, h - 0.08, 0]}>
        <boxGeometry args={[d, 0.12, w]} />
        <meshStandardMaterial color="#7b8490" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* Tray lip */}
      <mesh position={[0, h - 0.02, 0]}>
        <boxGeometry args={[d + 0.04, 0.05, w + 0.04]} />
        <meshStandardMaterial color="#5a6270" roughness={0.8} metalness={0.2} />
      </mesh>
      {/* Rail frame */}
      {[0.35, -0.35].map((ox) => (
        <mesh key={ox} position={[0, legH / 2, ox]}>
          <boxGeometry args={[d - 0.1, 0.06, 0.05]} />
          <meshStandardMaterial color="#3a4250" metalness={0.5} roughness={0.4} />
        </mesh>
      ))}
      {/* Legs */}
      {([-1, 1] as const).flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh
            key={`${sx}_${sz}`}
            position={[sx * (d / 2 - 0.3), legH / 2, sz * (w / 2 - 0.15)]}
          >
            <boxGeometry args={[0.07, legH, 0.07]} />
            <meshStandardMaterial color="#3a4250" metalness={0.4} roughness={0.5} />
          </mesh>
        )),
      )}
      {/* Caster dots */}
      {([-1, 1] as const).flatMap((sx) =>
        [-1, 1].map((sz) => (
          <mesh key={`c_${sx}_${sz}`} position={[sx * (d / 2 - 0.3), 0.06, sz * (w / 2 - 0.15)]}>
            <cylinderGeometry args={[0.08, 0.08, 0.12, 8]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
          </mesh>
        )),
      )}
    </group>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function BoomIrrigatorMesh({ w, h, d: _d }: { w: number; d: number; h: number }) {
  return (
    <group>
      {/* Carriage */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.5, h, 0.5]} />
        <meshStandardMaterial color="#2a7ab0" roughness={0.6} metalness={0.3} />
      </mesh>
      {/* Boom arm */}
      <mesh position={[0, 0, 0]} rotation={[0, 0, 0]}>
        <boxGeometry args={[0.08, 0.08, w]} />
        <meshStandardMaterial color="#3a8ac0" roughness={0.5} metalness={0.4} />
      </mesh>
      {/* Nozzles */}
      {Array.from({ length: Math.max(2, Math.round(w / 1.2)) }).map((_, i) => {
        const frac = i / Math.max(1, Math.round(w / 1.2) - 1);
        return (
          <mesh key={i} position={[0, -0.12, -w / 2 + frac * w]}>
            <coneGeometry args={[0.04, 0.12, 6]} />
            <meshStandardMaterial color="#1a5f90" roughness={0.7} />
          </mesh>
        );
      })}
    </group>
  );
}

function SensorPodMesh({ h }: { h: number }) {
  return (
    <group>
      <mesh>
        <cylinderGeometry args={[0.15, 0.15, h, 8]} />
        <meshStandardMaterial color="#e0e0e0" roughness={0.6} metalness={0.1} />
      </mesh>
      <mesh position={[0, h / 2 + 0.1, 0]}>
        <sphereGeometry args={[0.12, 8, 6]} />
        <meshStandardMaterial color="#c0c8d0" roughness={0.4} metalness={0.2} />
      </mesh>
    </group>
  );
}

function GenericBoxMesh({
  w, d, h, color,
}: { w: number; d: number; h: number; color: string }) {
  return (
    <mesh>
      <boxGeometry args={[d, h, w]} />
      <meshStandardMaterial color={color} roughness={0.8} metalness={0.2} />
    </mesh>
  );
}

function EquipmentInstance({
  placed,
  eaveHeightFt,
}: {
  placed: PlacedEquipment;
  eaveHeightFt: number;
  peakHeightFt?: number; // reserved for future "hang at peak" logic
}) {
  const def = EQUIPMENT_BY_ID.get(placed.defId);
  if (!def) return null;
  const { widthFt: w, depthFt: d, heightFt: h, mount, color } = def;
  // Hung items sit at the eave (just inside the structure), floor items sit on the ground.
  const hangY = eaveHeightFt + 0.5 - h / 2;
  const floorY = h / 2 + 0.55; // 0.55 = floor plane Y
  const yPos = mount === "hung" ? hangY : floorY;

  const bodyRef = useRef<THREE.Group>(null!);

  const body =
    placed.defId.startsWith("dehumidifier") ? <DehumidifierMesh w={w} d={d} h={h} /> :
    placed.defId.startsWith("unit-heater") ? <UnitHeaterMesh w={w} d={d} h={h} /> :
    placed.defId.startsWith("rolling-bench") ? <RollingBenchMesh w={w} d={d} h={h} /> :
    placed.defId.startsWith("boom-irrigator") ? <BoomIrrigatorMesh w={w} d={d} h={h} /> :
    placed.defId.startsWith("sensor-pod") ? <SensorPodMesh h={h} /> :
    <GenericBoxMesh w={w} d={d} h={h} color={color} />;

  return (
    <group ref={bodyRef} position={[placed.x, yPos, placed.z]}>
      {body}
      <EquipmentLabel text={def.label} width={Math.max(w, d)} height={h} />
    </group>
  );
}

export default function EquipmentObjects({
  equipment,
  eaveHeightFt,
  peakHeightFt,
}: {
  equipment: PlacedEquipment[];
  eaveHeightFt: number;
  peakHeightFt: number;
}) {
  if (!equipment || equipment.length === 0) return null;
  return (
    <group>
      {equipment.map((e) => (
        <EquipmentInstance
          key={e.instanceId}
          placed={e}
          eaveHeightFt={eaveHeightFt}
          peakHeightFt={peakHeightFt}
        />
      ))}
    </group>
  );
}
