"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useMemo, useEffect } from "react";
import * as THREE from "three";
import type { LiveWeatherState } from "../context/useLiveWeather";

// ── Rain ──────────────────────────────────────────────────────────────────────
const RAIN_COUNT = 2500;
const RAIN_AREA = 120; // ft radius around camera

function initRainPositions(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * RAIN_AREA;
    pos[i * 3 + 1] = Math.random() * 60; // height spread
    pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
  }
  return pos;
}

interface RainProps {
  intensity: number; // 0..1
  windSpeedMs: number;
  windDirDeg: number;
}

function Rain({ intensity, windSpeedMs, windDirDeg }: RainProps) {
  const geo = useRef<THREE.BufferGeometry>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const pos = useMemo(() => initRainPositions(RAIN_COUNT), []);
  const windRad = (windDirDeg * Math.PI) / 180;
  const windX = Math.sin(windRad) * windSpeedMs * 0.1;
  const windZ = Math.cos(windRad) * windSpeedMs * 0.1;

  useFrame((_, dt) => {
    if (!geo.current || intensity <= 0) return;
    const arr = geo.current.attributes.position.array as Float32Array;
    const fallRate = (18 + windSpeedMs * 0.5) * dt; // ft/s
    for (let i = 0; i < RAIN_COUNT; i++) {
      arr[i * 3]     += windX * dt;
      arr[i * 3 + 1] -= fallRate + Math.random() * 2 * dt;
      arr[i * 3 + 2] += windZ * dt;
      if (arr[i * 3 + 1] < -2) {
        arr[i * 3]     = (Math.random() - 0.5) * RAIN_AREA;
        arr[i * 3 + 1] = 55 + Math.random() * 10;
        arr[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
      }
    }
    geo.current.attributes.position.needsUpdate = true;
    if (mat.current) mat.current.opacity = Math.min(0.55, intensity * 0.55);
  });

  return (
    <points>
      <bufferGeometry ref={geo}>
        <bufferAttribute attach="attributes-position" args={[pos, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={mat}
        color="#a8c8e8"
        size={0.22}
        sizeAttenuation
        transparent
        opacity={intensity * 0.45}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

// ── Snow ──────────────────────────────────────────────────────────────────────
const SNOW_COUNT = 1800;
const SNOW_AREA = 100;

function initSnowPositions(count: number): Float32Array {
  const pos = new Float32Array(count * 3);
  const phase = new Float32Array(count); // individual oscillation phase
  for (let i = 0; i < count; i++) {
    pos[i * 3]     = (Math.random() - 0.5) * SNOW_AREA;
    pos[i * 3 + 1] = Math.random() * 55;
    pos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_AREA;
    phase[i] = Math.random() * Math.PI * 2;
  }
  return pos;
}

interface SnowProps {
  intensity: number;
  windSpeedMs: number;
  windDirDeg: number;
}

function Snow({ intensity, windSpeedMs, windDirDeg }: SnowProps) {
  const geo = useRef<THREE.BufferGeometry>(null!);
  const mat = useRef<THREE.PointsMaterial>(null!);
  const pos = useMemo(() => initSnowPositions(SNOW_COUNT), []);
  const phases = useMemo(() => {
    const p = new Float32Array(SNOW_COUNT);
    for (let i = 0; i < SNOW_COUNT; i++) p[i] = Math.random() * Math.PI * 2;
    return p;
  }, []);
  const t = useRef(0);
  const windRad = (windDirDeg * Math.PI) / 180;
  const windX = Math.sin(windRad) * windSpeedMs * 0.05;
  const windZ = Math.cos(windRad) * windSpeedMs * 0.05;

  useFrame((_, dt) => {
    if (!geo.current || intensity <= 0) return;
    t.current += dt;
    const arr = geo.current.attributes.position.array as Float32Array;
    const fallRate = (2 + windSpeedMs * 0.1) * dt;
    for (let i = 0; i < SNOW_COUNT; i++) {
      const drift = Math.sin(t.current * 0.7 + phases[i]) * 0.04;
      arr[i * 3]     += windX * dt + drift;
      arr[i * 3 + 1] -= fallRate;
      arr[i * 3 + 2] += windZ * dt + Math.cos(t.current * 0.5 + phases[i]) * 0.03;
      if (arr[i * 3 + 1] < -1) {
        arr[i * 3]     = (Math.random() - 0.5) * SNOW_AREA;
        arr[i * 3 + 1] = 52 + Math.random() * 8;
        arr[i * 3 + 2] = (Math.random() - 0.5) * SNOW_AREA;
      }
    }
    geo.current.attributes.position.needsUpdate = true;
    if (mat.current) mat.current.opacity = Math.min(0.8, intensity * 0.8);
  });

  return (
    <points>
      <bufferGeometry ref={geo}>
        <bufferAttribute
          attach="attributes-position"
          args={[pos, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={mat}
        color="#f0f4ff"
        size={0.55}
        sizeAttenuation
        transparent
        opacity={intensity * 0.75}
        depthWrite={false}
      />
    </points>
  );
}

// ── Snow accumulation on roof ─────────────────────────────────────────────────
function SnowOnRoof({ intensity, floorLength, floorWidth, peak, eave }: {
  intensity: number;
  floorLength: number;
  floorWidth: number;
  peak: number;
  eave: number;
}) {
  if (intensity <= 0) return null;
  const slopeLen = Math.sqrt((floorWidth / 2) ** 2 + (peak - eave) ** 2);
  const angle = Math.atan2(peak - eave, floorWidth / 2);
  const tilt = Math.PI / 2 - angle;
  const yPos = (eave + peak) / 2 + 0.5;
  return (
    <group>
      <mesh position={[0, yPos, -floorWidth / 2]} rotation={[-tilt, 0, 0]}>
        <planeGeometry args={[floorLength * 0.98, slopeLen * 0.98]} />
        <meshStandardMaterial
          color="#e8eef5"
          roughness={1}
          metalness={0}
          transparent
          opacity={Math.min(0.72, intensity * 0.72)}
          depthWrite={false}
        />
      </mesh>
      <mesh position={[0, yPos, floorWidth / 2]} rotation={[tilt, 0, 0]}>
        <planeGeometry args={[floorLength * 0.98, slopeLen * 0.98]} />
        <meshStandardMaterial
          color="#e8eef5"
          roughness={1}
          metalness={0}
          transparent
          opacity={Math.min(0.72, intensity * 0.72)}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ── Lightning ─────────────────────────────────────────────────────────────────
function Lightning() {
  const lightRef = useRef<THREE.DirectionalLight>(null!);
  const nextFlash = useRef(Math.random() * 8 + 4);
  const flashDur = useRef(0);

  useFrame((_, dt) => {
    if (!lightRef.current) return;
    nextFlash.current -= dt;
    if (flashDur.current > 0) {
      flashDur.current -= dt;
      lightRef.current.intensity = flashDur.current > 0 ? 25 : 0;
    }
    if (nextFlash.current <= 0) {
      flashDur.current = 0.07 + Math.random() * 0.08;
      nextFlash.current = Math.random() * 12 + 5;
    }
  });

  return (
    <directionalLight
      ref={lightRef}
      position={[30, 80, -20]}
      color="#ccdeff"
      intensity={0}
      castShadow={false}
    />
  );
}

// ── Fog layer for fog / low-visibility conditions ─────────────────────────────
function FogLayer({ visibilityM }: { visibilityM: number }) {
  const { scene } = useThree();

  useEffect(() => {
    const density = visibilityM < 200 ? 0.03
      : visibilityM < 500 ? 0.018
      : visibilityM < 1000 ? 0.008
      : visibilityM < 5000 ? 0.002
      : 0;
    if (density > 0) {
      scene.fog = new THREE.FogExp2("#c8d4da", density);
    } else {
      scene.fog = null;
    }
    return () => { scene.fog = null; };
  }, [scene, visibilityM]);

  return null;
}

// ── Cloud cover: dim sun by modifying ambient + a sky-dimming overlay ─────────
function CloudDim({ cloudCover }: { cloudCover: number }) {
  const { scene } = useThree();

  useEffect(() => {
    // Modulate the scene's ambient component via background tint
    // (non-destructive — sun DirectionalLight is handled in ElegantSky/Sun)
    void cloudCover; void scene;
    // Nothing destructive needed here — cloudCover is passed to
    // the ElegantSky azimuth→sun path. Placeholder for a future
    // IBL-multiplier once TSL/WebGPU upgrade lands.
  }, [scene, cloudCover]);

  if (cloudCover < 0.2) return null;
  // Translucent white overlay on an inverted sphere fakes cloud diffusion.
  return (
    <mesh renderOrder={-1}>
      <sphereGeometry args={[440, 16, 8]} />
      <meshBasicMaterial
        color="#e8edf2"
        transparent
        opacity={Math.min(0.38, cloudCover * 0.38)}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  );
}

// ── Public composite ──────────────────────────────────────────────────────────
export interface WeatherParticlesProps {
  weather: LiveWeatherState;
  floorLength: number;
  floorWidth: number;
  peak: number;
  eave: number;
}

export default function WeatherParticles({
  weather,
  floorLength,
  floorWidth,
  peak,
  eave,
}: WeatherParticlesProps) {
  const { category, rainIntensity, snowIntensity, cloudCover, windSpeedMs,
          windDirDeg, thunderstorm, snowAccumulating, current } = weather;

  const showRain  = (category === "rain" || category === "drizzle" || category === "thunderstorm") && rainIntensity > 0;
  const showSnow  = (category === "snow") && snowIntensity > 0;
  const showFog   = category === "fog";
  const visibilityM = current?.visibilityM ?? 10000;

  return (
    <>
      {showRain && (
        <Rain intensity={rainIntensity} windSpeedMs={windSpeedMs} windDirDeg={windDirDeg} />
      )}
      {showSnow && (
        <>
          <Snow intensity={snowIntensity} windSpeedMs={windSpeedMs} windDirDeg={windDirDeg} />
          {snowAccumulating && (
            <SnowOnRoof
              intensity={snowIntensity}
              floorLength={floorLength}
              floorWidth={floorWidth}
              peak={peak}
              eave={eave}
            />
          )}
        </>
      )}
      {thunderstorm && <Lightning />}
      {(showFog || visibilityM < 5000) && <FogLayer visibilityM={visibilityM} />}
      <CloudDim cloudCover={cloudCover} />
    </>
  );
}
