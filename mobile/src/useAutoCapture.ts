import { DeviceMotion } from "expo-sensors";
import { useEffect, useRef } from "react";
import type { FrameCheck } from "./modes";

// Semi-automatic reading. While enabled, waits until the phone has been held steady for
// STEADY_MS, grabs a small silent frame, and asks /api/frame-check whether there's something
// readable. A "ready" frame with a new key triggers a full capture. One check in flight at a time,
// at most about one a second.

const STEADY_MS = 700;
const MIN_GAP_MS = 1000;
const ERROR_BACKOFF_MS = 3000;
const TICK_MS = 150;
const ROT_STEADY = 14; // deg/s
const ACC_STEADY = 0.25; // m/s^2, gravity removed
const REARM_NOT_READY = 3; // this many "not ready" answers in a row = the camera moved on
const HINT_REPEAT_MS = 3000;
const HINT_GAP_MS = 5000;

type Options = {
  enabled: boolean;
  takeFrame: () => Promise<string | null>; // base64 JPEG ~512 px
  check: (image: string) => Promise<{ status: number; data: FrameCheck | null }>;
  onReady: () => void;
  onHint: (hint: string) => void;
  onUnavailable: () => void;
};

export function useAutoCapture(opts: Options) {
  const o = useRef(opts);
  o.current = opts;
  const inFlight = useRef<Promise<void> | null>(null);
  const grabbing = useRef<Promise<void> | null>(null);
  const state = useRef({
    steadySince: 0,
    lastCheck: 0,
    backoffUntil: 0,
    lastKey: null as string | null,
    armed: true, // for servers that don't send a key: re-read only after the view changes
    notReady: 0,
    hint: null as { text: string; since: number } | null,
    lastHintAt: 0,
  });

  useEffect(() => {
    if (!opts.enabled) return;
    const st = state.current;
    st.steadySince = 0;
    let motion = false; // true once DeviceMotion is delivering data
    let cancelled = false;
    let sub: { remove: () => void } | null = null;

    void (async () => {
      try {
        if (!(await DeviceMotion.isAvailableAsync())) return;
        const perm = await DeviceMotion.requestPermissionsAsync();
        if (!perm.granted || cancelled) return;
        DeviceMotion.setUpdateInterval(100);
        sub = DeviceMotion.addListener((m) => {
          motion = true;
          const r = m.rotationRate;
          const a = m.acceleration;
          const rot = r ? Math.hypot(r.alpha, r.beta, r.gamma) : 0;
          const acc = a ? Math.hypot(a.x, a.y, a.z) : 0;
          const steady = rot < ROT_STEADY && acc < ACC_STEADY;
          if (!steady) st.steadySince = 0;
          else if (!st.steadySince) st.steadySince = Date.now();
          if (rot > 60) st.armed = true; // a big turn means a new view
        });
      } catch {
        // No motion data: fall back to time-based checks below.
      }
    })();

    const run = async () => {
      const now = Date.now();
      st.lastCheck = now;
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
        if (cancelled || !o.current.enabled) return;
        if (status === 404 || status === 405) {
          o.current.onUnavailable();
          return;
        }
        if (!data) {
          st.backoffUntil = Date.now() + ERROR_BACKOFF_MS;
          return;
        }
        if (data.ready) {
          st.notReady = 0;
          st.hint = null;
          const fresh = data.key ? data.key !== st.lastKey : st.armed;
          if (fresh) {
            st.lastKey = data.key ?? null;
            st.armed = false;
            o.current.onReady();
          }
          return;
        }
        st.notReady++;
        if (st.notReady >= REARM_NOT_READY) {
          st.lastKey = null;
          st.armed = true;
        }
        const t = Date.now();
        if (!data.hint) st.hint = null;
        else if (st.hint?.text !== data.hint) st.hint = { text: data.hint, since: t };
        else if (t - st.hint.since >= HINT_REPEAT_MS && t - st.lastHintAt >= HINT_GAP_MS) {
          st.lastHintAt = t;
          o.current.onHint(data.hint);
        }
      } catch {
        st.backoffUntil = Date.now() + ERROR_BACKOFF_MS;
      }
    };

    const timer = setInterval(() => {
      if (inFlight.current || cancelled) return;
      const now = Date.now();
      if (now < st.backoffUntil || now - st.lastCheck < MIN_GAP_MS) return;
      // With motion data, wait for a steady hold; without it, check about every 1.5 s.
      if (motion ? !st.steadySince || now - st.steadySince < STEADY_MS : now - st.lastCheck < 1500) return;
      const p = run().finally(() => {
        inFlight.current = null;
      });
      inFlight.current = p;
    }, TICK_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
      sub?.remove();
    };
  }, [opts.enabled]);

  return {
    /** Resolves once no frame grab is using the camera, so a manual capture never collides. */
    idle: () => grabbing.current ?? Promise.resolve(),
  };
}
