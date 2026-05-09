/**
 * Kelvin color temperature → sRGB conversion (Tanner Helland 2012).
 * https://tannerhelland.com/2012/09/18/convert-temperature-rgb-algorithm-code.html
 *
 * Range: accurate ~1000K to ~40000K. We use 1800K (candle/dawn) to 6500K (overcast).
 *
 * Solar disk reference values:
 *   - Civil twilight (sun -6° to 0°):       ~2000K (deep amber/orange)
 *   - Sunrise / sunset:                     ~2500K
 *   - Golden hour (sun 0–10°):              ~3000K (warm gold)
 *   - Mid-morning / mid-afternoon (10–30°): ~4500K (warm white)
 *   - Solar noon (30°+ at moderate lat):    ~5500K (neutral white reference)
 *   - High noon at low lat / clear sky:     ~6500K (slightly cool)
 */

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export function kelvinToRGB(kelvin: number): RGB {
  const t = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number, g: number, b: number;

  // Red
  if (t <= 66) {
    r = 255;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
  }

  // Green
  if (t <= 66) {
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
  } else {
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  }

  // Blue
  if (t >= 66) {
    b = 255;
  } else if (t <= 19) {
    b = 0;
  } else {
    b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  }

  return {
    r: Math.max(0, Math.min(255, r)),
    g: Math.max(0, Math.min(255, g)),
    b: Math.max(0, Math.min(255, b)),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const toHex = (v: number) => {
    const h = Math.round(v).toString(16).padStart(2, "0");
    return h;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Map sun elevation in degrees to a perceptually elegant color temperature.
 * Drops smoothly from cool noon → warm horizon → cold night.
 */
export function sunKelvinFromElevation(elevDeg: number): number {
  if (elevDeg >= 30) return 5800; // neutral daylight
  if (elevDeg >= 15) {
    // 15° → 4800, 30° → 5800, smooth interp
    return 4800 + ((elevDeg - 15) / 15) * 1000;
  }
  if (elevDeg >= 5) {
    // 5° → 3500, 15° → 4800
    return 3500 + ((elevDeg - 5) / 10) * 1300;
  }
  if (elevDeg >= 0) {
    // 0° → 2400 (deep golden), 5° → 3500
    return 2400 + (elevDeg / 5) * 1100;
  }
  if (elevDeg >= -3) {
    // Civil twilight: 2000–2400
    return 2000 + ((elevDeg + 3) / 3) * 400;
  }
  return 1800; // night reference (mostly invisible)
}

/**
 * Sky parameters for drei <Sky /> at a given sun elevation.
 * Maps elevation onto turbidity / rayleigh / mieCoefficient curves.
 *
 * Turbidity rises near horizon (more dust + warm scatter).
 * Rayleigh stays moderate (controls blue band).
 * Mie strengthens slightly at low sun (golden halo).
 */
export interface SkyParams {
  turbidity: number;
  rayleigh: number;
  mieCoefficient: number;
  mieDirectionalG: number;
}

export function skyParamsFromElevation(elevDeg: number): SkyParams {
  // Smooth curves rather than discrete bands
  if (elevDeg < -3) {
    return { turbidity: 1.5, rayleigh: 0.05, mieCoefficient: 0.001, mieDirectionalG: 0.6 };
  }
  // 0..30° we ramp turbidity from 6 → 2
  const t = Math.max(0, Math.min(30, elevDeg));
  const turbidity = 6 - (t / 30) * 4; // 6 at horizon → 2 at 30°+
  const rayleigh = 1.2 - (t / 30) * 0.7; // 1.2 → 0.5
  const mieCoefficient = 0.005 + ((30 - t) / 30) * 0.005; // 0.01 at horizon → 0.005 noon
  const mieDirectionalG = 0.85 - ((30 - t) / 30) * 0.05; // 0.80 horizon → 0.85 noon
  return { turbidity, rayleigh, mieCoefficient, mieDirectionalG };
}
