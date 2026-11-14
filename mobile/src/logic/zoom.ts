// Zoom for low-vision users (tested in zoom.test.ts).

// expo-camera on iOS sets videoZoomFactor = min * (max / min) ^ zoom. The back camera's photo
// format typically allows about 16× (digital), so these factors approximate "1×, 2×, 5×".
const MAX_FACTOR = 16;
const PINCH_MAX = 10;

export const ZOOM_CHIPS = [1, 2, 5] as const;

export function zoomForFactor(f: number): number {
  if (f <= 1) return 0;
  return Math.min(1, Math.log(f) / Math.log(MAX_FACTOR));
}

export function factorForZoom(z: number): number {
  return Math.pow(MAX_FACTOR, Math.max(0, Math.min(1, z)));
}

/** New CameraView zoom after a pinch of `scale` that started at zoom `start`. */
export function pinchZoom(start: number, scale: number): number {
  const f = Math.max(1, Math.min(PINCH_MAX, factorForZoom(start) * scale));
  return zoomForFactor(f);
}

/** The 1×/2×/5× chip to show as active, if the zoom is close to one. */
export function activeChip(z: number): number | null {
  const f = factorForZoom(z);
  for (const c of ZOOM_CHIPS) if (Math.abs(f - c) / c <= 0.15) return c;
  return null;
}

export type Contrast = "normal" | "high" | "invert";
export function nextContrast(c: Contrast): Contrast {
  return c === "normal" ? "high" : c === "high" ? "invert" : "normal";
}

/** Double-tap in the magnifier: zoomed out → 3×, zoomed in → back to 1×. */
export function magnifierScaleForDoubleTap(current: number): number {
  return current < 1.5 ? 3 : 1;
}
