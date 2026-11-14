"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// Full-screen photo magnifier, matching the iPhone app (mobile/src/components/Magnifier.tsx):
// pinch or double-tap to zoom (1× to 8×), drag to pan, and a contrast button that cycles
// Normal → High contrast → Inverted. Built on <dialog> so focus, Escape and the inert page
// behind it come from the browser. The − and + buttons and the + / − keys zoom without a pinch.

type Contrast = "normal" | "high" | "invert";
const NEXT: Record<Contrast, Contrast> = { normal: "high", high: "invert", invert: "normal" };
const LABEL: Record<Contrast, string> = { normal: "Normal", high: "High contrast", invert: "Inverted" };
const FILTER: Record<Contrast, string | undefined> = {
  normal: undefined,
  high: "grayscale(1) contrast(1.9)",
  invert: "invert(1)",
};
const MIN = 1;
const MAX = 8;
const clamp = (n: number) => Math.max(MIN, Math.min(MAX, n));

const btn =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[17px] font-semibold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white";

export function Magnifier({ src, open, onClose }: { src: string; open: boolean; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  const [scale, setScale] = useState(1);
  const [contrast, setContrast] = useState<Contrast>("normal");
  // The point (in screen pixels) that should stay put while the scale changes.
  const anchor = useRef<{ px: number; py: number; cx: number; cy: number } | null>(null);
  const pinch = useRef<{ d: number; s: number } | null>(null);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      setScale(1);
      d.showModal();
      doneRef.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  /** Zoom to `next`, keeping the content under (cx, cy) in place (default: the centre). */
  const zoomTo = useCallback(
    (next: number, cx?: number, cy?: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = cx ?? r.left + r.width / 2;
      const y = cy ?? r.top + r.height / 2;
      anchor.current = {
        px: (el.scrollLeft + x - r.left) / scale,
        py: (el.scrollTop + y - r.top) / scale,
        cx: x - r.left,
        cy: y - r.top,
      };
      setScale(clamp(next));
    },
    [scale],
  );

  useLayoutEffect(() => {
    const el = scrollRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollLeft = a.px * scale - a.cx;
    el.scrollTop = a.py * scale - a.cy;
    anchor.current = null;
  }, [scale]);

  const dist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  const mid = (t: React.TouchList) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2] as const;

  const label = scale <= 1.01 ? "Pinch or double-tap to zoom" : `${Math.round(scale * 10) / 10}× zoom`;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-label="Magnifier"
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button
            type="button"
            onClick={() => setContrast((c) => NEXT[c])}
            aria-label={`Contrast: ${LABEL[contrast]}. Tap to change.`}
            className={`${btn} bg-[#2C2C2E] text-white`}
          >
            <svg width={22} height={22} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.2" />
              <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" />
            </svg>
            {LABEL[contrast]}
          </button>
          <button ref={doneRef} type="button" onClick={() => dialogRef.current?.close()} className={`${btn} bg-white text-black`}>
            Done
          </button>
        </div>

        <div
          ref={scrollRef}
          tabIndex={0}
          role="region"
          aria-label="Zoomed photo. Use the plus and minus keys to zoom."
          className="min-h-0 flex-1 overflow-auto overscroll-contain [touch-action:pan-x_pan-y] focus-visible:outline focus-visible:outline-[3px] focus-visible:-outline-offset-4 focus-visible:outline-white"
          onKeyDown={(e) => {
            if (e.key === "+" || e.key === "=") zoomTo(scale * 1.5);
            else if (e.key === "-" || e.key === "_") zoomTo(scale / 1.5);
            else return;
            e.preventDefault();
          }}
          onClick={(e) => {
            // Double-tap (or double-click) toggles 1× / 3× at that point.
            const now = performance.now();
            const p = lastTap.current;
            if (now - p.t < 320 && Math.abs(e.clientX - p.x) < 30 && Math.abs(e.clientY - p.y) < 30) {
              lastTap.current = { t: 0, x: 0, y: 0 };
              zoomTo(scale < 1.5 ? 3 : 1, e.clientX, e.clientY);
            } else lastTap.current = { t: now, x: e.clientX, y: e.clientY };
          }}
          onTouchStart={(e) => {
            if (e.touches.length === 2) pinch.current = { d: dist(e.touches), s: scale };
          }}
          onTouchMove={(e) => {
            if (!pinch.current || e.touches.length !== 2) return;
            const [x, y] = mid(e.touches);
            zoomTo((pinch.current.s * dist(e.touches)) / pinch.current.d, x, y);
          }}
          onTouchEnd={(e) => {
            if (e.touches.length < 2) pinch.current = null;
          }}
        >
          <div style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
            <img
              src={src}
              alt="The photo you took"
              draggable={false}
              className="h-full w-full select-none object-contain"
              style={{ filter: FILTER[contrast] }}
            />
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => zoomTo(scale / 1.5)}
            disabled={scale <= MIN}
            aria-label="Zoom out"
            className={`${btn} h-12 w-12 bg-[#2C2C2E] px-0 text-[26px] leading-none disabled:opacity-40`}
          >
            −
          </button>
          <p aria-live="polite" className="rounded-full bg-[#2C2C2E] px-4 py-2 text-center text-[15px] font-semibold">
            {label}
          </p>
          <button
            type="button"
            onClick={() => zoomTo(scale * 1.5)}
            disabled={scale >= MAX}
            aria-label="Zoom in"
            className={`${btn} h-12 w-12 bg-[#2C2C2E] px-0 text-[26px] leading-none disabled:opacity-40`}
          >
            +
          </button>
        </div>
      </div>
    </dialog>
  );
}
