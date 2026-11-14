import type { FrameCheckResponse } from "./modes";

// Server-only: each hat camera's most recent frame, kept IN MEMORY ONLY so a voice command
// ("read this menu") can use what the hat sees right now. Photos are never written to Neon or
// disk, and a frame is forgotten after TTL_MS.
//
// This assumes a single server process (the Next server on the presenter's Mac). With several
// instances, a command could reach an instance that never saw the hat's frames.

/** A frame younger than this is used right away. */
export const FRESH_MS = 2_500;
/** Otherwise a command waits this long for the hat's next frame. */
export const WAIT_MS = 4_000;
/** Frames older than this are forgotten. */
export const TTL_MS = 15_000;

export type StoredFrame = {
  bytes: Uint8Array;
  at: number; // Date.now() when it arrived
  check?: FrameCheckResponse; // the frame check's result, once it's done
};

// Kept on globalThis: Next can bundle each route separately, and /api/device/frame and
// /api/device/command must share one store within the process.
type Store = {
  frames: Map<string, StoredFrame>;
  waiters: Map<string, Set<(frame: StoredFrame) => void>>;
};
const g = globalThis as typeof globalThis & { __sightlineFrameStore?: Store };
g.__sightlineFrameStore ??= { frames: new Map(), waiters: new Map() };
const { frames, waiters } = g.__sightlineFrameStore;

function sweep(now: number) {
  for (const [device, frame] of frames) {
    if (now - frame.at > TTL_MS) frames.delete(device);
  }
}

/** Store a hat's newest frame and wake any command waiting for it. */
export function putFrame(device: string, bytes: Uint8Array): StoredFrame {
  const now = Date.now();
  sweep(now);
  const frame: StoredFrame = { bytes, at: now };
  frames.set(device, frame);
  const waiting = waiters.get(device);
  if (waiting) {
    waiters.delete(device);
    for (const wake of waiting) wake(frame);
  }
  return frame;
}

/** Attach a frame check result, if `frame` is still the hat's latest. */
export function annotateFrame(device: string, frame: StoredFrame, check: FrameCheckResponse) {
  if (frames.get(device) === frame) frame.check = check;
}

/** The hat's latest frame if it's at most `maxAgeMs` old (default: anything within the TTL). */
export function getFrame(device: string, maxAgeMs = TTL_MS): StoredFrame | undefined {
  const frame = frames.get(device);
  if (!frame) return undefined;
  const age = Date.now() - frame.at;
  if (age > TTL_MS) {
    frames.delete(device);
    return undefined;
  }
  return age <= maxAgeMs ? frame : undefined;
}

/**
 * A frame for a command: the latest one if it's fresh, else the next one that arrives within
 * `timeoutMs`. Resolves undefined if none comes.
 */
export function waitForFrame(
  device: string,
  opts: { freshMs?: number; timeoutMs?: number } = {},
): Promise<StoredFrame | undefined> {
  const fresh = getFrame(device, opts.freshMs ?? FRESH_MS);
  if (fresh) return Promise.resolve(fresh);
  return new Promise((resolve) => {
    const set = waiters.get(device) ?? new Set();
    waiters.set(device, set);
    const timer = setTimeout(() => {
      set.delete(wake);
      if (!set.size && waiters.get(device) === set) waiters.delete(device);
      resolve(undefined);
    }, opts.timeoutMs ?? WAIT_MS);
    function wake(frame: StoredFrame) {
      clearTimeout(timer);
      resolve(frame);
    }
    set.add(wake);
  });
}

/** For tests. */
export function resetFrameStore() {
  frames.clear();
  waiters.clear();
}
