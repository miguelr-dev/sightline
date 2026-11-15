import { describe, expect, it } from "vitest";
import {
  failureMessage,
  initialReach,
  liveFeaturesPaused,
  PROBE_INTERVAL_MS,
  PROBE_TIMEOUT_MS,
  reduceReach,
  REQUEST_TIMEOUTS,
  UNREACHABLE,
  type Reach,
  type ReachEvent,
} from "./reachability";

const run = (events: ReachEvent[], from: Reach = initialReach) => {
  let s = from;
  const effects: string[] = [];
  for (const e of events) {
    const r = reduceReach(s, e);
    s = r.state;
    effects.push(...r.effects.map((x) => x.type));
  }
  return { s, effects };
};
const ok: Reach = { state: "ok", probing: false, lastProbeAt: 1_000 };

describe("reachability state machine", () => {
  it("probes about every 20 s while the camera screen is up", () => {
    expect(run([{ type: "tick", at: 1_000 + PROBE_INTERVAL_MS - 1, cameraUp: true }], ok).effects).toEqual([]);
    const r = run([{ type: "tick", at: 1_000 + PROBE_INTERVAL_MS, cameraUp: true }], ok);
    expect(r.effects).toEqual(["probe"]);
    expect(r.s.probing).toBe(true);
  });

  it("doesn't probe on a timer while a sheet covers the camera", () => {
    expect(run([{ type: "tick", at: 100_000, cameraUp: false }], ok).effects).toEqual([]);
  });

  it("probes at once on foreground and after a request fails, but never two at a time", () => {
    expect(run([{ type: "foreground", at: 2_000 }], ok).effects).toEqual(["probe"]);
    expect(run([{ type: "requestFailed", at: 2_000 }], ok).effects).toEqual(["probe"]);
    expect(
      run(
        [
          { type: "foreground", at: 2_000 },
          { type: "requestFailed", at: 2_100 },
          { type: "tick", at: 60_000, cameraUp: true },
        ],
        ok,
      ).effects,
    ).toEqual(["probe"]);
  });

  it("a failed probe means down; Detect and barcodes pause", () => {
    const r = run([{ type: "requestFailed", at: 2_000 }, { type: "checked", reachable: false, at: 5_000 }], ok);
    expect(r.s.state).toBe("down");
    expect(r.s.probing).toBe(false);
    expect(liveFeaturesPaused(r.s.state)).toBe(true);
    expect(liveFeaturesPaused("ok")).toBe(false);
    expect(liveFeaturesPaused("checking")).toBe(false);
  });

  it("coming back refreshes features once; staying up doesn't", () => {
    const down: Reach = { state: "down", probing: false, lastProbeAt: 0 };
    const back = run([{ type: "tick", at: 30_000, cameraUp: true }, { type: "checked", reachable: true, at: 30_500 }], down);
    expect(back.s.state).toBe("ok");
    expect(back.effects).toEqual(["probe", "refresh"]);
    const still = run([{ type: "tick", at: 30_000, cameraUp: true }, { type: "checked", reachable: true, at: 30_500 }], ok);
    expect(still.effects).toEqual(["probe"]);
  });

  it("a request failure alone doesn't mark the server down (a probe decides)", () => {
    expect(run([{ type: "requestFailed", at: 2_000 }], ok).s.state).toBe("ok");
  });
});

describe("timeouts", () => {
  it("are short enough that a wrong address never means about 55 s of silence", () => {
    expect(PROBE_TIMEOUT_MS).toBe(3_000);
    expect(REQUEST_TIMEOUTS).toEqual({ analyze: 20_000, lookup: 15_000, barcode: 8_000, frameCheck: 6_000 });
  });

  it("a timeout or no answer gives a short error to say, never silence", () => {
    expect(failureMessage(-1)).toBe(UNREACHABLE);
    expect(failureMessage(0)).toBe(UNREACHABLE);
    expect(UNREACHABLE).toBe("Can't reach SightLine. Check the server in Settings.");
  });

  it("the server's own answers keep their own messages", () => {
    for (const status of [200, 400, 404, 429, 500, 502, 503]) expect(failureMessage(status)).toBeUndefined();
  });
});
