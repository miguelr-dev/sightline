import { DeviceMotion } from "expo-sensors";
import { useEffect, useRef } from "react";
import { MODES, type FrameCheck, type Mode } from "./modes";

// Semi-automatic reading. While enabled, waits until the phone is held roughly still, grabs a
// small silent frame and asks /api/frame-check what's in view.
// - detected: show a tappable suggestion card (onDetect).
// - ready twice in a row with the same key and confidence >= 0.7: read it automatically (onReady),
//   once per key, until the camera has moved on to something else.
// Checks run back to back (each ~1-2 s), never overlapping.

const STEADY_MS = 600;
const MIN_GAP_MS = 150; // pause after one check finishes before the next starts
const ERROR_BACKOFF_MS = 3000;
const TICK_MS = 150;
const NO_MOTION_GAP_MS = 400; // without motion data, keep checking back to back
// "Roughly still" for a hand-held phone, not tripod-still. Averaged over ~0.4 s.
const ROT_STEADY = 35; // deg/s
const ACC_STEADY = 0.6; // m/s^2, gravity removed
const SMOOTH = 4; // samples at 100 ms
const AUTO_CONFIDENCE = 0.7;
const REARM_NOT_READY = 3; // this many checks without the key = the camera moved on
const HINT_REPEAT_MS = 3000;
const HINT_GAP_MS = 5000;

export type Detection = { key: string; label: string; mode: Mode | null; confidence: number | null };

export type AutoDebug = {
  motion: "waiting" | "live" | "unavailable" | "denied";
  steady: boolean;
  steadyMs: number;
  rot: number;
  acc: number;
  inFlight: boolean;
  checks: number;
  last: string; // last frame-check result, short
  lastMs: number;
  lastAt: number;
};

type Options = {
  enabled: boolean;
  takeFrame: () => Promise<string | null>; // base64 JPEG ~512 px
  check: (image: string) => Promise<{ status: number; data: FrameCheck | null }>;
  onReady: (mode: Mode | null) => void;
  onDetect: (d: Detection | null) => void; // null = nothing detected in this frame
  onHint: (hint: string) => void;
  onUnavailable: () => void;
  onDebug?: (d: AutoDebug) => void;
};

function asMode(v: unknown): Mode | null {
  return typeof v === "string" && MODES.includes(v as Mode) ? (v as Mode) : null;
}

