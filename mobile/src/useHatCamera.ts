import { useEffect, useRef, useState } from "react";
import { deviceNext } from "./api";
import type { DeviceEvent } from "./modes";

// Polls /api/device/next for the hat camera's events, one request at a time, ~700 ms apart.
// The first poll only primes the cursor (plus anything from the last few seconds), so
// connecting never replays an old backlog.

const POLL_MS = 700;
const MISSING_POLL_MS = 5000; // route missing or server down: keep trying, slowly
const FRESH_MS = 8000;

import { hatStatusFor, type HatStatus } from "./logic/hatStatus";
export type { HatStatus } from "./logic/hatStatus";

export function useHatCamera({
  enabled,
  hardwareId,
  pairCode,
  onEvent,
}: {
  enabled: boolean;
  hardwareId: string;
  pairCode: string;
  onEvent: (e: DeviceEvent) => void;
}) {
  const [status, setStatus] = useState<HatStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const cb = useRef(onEvent);
  cb.current = onEvent;

  useEffect(() => {
    if (!enabled || !hardwareId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let after = "";
    let primed = false;
    setStatus("connecting");
    setLastEventAt(null);

    const poll = async () => {
      const { status: code, events, reason } = await deviceNext(hardwareId, pairCode, after);
      if (cancelled) return;
      setLastPollAt(Date.now());
      let wait = POLL_MS;
      if (code === 200) {
        setStatus("live");
        if (events.length) {
          after = events[events.length - 1].id;
          const now = Date.now();
          const todo = primed
            ? events
            : events.filter((e) => {
                const t = Date.parse(e.createdAt);
                return Number.isFinite(t) && now - t < FRESH_MS;
              });
          for (const e of todo) cb.current(e);
          if (todo.length) {
            const t = Date.parse(todo[todo.length - 1].createdAt);
            setLastEventAt(Number.isFinite(t) ? Math.min(t, now) : now);
          } else if (!primed) {
            const t = Date.parse(events[events.length - 1].createdAt);
            if (Number.isFinite(t)) setLastEventAt(t);
          }
        }
        primed = true;
      } else {
        const st = hatStatusFor(code, { reason });
        setStatus(st);
        wait = st === "offline" ? 2000 : MISSING_POLL_MS;
      }
      timer = setTimeout(() => void poll(), wait);
    };
    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [enabled, hardwareId, pairCode]);

  return { status, lastEventAt, lastPollAt };
}
