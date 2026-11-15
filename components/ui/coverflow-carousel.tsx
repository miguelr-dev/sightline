"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

import { cn } from "@/lib/utils";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? React.useLayoutEffect : React.useEffect;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True when the visitor asked the OS for less motion. False on the server. */
export function usePrefersReducedMotion() {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

export interface CoverflowSlideState {
  /** The carousel was paused with the pause button. Freeze, don't reset. */
  paused: boolean;
  /** The visitor prefers reduced motion. Show a still, finished frame. */
  reducedMotion: boolean;
}

export interface CoverflowSlide {
  /** Image source. Ignored when `render` is set. */
  src?: string;
  alt?: string;
  title?: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  /** Accessible name for the slide. Falls back to `title`. */
  label?: string;
  /**
   * Custom card content in place of the image. `active` is true only for the
   * centred card, so it can play an animation while the side cards stay still.
   */
  render?: (active: boolean, state: CoverflowSlideState) => React.ReactNode;
  /** How long autoplay holds this slide, in ms. Falls back to `autoplay`. */
  duration?: number;
}

export interface CoverflowCarouselProps {
  slides: CoverflowSlide[];
  /** Degrees the first neighbour tilts. */
  rotate?: number;
  /** How far the first neighbour recedes, as a fraction of card width. */
  depth?: number;
  /** Viewer distance as a multiple of card width — smaller is a wider lens. */
  perspective?: number;
  /** Exponent on distance. Below 1 the rake eases off as cards travel out. */
  falloff?: number;
  /** Opacity lost per step from the centre. */
  fade?: number;
  /** Any CSS length. Everything else is derived from it, so the rake scales. */
  cardWidth?: string;
  /** Card width divided by card height. 1 is square; 9 / 16 is a tall phone card. */
  aspectRatio?: number;
  /** Space between cards, as a fraction of card width. */
  gap?: number;
  loop?: boolean;
  /**
   * Advance every this many ms (or each slide's own `duration`). 0 turns it off.
   * Autoplay pauses on hover, focus and drag, can be paused with a visible
   * button, and never runs when the visitor prefers reduced motion.
   */
  autoplay?: number;
  showCaption?: boolean;
  showPagination?: boolean;
  showNavigation?: boolean;
  /** Names the carousel for assistive tech. */
  label?: string;
  className?: string;
  cardClassName?: string;
}

export function CoverflowCarousel({
  slides,
  rotate = 44,
  depth = 0.6,
  perspective = 3,
  falloff = 0.56,
  fade = 0.1,
  cardWidth = "clamp(148px, 22vw, 260px)",
  aspectRatio = 1,
  gap = 0.05,
  loop = true,
  autoplay = 0,
  showCaption = false,
  showPagination = false,
  showNavigation = false,
  label = "Cover carousel",
  className,
  cardClassName,
}: CoverflowCarouselProps) {
  const count = slides.length;
  const reducedMotion = usePrefersReducedMotion();
  const regionId = React.useId();

  const frameRef = React.useRef<HTMLDivElement>(null);
  const cardRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  /** Fractional card index at the centre. The single source of truth. */
  const posRef = React.useRef(0);
  /** Where the current settle is headed. Stepping off `pos` instead would
      swallow a keypress that lands mid-flight, before the round-off moves. */
  const targetRef = React.useRef(0);
  const widthRef = React.useRef(0);
  const rafRef = React.useRef<number | null>(null);
  const dragRef = React.useRef<{
    id: number;
    x: number;
    startX: number;
    pos: number;
    v: number;
    t: number;
  } | null>(null);

  const [selected, setSelected] = React.useState(0);
  // Autoplay state. `playing` is the visitor's choice via the button; the
  // others are transient pauses that lift on their own.
  const [playing, setPlaying] = React.useState(true);
  const [hovered, setHovered] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);

  const canAutoplay = autoplay > 0 && !reducedMotion && count > 1;
  const advancing = canAutoplay && playing && !hovered && !focused && !dragging;
  // Only a press of the pause button stops the card demos. Hover and focus
  // stop the carousel moving on, not the demo being watched.
  const paused = canAutoplay ? !playing : false;

  /** Nearest whole card, folded back into 0..count-1. */
  const indexAt = React.useCallback(
    (pos: number) => ((Math.round(pos) % count) + count) % count,
    [count],
  );

  // Paint straight to the DOM. Sixty state updates a second would re-render
  // every card for numbers React never needs to see.
  const paint = React.useCallback(() => {
    const width = widthRef.current;
    if (!width) return;
    const pitch = width * (1 + gap);
    const pos = posRef.current;

    cardRefs.current.forEach((card, index) => {
      if (!card) return;

      // Fold the distance into the shorter way round the ring. This is the
      // whole looping mechanism — no cloned nodes, no shuffling the DOM.
      let offset = index - pos;
      if (loop) {
        offset = ((offset % count) + count) % count;
        if (offset > count / 2) offset -= count;
      }

      const distance = Math.abs(offset);
      // Both the tilt and the recession ease off as cards travel out —
      // doubling the distance adds only about half again as much of each.
      // A linear ramp folds the second card shut; this keeps it readable.
      const ramp = Math.pow(distance, falloff);
      // Capped short of edge-on so a far card never turns its back.
      const tilt = Math.min(rotate * ramp, 82) * Math.sign(offset);

      card.style.transform =
        `translateX(calc(-50% + ${offset * pitch}px)) ` +
        `translateZ(${-depth * width * ramp}px) rotateY(${-tilt}deg)`;

      // A card is teleported across the ring at exactly half a turn out, so it
      // has to be gone by then or the jump is visible.
      const edge = loop ? Math.min(1, Math.max(0, count / 2 - distance)) : 1;
      card.style.opacity = String(Math.max(0, 1 - fade * distance) * edge);
      card.style.zIndex = String(100 - Math.round(distance));
    });
  }, [count, depth, fade, falloff, gap, loop, rotate]);

  const settle = React.useCallback(
    (target: number) => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      targetRef.current = target;
      setSelected(indexAt(target));

      // No glide for visitors who asked for less motion: jump straight there.
      if (window.matchMedia(REDUCED_MOTION).matches) {
        posRef.current = target;
        paint();
        rafRef.current = null;
        return;
      }

      const step = () => {
        const remaining = target - posRef.current;
        if (Math.abs(remaining) < 0.0004) {
          posRef.current = target;
          paint();
          rafRef.current = null;
          return;
        }
        // Exponential ease-out, not a spring. Swap in a spring only
        // if the settle needs overshoot.
        posRef.current += remaining * 0.16;
        paint();
        rafRef.current = requestAnimationFrame(step);
      };
      rafRef.current = requestAnimationFrame(step);
    },
    [indexAt, paint],
  );

  const clamp = React.useCallback(
    (pos: number) => (loop ? pos : Math.max(0, Math.min(count - 1, pos))),
    [count, loop],
  );

  const goTo = React.useCallback(
    (index: number) => {
      // Take the shorter way round rather than unwinding the whole ring.
      const target = loop
        ? index + Math.round((targetRef.current - index) / count) * count
        : index;
      settle(clamp(target));
    },
    [clamp, count, loop, settle],
  );

  const nudge = React.useCallback(
    (by: number) => {
      // Without a loop, autoplay wraps back to the start instead of sticking.
      if (!loop && by > 0 && Math.round(targetRef.current) >= count - 1) {
        settle(0);
        return;
      }
      settle(clamp(Math.round(targetRef.current) + by));
    },
    [clamp, count, loop, settle],
  );

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    targetRef.current = posRef.current;
    dragRef.current = {
      id: event.pointerId,
      x: event.clientX,
      startX: event.clientX,
      pos: posRef.current,
      v: 0,
      t: performance.now(),
    };
    setDragging(true);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;

    const pitch = widthRef.current * (1 + gap);
    if (!pitch) return;

    const now = performance.now();
    const previous = posRef.current;
    posRef.current = clamp(drag.pos - (event.clientX - drag.x) / pitch);
    // Cards per second, for the throw.
    drag.v = ((posRef.current - previous) / Math.max(now - drag.t, 1)) * 1000;
    drag.t = now;

    const index = indexAt(posRef.current);
    if (index !== selected) setSelected(index);
    paint();
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);

    // A press that barely moved is a click: bring the pressed card to the
    // centre. Pointer capture retargets the event, so hit-test by position.
    if (Math.abs(event.clientX - drag.startX) < 6) {
      const hit = document
        .elementsFromPoint(event.clientX, event.clientY)
        .find((node) => node instanceof HTMLElement && node.dataset.cfIndex);
      if (hit instanceof HTMLElement) {
        goTo(Number(hit.dataset.cfIndex));
        return;
      }
    }

    // Let a flick carry, but never more than two cards.
    const carried = Math.max(-2, Math.min(2, drag.v * 0.18));
    settle(clamp(Math.round(posRef.current + carried)));
  };

  // Card width drives pitch, depth and perspective, so it is the only thing
  // worth measuring — and only when the box actually changes.
  useIsoLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;

    const measure = () => {
      const card = cardRefs.current[0];
      if (!card) return;
      widthRef.current = card.offsetWidth;
      paint();
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [paint]);

  React.useEffect(
    () => () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    },
    [],
  );

  // Autoplay. Re-armed whenever the centred slide changes, so any manual
  // move (keys, drag, dots) restarts the count instead of cutting it short.
  React.useEffect(() => {
    if (!advancing) return;
    const hold = slides[selected]?.duration ?? autoplay;
    const timer = window.setTimeout(() => nudge(1), hold);
    return () => window.clearTimeout(timer);
  }, [advancing, autoplay, nudge, selected, slides]);

  const active = slides[selected];
  const slideName = (slide: CoverflowSlide | undefined, index: number) =>
    `${index + 1} of ${count}${slide?.label || slide?.title ? `: ${slide.label ?? slide.title}` : ""}`;

  const focusHandlers = {
    onFocus: () => setFocused(true),
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
        setFocused(false);
      }
    },
  };

  return (
    <div
      className={cn("w-full", className)}
      style={{ ["--cf-card" as string]: cardWidth }}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      id={regionId}
    >
      <div className="relative">
        <div
          ref={frameRef}
          tabIndex={0}
          aria-label={`${label}. Use the left and right arrow keys to move between slides.`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          // Mouse only: a tap on a touch screen fires enter with no leave.
          onPointerEnter={(event) => {
            if (event.pointerType === "mouse") setHovered(true);
          }}
          onPointerLeave={(event) => {
            if (event.pointerType === "mouse") setHovered(false);
          }}
          {...focusHandlers}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              nudge(-1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              nudge(1);
            }
          }}
          // Vertical padding keeps the drop shadows clear of the overflow clip.
          className="cursor-grab overflow-hidden py-10 outline-none ring-ring focus-visible:ring-2 active:cursor-grabbing"
          style={{
            perspective: `calc(var(--cf-card) * ${perspective})`,
            // Horizontal drag is ours; the page keeps vertical scrolling.
            touchAction: "pan-y",
          }}
        >
          <div
            className="relative select-none"
            style={{
              height: `calc(var(--cf-card) / ${aspectRatio})`,
              transformStyle: "preserve-3d",
            }}
          >
            {slides.map((slide, index) => {
              const isActive = index === selected;
              return (
                <div
                  key={index}
                  ref={(node) => {
                    cardRefs.current[index] = node;
                  }}
                  data-cf-index={index}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={slideName(slide, index)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "absolute left-1/2 top-0 overflow-hidden rounded-2xl bg-muted shadow-xl will-change-transform",
                    cardClassName,
                  )}
                  style={{ width: "var(--cf-card)", aspectRatio: String(aspectRatio) }}
                >
                  {slide.render ? (
                    slide.render(isActive, { paused, reducedMotion })
                  ) : slide.src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={slide.src}
                      alt={slide.alt ?? ""}
                      draggable={false}
                      className="h-full w-full select-none object-cover"
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {showNavigation && (
          <>
            <button
              type="button"
              aria-label="Previous slide"
              aria-controls={regionId}
              onClick={() => nudge(-1)}
              className="absolute left-3 top-1/2 z-[200] -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground backdrop-blur transition hover:bg-background"
            >
              <ChevronLeft className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Next slide"
              aria-controls={regionId}
              onClick={() => nudge(1)}
              className="absolute right-3 top-1/2 z-[200] -translate-y-1/2 rounded-full bg-background/70 p-2 text-foreground backdrop-blur transition hover:bg-background"
            >
              <ChevronRight className="size-5" aria-hidden />
            </button>
          </>
        )}
      </div>

      {/* Announce slide changes only when the visitor is driving. */}
      <p className="sr-only" aria-live={advancing ? "off" : "polite"} aria-atomic="true">
        {`Slide ${slideName(active, selected)}`}
      </p>

      {showCaption && active?.title && (
        <div
          key={selected}
          // A plain CSS fade: @starting-style gives the remounted caption a
          // transparent first frame to transition from.
          className="mt-2 flex flex-col items-center px-6 transition-opacity duration-300 starting:opacity-0"
        >
          <p className="text-[15px] font-semibold tracking-tight text-foreground">
            {active.title}
          </p>
          {active.subtitle && (
            <p className="mt-1 text-[13px] text-muted-foreground">
              {active.subtitle}
            </p>
          )}
          {active.meta && active.meta.length > 0 && (
            <dl className="mt-10 w-full max-w-[230px] text-[12px]">
              {active.meta.map((row) => (
                <div key={row.label} className="flex justify-between py-[5px]">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="font-medium text-foreground">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      {(showPagination || canAutoplay) && (
        <div className="mt-4 flex items-center justify-center gap-3">
          {canAutoplay && (
            <button
              type="button"
              onClick={() => setPlaying((value) => !value)}
              aria-controls={regionId}
              aria-label={playing ? "Pause the carousel and its demos" : "Play the carousel and its demos"}
              className="cf-control inline-flex size-11 items-center justify-center rounded-full bg-muted text-foreground transition hover:brightness-95"
            >
              {playing ? (
                <Pause className="size-[18px]" fill="currentColor" strokeWidth={0} aria-hidden />
              ) : (
                <Play className="size-[18px] translate-x-px" fill="currentColor" strokeWidth={0} aria-hidden />
              )}
            </button>
          )}
          {showPagination && (
            <div className="flex items-center" {...focusHandlers}>
              {slides.map((slide, index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={`Go to slide ${slideName(slide, index)}`}
                  aria-current={index === selected ? "true" : undefined}
                  aria-controls={regionId}
                  onClick={() => goTo(index)}
                  // 24px hit area around an 8px dot (WCAG 2.5.8).
                  className="cf-control group inline-flex size-6 items-center justify-center rounded-full"
                >
                  <span
                    className={cn(
                      "block h-2 rounded-full bg-foreground transition-all duration-300",
                      index === selected ? "w-5 opacity-100" : "w-2 opacity-30 group-hover:opacity-60",
                    )}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
