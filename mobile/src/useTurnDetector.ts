import { DeviceMotion } from "expo-sensors";
import { useEffect, useRef } from "react";

// Book mode: a page turn looks like a clear movement of the phone (or book) followed by about a
// second of stillness. Calls onTurn once per turn. Does nothing if motion data is unavailable
// (the Next page button still works).
const MOVE_ROT = 50; // deg/s
const MOVE_ACC = 0.9; // m/s^2
const STILL_ROT = 25;
const STILL_ACC = 0.4;
const STILL_MS = 1000;

export function useTurnDetector(enabled: boolean, onTurn: () => void) {
  const cb = useRef(onTurn);
  cb.current = onTurn;
  useEffect(() => {
    if (!enabled) return;
    let sub: { remove: () => void } | null = null;
    let cancelled = false;
    let moved = false;
    let stillSince = 0;
    void (async () => {
      try {
        if (!(await DeviceMotion.isAvailableAsync())) return;
        const perm = await DeviceMotion.requestPermissionsAsync();
        if (!perm.granted || cancelled) return;
        DeviceMotion.setUpdateInterval(100);
        sub = DeviceMotion.addListener((m) => {
          const r = m.rotationRate;
          const a = m.acceleration;
          const rot = r ? Math.hypot(r.alpha, r.beta, r.gamma) : 0;
          const acc = a ? Math.hypot(a.x, a.y, a.z) : 0;
          if (rot > MOVE_ROT || acc > MOVE_ACC) {
            moved = true;
            stillSince = 0;
            return;
          }
          if (!moved) return;
          if (rot < STILL_ROT && acc < STILL_ACC) {
            if (!stillSince) stillSince = Date.now();
            else if (Date.now() - stillSince >= STILL_MS) {
              moved = false;
              stillSince = 0;
              cb.current();
            }
          } else stillSince = 0;
        });
      } catch {
        // No motion: rely on the Next page button.
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [enabled]);
}
