import { describe, expect, it } from "vitest";
import { initialBarcodeState, reduceBarcode } from "./barcode";
import { hintDelivery } from "./hints";
import { aspectFill, normBoxToView, cornersToRect, bracketVisible } from "./brackets";

const COKE = "5449000000996";

describe("QA #1: a barcode seen only once must not pause Detect forever", () => {
  it("an unconfirmed sighting expires after about 700 ms", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "seen", code: COKE, at: 0 }).state;
    expect(s.pending).not.toBeNull();
    s = reduceBarcode(s, { type: "tick", at: 500 }).state;
    expect(s.pending).not.toBeNull();
    s = reduceBarcode(s, { type: "tick", at: 800 }).state;
    expect(s.pending).toBeNull();
  });
});

describe("QA #2: the barcode card never outlives a sheet", () => {
  it("opening a sheet clears the confirmed code and the card", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "seen", code: COKE, at: 0 }).state;
    s = reduceBarcode(s, { type: "seen", code: COKE, at: 200 }).state;
    const r = reduceBarcode(s, { type: "sheetOpened" });
    expect(r.state.confirmed).toBeNull();
    expect(r.state.pending).toBeNull();
    expect(r.effects).toEqual([{ type: "gone" }]);
  });
  it("closing a sheet clears the card too; only fresh sightings bring it back", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "seen", code: COKE, at: 0 }).state;
    s = reduceBarcode(s, { type: "seen", code: COKE, at: 200 }).state;
    const r = reduceBarcode(s, { type: "sheetClosed" });
    expect(r.effects).toEqual([{ type: "gone" }]);
    expect(r.state.confirmed).toBeNull();
  });
});

describe("QA #7: hints are visual only, unless a session asked for speech", () => {
  it("never uses TTS for framing hints", () => {
    expect(hintDelivery({ screenReader: false })).toEqual({ show: true, announce: false, speak: false });
  });
  it("announces to VoiceOver when it's on", () => {
    expect(hintDelivery({ screenReader: true })).toEqual({ show: true, announce: true, speak: false });
  });
  it("speaks inside an explicit session (book retake, entering BARCODE mode)", () => {
    expect(hintDelivery({ screenReader: false, session: "book" }).speak).toBe(true);
    expect(hintDelivery({ screenReader: false, session: "barcodeEntry" }).speak).toBe(true);
    expect(hintDelivery({ screenReader: true, session: "book" })).toEqual({ show: true, announce: true, speak: false });
  });
});

describe("brackets: coordinate mapping", () => {
  it("aspect-fill scales to cover the view and centers the overflow", () => {
    // 3:4 photo into a 393x852 portrait view: height-limited → scale by height, crop the sides
    const t = aspectFill({ w: 393, h: 852 }, { w: 1200, h: 1600 });
    expect(t.scale).toBeCloseTo(852 / 1600, 5);
    expect(t.dx).toBeCloseTo((393 - 1200 * (852 / 1600)) / 2, 5);
    expect(t.dy).toBe(0);
  });
  it("a frame with the same aspect as the view maps 1:1", () => {
    const t = aspectFill({ w: 400, h: 800 }, { w: 200, h: 400 });
    expect(t).toEqual({ scale: 2, dx: 0, dy: 0 });
  });
  it("a wider view crops the top and bottom", () => {
    const t = aspectFill({ w: 800, h: 400 }, { w: 400, h: 400 });
    expect(t.scale).toBe(2);
    expect(t.dy).toBe(-200);
  });
  it("maps a normalized box from the frame to view points", () => {
    const r = normBoxToView({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, { w: 400, h: 800 }, { w: 200, h: 400 });
    expect(r).toEqual({ x: 100, y: 400, w: 200, h: 200 });
  });
  it("clamps boxes to the view", () => {
    const r = normBoxToView({ x: -0.1, y: 0.9, w: 0.5, h: 0.5 }, { w: 400, h: 800 }, { w: 400, h: 800 });
    expect(r).toEqual({ x: 0, y: 720, w: 160, h: 80 });
  });
  it("turns barcode corner points (already in view points on iOS) into a rect", () => {
    expect(
      cornersToRect([
        { x: 110, y: 300 },
        { x: 290, y: 305 },
        { x: 288, y: 380 },
        { x: 112, y: 376 },
      ]),
    ).toEqual({ x: 110, y: 300, w: 180, h: 80 });
    expect(cornersToRect([])).toBeNull();
  });
});

describe("brackets: when to show them", () => {
  it("only while steady, with a target, and not stale", () => {
    expect(bracketVisible({ steady: true, hasTarget: true, ageMs: 500, kind: "detect" })).toBe(true);
    expect(bracketVisible({ steady: false, hasTarget: true, ageMs: 500, kind: "detect" })).toBe(false);
    expect(bracketVisible({ steady: true, hasTarget: false, ageMs: 500, kind: "detect" })).toBe(false);
    expect(bracketVisible({ steady: true, hasTarget: true, ageMs: 3000, kind: "detect" })).toBe(false);
  });
  it("barcode boxes are live, so they fade much sooner", () => {
    expect(bracketVisible({ steady: true, hasTarget: true, ageMs: 400, kind: "barcode" })).toBe(true);
    expect(bracketVisible({ steady: true, hasTarget: true, ageMs: 900, kind: "barcode" })).toBe(false);
  });
});
