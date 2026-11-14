import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FRESH_MS,
  TTL_MS,
  WAIT_MS,
  annotateFrame,
  getFrame,
  putFrame,
  resetFrameStore,
  waitForFrame,
} from "@/lib/frameStore";

const jpeg = (n: number) => new Uint8Array([0xff, 0xd8, n]);

describe("frame store (latest hat frame, in memory only)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T09:00:00Z"));
    resetFrameStore();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("has the documented timings", () => {
    expect(FRESH_MS).toBe(2_500);
    expect(WAIT_MS).toBe(4_000);
    expect(TTL_MS).toBe(15_000);
  });

  it("uses a fresh frame right away", async () => {
    putFrame("hat-01", jpeg(1));
    vi.advanceTimersByTime(1_000);
    const frame = await waitForFrame("hat-01");
    expect(frame?.bytes).toEqual(jpeg(1));
  });

  it("waits for the next frame when the latest one is stale", async () => {
    putFrame("hat-01", jpeg(1));
    vi.advanceTimersByTime(3_000); // older than FRESH_MS
    const pending = waitForFrame("hat-01");
    vi.advanceTimersByTime(1_200);
    putFrame("hat-01", jpeg(2));
    const frame = await pending;
    expect(frame?.bytes).toEqual(jpeg(2));
  });

  it("gives up after WAIT_MS with no new frame", async () => {
    putFrame("hat-01", jpeg(1));
    vi.advanceTimersByTime(3_000);
    const pending = waitForFrame("hat-01");
    await vi.advanceTimersByTimeAsync(WAIT_MS + 10);
    await expect(pending).resolves.toBeUndefined();
  });

  it("only wakes waiters for the same hat", async () => {
    const pending = waitForFrame("hat-01");
    putFrame("hat-02", jpeg(9));
    await vi.advanceTimersByTimeAsync(WAIT_MS + 10);
    await expect(pending).resolves.toBeUndefined();
  });

  it("forgets frames after the TTL", () => {
    putFrame("hat-01", jpeg(1));
    vi.advanceTimersByTime(TTL_MS - 1);
    expect(getFrame("hat-01")).toBeDefined();
    vi.advanceTimersByTime(2);
    expect(getFrame("hat-01")).toBeUndefined();
  });

  it("keeps the frame check result with the frame it belongs to", () => {
    const first = putFrame("hat-01", jpeg(1));
    const second = putFrame("hat-01", jpeg(2));
    annotateFrame("hat-01", first, { ready: true, detected: true, key: "old" });
    expect(getFrame("hat-01")?.check).toBeUndefined(); // a newer frame replaced it
    annotateFrame("hat-01", second, { ready: true, detected: true, key: "red-bull-package" });
    expect(getFrame("hat-01")?.check?.key).toBe("red-bull-package");
  });
});
