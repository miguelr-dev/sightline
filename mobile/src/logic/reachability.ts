// Is the SightLine server reachable? Re-checked when the app comes to the foreground, about
// every 20 s while the camera screen is up, and right after a request times out or gets no
// answer, so a Mac whose IP changed shows "Can't reach the server" within seconds instead of
// leaving the user in silence. Pure, so it's unit-tested (reachability.test.ts).

export type ReachState = "checking" | "ok" | "down";

export const PROBE_TIMEOUT_MS = 3_000; // GET /api/features
export const PROBE_INTERVAL_MS = 20_000;

/** Per-request timeouts (ms). Normal answers take 1–7 s; past these the server is likely gone. */
export const REQUEST_TIMEOUTS = {
  analyze: 20_000,
  lookup: 15_000,
  barcode: 8_000,
  frameCheck: 6_000,
} as const;

export const UNREACHABLE = "Can't reach SightLine. Check the server in Settings.";

/** What to say when a request failed. status -1 = timed out, 0 = no answer at all (wrong
 *  address, no network). Other statuses are the server's own answers: undefined here. */
export function failureMessage(status: number): string | undefined {
  return status === -1 || status === 0 ? UNREACHABLE : undefined;
}

export type Reach = { state: ReachState; probing: boolean; lastProbeAt: number };
export const initialReach: Reach = { state: "checking", probing: false, lastProbeAt: 0 };

export type ReachEvent =
  | { type: "tick"; at: number; cameraUp: boolean } // a timer while the app is open
  | { type: "foreground"; at: number }
  | { type: "requestFailed"; at: number } // a request timed out or got no answer
  | { type: "checked"; reachable: boolean; at: number }; // a probe or full check finished

// probe: GET /api/features now. refresh: the server is back: re-read voices, history, features.
export type ReachEffect = { type: "probe" } | { type: "refresh" };

export function reduceReach(s: Reach, e: ReachEvent): { state: Reach; effects: ReachEffect[] } {
  const probe = (at: number) => ({ state: { ...s, probing: true, lastProbeAt: at }, effects: [{ type: "probe" as const }] });
  const none = { state: s, effects: [] as ReachEffect[] };
  switch (e.type) {
    case "tick":
      return !s.probing && e.cameraUp && e.at - s.lastProbeAt >= PROBE_INTERVAL_MS ? probe(e.at) : none;
    case "foreground":
    case "requestFailed":
      return s.probing ? none : probe(e.at);
    case "checked": {
      const state: ReachState = e.reachable ? "ok" : "down";
      return {
        state: { state, probing: false, lastProbeAt: e.at },
        effects: e.reachable && s.state === "down" ? [{ type: "refresh" }] : [],
      };
    }
  }
}

/** Detect and barcode lookups pause, quietly, while the server can't be reached. */
export function liveFeaturesPaused(state: ReachState): boolean {
  return state === "down";
}
