import { describe, expect, it } from "vitest";
import { ZOOM_CHIPS, zoomForFactor, factorForZoom, pinchZoom, activeChip, nextContrast, magnifierScaleForDoubleTap } from "./zoom";

describe("camera zoom mapping (expo-camera: factor = max^zoom on iOS)", () => {
  it("chips are 1×, 2×, 5×", () => {
    expect(ZOOM_CHIPS).toEqual([1, 2, 5]);
  });
  it("maps optical-equivalent factors to CameraView zoom 0–1", () => {
    expect(zoomForFactor(1)).toBe(0);
    expect(zoomForFactor(2)).toBeCloseTo(0.25, 2);
    expect(zoomForFactor(5)).toBeCloseTo(0.58, 2);
    expect(zoomForFactor(100)).toBe(1);
    expect(zoomForFactor(0.5)).toBe(0);
  });
  it("round-trips", () => {
    expect(factorForZoom(zoomForFactor(3))).toBeCloseTo(3, 5);
  });
  it("pinch multiplies the starting factor and clamps to 1×–10×", () => {
    expect(factorForZoom(pinchZoom(zoomForFactor(2), 1.5))).toBeCloseTo(3, 5);
    expect(factorForZoom(pinchZoom(0, 0.3))).toBeCloseTo(1, 5);
    expect(factorForZoom(pinchZoom(zoomForFactor(5), 4))).toBeCloseTo(10, 5);
  });
  it("highlights the chip nearest the current factor (within 15%)", () => {
    expect(activeChip(zoomForFactor(1))).toBe(1);
    expect(activeChip(zoomForFactor(2.1))).toBe(2);
    expect(activeChip(zoomForFactor(3))).toBeNull();
    expect(activeChip(zoomForFactor(5))).toBe(5);
  });
});

describe("magnifier", () => {
  it("contrast cycles Normal → High contrast → Inverted → Normal", () => {
    expect(nextContrast("normal")).toBe("high");
    expect(nextContrast("high")).toBe("invert");
    expect(nextContrast("invert")).toBe("normal");
  });
  it("double-tap toggles 1× and 3×", () => {
    expect(magnifierScaleForDoubleTap(1)).toBe(3);
    expect(magnifierScaleForDoubleTap(2.2)).toBe(1);
    expect(magnifierScaleForDoubleTap(1.05)).toBe(3);
  });
});
