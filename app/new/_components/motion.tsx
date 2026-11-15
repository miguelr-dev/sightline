"use client";

import * as React from "react";
import { Pause, Play, RotateCcw } from "lucide-react";

import { usePrefersReducedMotion } from "@/components/ui/coverflow-carousel";

/** How much of a graphic must be on screen before it plays. */
const SHOW_AT = 0.35;

type Status =
  | "idle" // not measured yet (server render): show the finished frame
  | "armed" // off screen: wait at the first frame
  | "playing"
  | "paused" // paused with the button
  | "done"; // played its loops: rest on the finished frame

/**
 * A scripted timeline for one animated graphic. It starts when the graphic
 * scrolls into view, plays `loops` times, then rests on the `still` frame.
 * Scrolling away and back replays it. Visitors who prefer reduced motion
 * only ever see the still frame. Returns the ref for the graphic's box, and
 * the stage, whose `t` is milliseconds into the loop.
 */
export function useStage(length: number, still: number, loops = 2) {
  const reduced = usePrefersReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<Status>("idle");
  const [t, setT] = React.useState(0);
  const statusRef = React.useRef<Status>("idle");
  const elapsed = React.useRef(0);

  React.useEffect(() => {
    statusRef.current = status;
  }, [status]);

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const now = statusRef.current;
        if (entry.intersectionRatio >= SHOW_AT) {
          if (now === "idle" || now === "armed") {
            elapsed.current = 0;
            setT(0);
            setStatus("playing");
          }
        } else if (!entry.isIntersecting && now !== "paused" && now !== "armed") {
          elapsed.current = 0;
          setT(0);
          setStatus("armed");
        }
      },
      { threshold: [0, SHOW_AT] },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    if (status !== "playing" || reduced) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      // A frame's timestamp can be a touch earlier than `last`; never run backwards.
      elapsed.current += Math.max(0, now - last);
      last = now;
      if (elapsed.current >= length * loops) {
        setStatus("done");
        return;
      }
      // Thirty steps a second is plenty: the motion itself is CSS transitions.
      setT(Math.floor((elapsed.current % length) / 33) * 33);
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [status, reduced, length, loops]);

  const toggle = React.useCallback(() => {
    const now = statusRef.current;
    if (now === "playing") setStatus("paused");
    else if (now === "paused") setStatus("playing");
    else {
      elapsed.current = 0;
      setT(0);
      setStatus("playing");
    }
  }, []);

  const shown = reduced || status === "idle" || status === "done" ? still : status === "armed" ? 0 : t;
  // The ref goes separately: an object holding a ref can't be read in render.
  const stage = { t: shown, status, toggle, reduced, frozen: status === "paused" };
  return [ref, stage] as const;
}

export type Stage = ReturnType<typeof useStage>[1];

/** Pause, play or replay one graphic. Hidden when motion is reduced. */
export function StageToggle({ stage, label, dark }: { stage: Stage; label: string; dark?: boolean }) {
  if (stage.reduced) return null;
  const playing = stage.status === "playing";
  const paused = stage.status === "paused";
  const Icon = playing ? Pause : paused ? Play : RotateCcw;
  const verb = playing ? "Pause" : paused ? "Play" : "Replay";
  return (
    <button
      type="button"
      onClick={stage.toggle}
      aria-label={`${verb} the ${label} animation`}
      className={`stage-toggle ${dark ? "stage-toggle-dark" : ""}`}
    >
      <Icon
        className="size-4"
        strokeWidth={playing || paused ? 0 : 2.4}
        fill={playing || paused ? "currentColor" : "none"}
        aria-hidden
      />
    </button>
  );
}

/**
 * Fades and lifts its children in the first time they scroll into view.
 * Visible from the start for the server render, reduced motion, and anything
 * already on screen when the page loads.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "li";
}) {
  const ref = React.useRef<HTMLDivElement & HTMLLIElement>(null);
  const [state, setState] = React.useState<"idle" | "armed" | "in">("idle");

  React.useEffect(() => {
    const node = ref.current;
    if (!node || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let first = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (first) {
          first = false;
          // Already on screen at load: leave it be.
          if (entry.isIntersecting) {
            observer.disconnect();
            return;
          }
          setState("armed");
          return;
        }
        if (entry.isIntersecting) {
          setState("in");
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <Tag
      ref={ref}
      className={`rv ${className ?? ""}`}
      data-rv={state}
      style={delay ? ({ "--rv-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </Tag>
  );
}