export function useAutoCapture(opts: Options) {
  const o = useRef(opts);
  o.current = opts;
  const inFlight = useRef<Promise<void> | null>(null);
  const grabbing = useRef<Promise<void> | null>(null);
  const st = useRef({
    steadySince: 0,
    lastCheck: 0,
    backoffUntil: 0,
    readKey: null as string | null, // last key read automatically or by tapping the card
    misses: 0, // checks in a row where readKey wasn't seen
    readyKey: null as string | null, // key of the previous check if it was ready
    detectKey: null as string | null, // key of the previous check if something was detected
    hint: null as { text: string; since: number } | null,
    lastHintAt: 0,
    rotBuf: [] as number[],
    accBuf: [] as number[],
  }).current;
  const dbg = useRef<AutoDebug>({
    motion: "waiting",
    steady: false,
    steadyMs: 0,
    rot: 0,
    acc: 0,
    inFlight: false,
    checks: 0,
    last: "none yet",
    lastMs: 0,
    lastAt: 0,
  }).current;

  useEffect(() => {
    if (!opts.enabled) return;
    st.steadySince = 0;
    st.readyKey = null;
    st.detectKey = null;
    let cancelled = false;
    let sub: { remove: () => void } | null = null;

    void (async () => {
      try {
        if (!(await DeviceMotion.isAvailableAsync())) {
          dbg.motion = "unavailable";
          return;
        }
        let perm = await DeviceMotion.getPermissionsAsync();
        if (!perm.granted && perm.canAskAgain) perm = await DeviceMotion.requestPermissionsAsync();
        if (!perm.granted) {
          dbg.motion = "denied";
          return;
        }
        if (cancelled) return;
        DeviceMotion.setUpdateInterval(100);
        sub = DeviceMotion.addListener((m) => {
          dbg.motion = "live";
          const r = m.rotationRate;
          const a = m.acceleration;
          st.rotBuf.push(r ? Math.hypot(r.alpha, r.beta, r.gamma) : 0);
          st.accBuf.push(a ? Math.hypot(a.x, a.y, a.z) : 0);
          if (st.rotBuf.length > SMOOTH) st.rotBuf.shift();
          if (st.accBuf.length > SMOOTH) st.accBuf.shift();
          const rot = st.rotBuf.reduce((x, y) => x + y, 0) / st.rotBuf.length;
          const acc = st.accBuf.reduce((x, y) => x + y, 0) / st.accBuf.length;
          dbg.rot = rot;
          dbg.acc = acc;
          const steady = rot < ROT_STEADY && acc < ACC_STEADY;
          if (!steady) st.steadySince = 0;
          else if (!st.steadySince) st.steadySince = Date.now();
        });
      } catch {
        dbg.motion = "unavailable"; // fall back to time-based checks
      }
    })();

    const run = async () => {
      const t0 = Date.now();
      st.lastCheck = t0;
      dbg.inFlight = true;
      try {
        const grab = o.current.takeFrame();
        grabbing.current = grab.then(
          () => undefined,
          () => undefined,
        );
        const image = await grab.finally(() => {
          grabbing.current = null;
        });
        if (!image || cancelled || !o.current.enabled) return;
        const { status, data } = await o.current.check(image);
        dbg.checks++;
        dbg.lastMs = Date.now() - t0;
        dbg.lastAt = Date.now();
        if (cancelled || !o.current.enabled) return;
        if (status === 404 || status === 405) {
          dbg.last = `HTTP ${status}: route missing`;
          o.current.onUnavailable();
          return;
        }
        if (!data) {
          dbg.last = `HTTP ${status || "no response"}`;
          st.backoffUntil = Date.now() + ERROR_BACKOFF_MS;
          return;
        }
        const conf = typeof data.confidence === "number" ? data.confidence : null;
        dbg.last = [
          data.ready ? "ready" : "not ready",
          data.detected ? `detected "${data.label ?? ""}"` : "",
          data.key ? `key=${data.key}` : "",
          conf !== null ? `conf=${conf.toFixed(2)}` : "",
          data.suggestedMode ? `mode=${data.suggestedMode}` : "",
          data.hint ? `hint="${data.hint}"` : "",
        ]
          .filter(Boolean)
          .join(" · ");

        // Has the camera moved on from what was last read?
        if (st.readKey && data.key !== st.readKey) {
          st.misses++;
          if (st.misses >= REARM_NOT_READY) st.readKey = null;
        } else st.misses = 0;

        const mode = asMode(data.suggestedMode);
        // Suggestion card: the same thing detected in two frames in a row (a sweep across a room
        // briefly "detects" things like an exit sign), and not just read.
        const seenTwice = !!data.detected && !!data.key && data.key === st.detectKey;
        st.detectKey = data.detected && data.key ? data.key : null;
        if (seenTwice && data.key && data.key !== st.readKey) {
          o.current.onDetect({ key: data.key, label: data.label?.trim() || "Something to read", mode, confidence: conf });
        } else {
          o.current.onDetect(null);
        }

        // Auto-read: ready on two checks in a row with the same key, confident, not read yet.
        const confident = conf === null ? false : conf >= AUTO_CONFIDENCE;
        if (data.ready && data.key) {
          const twice = st.readyKey === data.key;
          st.readyKey = data.key;
          if (twice && confident && data.key !== st.readKey) {
            st.readKey = data.key;
            st.misses = 0;
            st.readyKey = null;
            st.hint = null;
            o.current.onReady(mode);
            return;
          }
        } else {
          st.readyKey = null;
        }

        // Hints: only when the same one repeats for a while, and not too often.
        const t = Date.now();
        if (data.ready || data.detected || !data.hint) st.hint = null;
        else if (st.hint?.text !== data.hint) st.hint = { text: data.hint, since: t };
        else if (t - st.hint.since >= HINT_REPEAT_MS && t - st.lastHintAt >= HINT_GAP_MS) {
          st.lastHintAt = t;
          o.current.onHint(data.hint);
        }
      } catch (e) {
        dbg.last = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120);
        st.backoffUntil = Date.now() + ERROR_BACKOFF_MS;
      } finally {
        dbg.inFlight = false;
        st.lastCheck = Date.now(); // the gap counts from when this check finished
      }
    };

    const timer = setInterval(() => {
      const now = Date.now();
      const motion = dbg.motion === "live";
      dbg.steady = motion ? !!st.steadySince : true;
      dbg.steadyMs = motion && st.steadySince ? now - st.steadySince : 0;
      o.current.onDebug?.({ ...dbg });
      if (inFlight.current || cancelled) return;
      if (now < st.backoffUntil || now - st.lastCheck < MIN_GAP_MS) return;
      // With motion data, wait for a steady hold; without it, check on a timer.
      if (motion && !st.steadySince) {
        st.detectKey = null; // moving: a fresh pair of frames is needed again
        st.readyKey = null;
        return;
      }
      if (motion ? now - st.steadySince < STEADY_MS : now - st.lastCheck < NO_MOTION_GAP_MS) return;
      const p = run().finally(() => {
        inFlight.current = null;
      });
      inFlight.current = p;
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      sub?.remove();
      o.current.onDetect(null);
    };
  }, [opts.enabled, st, dbg]);

  return {
    /** Resolves once no frame grab is using the camera, so a manual capture never collides. */
    idle: () => grabbing.current ?? Promise.resolve(),
    /** The user tapped the card for this key: don't auto-read it again right after. */
    markRead: (key: string) => {
      st.readKey = key;
      st.misses = 0;
      st.readyKey = null;
    },
  };
}
