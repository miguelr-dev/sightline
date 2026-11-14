import { describe, expect, it } from "vitest";
import { averageLuma, isTooDark, DARK_LUMA } from "./brightness";
import { PNG } from "./brightness.fixtures";

describe("averageLuma: decodes a small PNG and averages its brightness", () => {
  it("reads a normal photo as bright (RGBA and RGB, every PNG filter type)", () => {
    expect(averageLuma(PNG.normalRgba)).toBeGreaterThan(150);
    expect(Math.abs(averageLuma(PNG.normalRgba) - averageLuma(PNG.normalRgb))).toBeLessThan(1);
  });

  it("reads PNGs written by a standard encoder", () => {
    expect(Math.abs(averageLuma(PNG.pilNormal) - averageLuma(PNG.normalRgb))).toBeLessThan(1);
  });

  it("reads a black frame as 0", () => {
    expect(averageLuma(PNG.black)).toBe(0);
  });

  it("returns NaN for data that isn't a PNG", () => {
    expect(averageLuma("aGVsbG8=")).toBeNaN();
  });
});

describe("isTooDark: the guard that keeps black frames from being sent", () => {
  it("rejects black and nearly black frames", () => {
    expect(isTooDark(averageLuma(PNG.black))).toBe(true);
    expect(isTooDark(averageLuma(PNG.darkRgba))).toBe(true);
  });

  it("keeps dim but readable and normal frames", () => {
    expect(isTooDark(averageLuma(PNG.dimRgb))).toBe(false);
    expect(isTooDark(averageLuma(PNG.normalRgba))).toBe(false);
  });

  it("never blocks a frame it couldn't measure", () => {
    expect(isTooDark(Number.NaN)).toBe(false);
    expect(DARK_LUMA).toBeGreaterThan(5);
  });
});
