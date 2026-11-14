import { DeviceMotion } from "expo-sensors";
import { useEffect, useRef } from "react";
import { initialAutoState, markRead as markReadState, reduceFrame, type AutoState } from "./logic/autoCapture";
import type { FrameCheck } from "./modes";

export type { Detection } from "./logic/autoCapture";
import type { Detection } from "./logic/autoCapture";

// Auto mode. While enabled, waits until the phone is held roughly still, grabs a small silent
// frame and asks /api/frame-check what's in view. It never reads by itself: it only offers a
// tappable card (onDetect) and the occasional hint. Decisions live in logic/autoCapture.ts.
// Checks run back to back (each ~1-2 s), never overlapping.

const STEADY_MS = 600;
const MIN_GAP_MS = 150; // pause after one check finishes before the next starts
const DARK_RETRY_MS = 700; // a black frame is retried soon, without a server call
const ERROR_BACKOFF_MS = 3000;
const TICK_MS = 150;
const NO_MOTION_GAP_MS = 400; // without motion data, keep checking back to back
// "Roughly still" for a hand-held phone, not tripod-still. Averaged over ~0.4 s.
const ROT_STEADY = 35; // deg/s
const ACC_STEADY = 0.6; // m/s^2, gravity removed
const SMOOTH = 4; // samples at 100 ms

export type AutoDebug = {
  motion: "waiting" | "live" | "unavailable" | "denied";
  steady: boolean;
  steadyMs: number;
  rot: number;
  acc: number;
  inFlight: boolean;
  checks: number;
  darkSkipped: number;
  last: string; // last frame-check result, short
  lastMs: number;
  lastAt: number;
};

export type Frame = { image: string } | { dark: true; luma: number } | null;

type Options = {
  enabled: boolean;
  takeFrame: () => Promise<Frame>; // base64 JPEG ~512 px, or "too dark" (not sent)
  check: (image: string) => Promise<{ status: number; data: FrameCheck | null }>;
  onDetect: (d: Detection | null, appeared: boolean) => void; // null = nothing detected
  onHint: (hint: string) => void;
  onUnavailable: () => void;
  onDebug?: (d: AutoDebug) => void;
};

export function useAutoCapture(opts: Options) {
  const o = useRef(opts);
  o.current = opts;
  const inFlight = useRef<Promise<void> | null>(null);
  const grabbing = useRef<Promise<void> | null>(null);
  const logic = useRef<AutoState>(initialAutoState);
  const st = useRef({
    steadySince: 0,
    lastCheck: 0,
    waitUntil: 0,
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
    darkSkipped: 0,
    last: "none yet",
    lastMs: 0,
    lastAt: 0,
  }).current;

  useEffect(() => {
    if (!opts.enabled) return;
    st.steadySince = 0;
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
      dbg.inFlight = true;
      try {
        const grab = o.current.takeFrame();
        grabbing.current = grab.then(
          () => undefined,
          () => undefined,
        );
        const frame = await grab.finally(() => {
          grabbing.current = null;
        });
        if (!frame || cancelled || !o.current.enabled) return;
        if ("dark" in frame) {
          // Nearly black frame: don't waste a server call, try again shortly.
          dbg.darkSkipped++;
          dbg.last = `skipped: too dark (luma ${frame.luma.toFixed(0)})`;
          st.waitUntil = Date.now() + DARK_RETRY_MS;
          return;
        }
        const { status, data } = await o.current.check(frame.image);
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
          st.waitUntil = Date.now() + ERROR_BACKOFF_MS;
          return;
        }
        dbg.last = [
          data.ready ? "ready" : "not ready",
          data.detected ? `detected "${data.label ?? ""}"` : "",
          data.key ? `key=${data.key}` : "",
          typeof data.confidence === "number" ? `conf=${data.confidence.toFixed(2)}` : "",
          data.suggestedMode ? `mode=${data.suggestedMode}` : "",
          data.hint ? `hint="${data.hint}"` : "",
        ]
          .filter(Boolean)
          .join(" · ");
        const out = reduceFrame(logic.current, data, Date.now());
        logic.current = out.state;
        o.current.onDetect(out.card, out.appeared);
        if (out.speakHint) o.current.onHint(out.speakHint);
      } catch (e) {
        dbg.last = `error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 120);
        st.waitUntil = Date.now() + ERROR_BACKOFF_MS;
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
      if (now < st.waitUntil || now - st.lastCheck < MIN_GAP_MS) return;
      if (motion ? !st.steadySince || now - st.steadySince < STEADY_MS : now - st.lastCheck < NO_MOTION_GAP_MS) return;
      const p = run().finally(() => {
        inFlight.current = null;
      });
      inFlight.current = p;
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      sub?.remove();
      o.current.onDetect(null, false);
    };
  }, [opts.enabled, st, dbg]);

  return {
    /** Resolves once no frame grab is using the camera, so a manual capture never collides. */
    idle: () => grabbing.current ?? Promise.resolve(),
    /** The user tapped the card (or Capture) for this item: don't offer it again right away. */
    markRead: (key: string) => {
      logic.current = markReadState(logic.current, key);
    },
  };
}
