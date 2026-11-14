"use client";

import { getImageProps } from "next/image";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SLIDES, SLIDE_SECONDS, type Slide } from "./content";
import { ChevronLeft, ChevronRight, Pause, Play } from "./icons";

const DURATION = SLIDE_SECONDS * 1000;

// prefers-reduced-motion, read without a setState-in-effect. On the server we assume
// reduced motion, so nothing moves until the browser says it may.
function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const motionSnapshot = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function subscribeVisibility(cb: () => void) {
  document.addEventListener("visibilitychange", cb);
  return () => document.removeEventListener("visibilitychange", cb);
}
const visibleSnapshot = () => document.visibilityState === "visible";

function SlidePicture({ slide, first }: { slide: Slide; first: boolean }) {
  const common = { alt: slide.alt, fill: true as const };
  const {
    props: { srcSet: wide },
  } = getImageProps({ ...common, src: slide.image, sizes: "(min-width: 1280px) 1200px, calc(100vw - 48px)" });
  const {
    props: { srcSet: tall, ...rest },
  } = getImageProps({
    ...common,
    src: slide.imageTall ?? slide.image,
    sizes: "calc(100vw - 32px)",
    fetchPriority: first ? "high" : "low",
    loading: "eager",
  });
  return (
    <picture>
      <source media="(min-width: 735px)" srcSet={wide} />
      <source srcSet={tall} />
      {/* eslint-disable-next-line jsx-a11y/alt-text -- art-directed next/image props; alt is in `rest` */}
      <img {...rest} className="lp-slide-img" />
    </picture>
  );
}

export function HeroCarousel() {
  const count = SLIDES.length;
  const [index, setIndex] = useState(0);
  const [userPlaying, setUserPlaying] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const reduced = useSyncExternalStore(subscribeMotion, motionSnapshot, () => true);
  const visible = useSyncExternalStore(subscribeVisibility, visibleSnapshot, () => true);

  // Default: plays, unless the person asked for reduced motion. Their own choice wins.
  const playing = userPlaying ?? !reduced;
  const running = playing && !hovered && !focused && visible;

  const indexRef = useRef(0);
  const remaining = useRef(DURATION);

  const go = useCallback(
    (next: number) => {
      const i = (next + count) % count;
      indexRef.current = i;
      remaining.current = DURATION;
      setIndex(i);
    },
    [count],
  );

  useEffect(() => {
    if (!running) return;
    const startedAt = performance.now();
    const shownIndex = index;
    const t = window.setTimeout(() => go(shownIndex + 1), remaining.current);
    return () => {
      window.clearTimeout(t);
      // Paused part-way (hover, focus, tab hidden): remember how long this slide has left.
      if (indexRef.current === shownIndex) {
        remaining.current = Math.max(400, remaining.current - (performance.now() - startedAt));
      }
    };
  }, [running, index, go]);

  const current = SLIDES[index];

  return (
    <section className="lp-carousel" aria-roledescription="carousel" aria-label="SightLine at work">
      <div
        className="lp-stage"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {SLIDES.map((s, i) => (
          <div
            key={s.id}
            className="lp-slide"
            data-active={i === index}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${s.label}`}
            aria-hidden={i !== index}
            inert={i !== index}
          >
            <SlidePicture slide={s} first={i === 0} />
          </div>
        ))}
      </div>

      <div
        className="lp-carousel-bar"
        onFocus={() => setFocused(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* While the slideshow plays, captions change quietly; once paused, changes are announced. */}
        <div className="lp-caption" aria-live={running ? "off" : "polite"} aria-atomic="true">
          <p className="lp-caption-label">
            <span className="lp-visually-hidden">
              Slide {index + 1} of {count}.{" "}
            </span>
            {current.label}
            <span aria-hidden="true"> · </span>
            <span className="lp-visually-hidden">, </span>
            {current.mode}
          </p>
          <p className="lp-caption-said">
            <span className="lp-visually-hidden">SightLine said: </span>“{current.said}”
          </p>
        </div>

        <div className="lp-controls">
          <div className="lp-dots" role="group" aria-label="Choose a slide">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                className="lp-dot"
                aria-label={`Slide ${i + 1}: ${s.label}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i)}
              >
                <span className="lp-dot-track" aria-hidden="true">
                  {i === index ? (
                    <span
                      key={`${index}`}
                      className="lp-dot-fill"
                      data-animate={playing && !reduced}
                      style={{
                        animationDuration: `${DURATION}ms`,
                        animationPlayState: running ? "running" : "paused",
                      }}
                    />
                  ) : null}
                </span>
              </button>
            ))}
          </div>
          <div className="lp-buttons">
            <button type="button" className="lp-round" onClick={() => go(index - 1)} aria-label="Previous slide">
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="lp-round"
              onClick={() => {
                // An explicit Play wins over the hover and focus pauses.
                if (!playing) {
                  setHovered(false);
                  setFocused(false);
                }
                setUserPlaying(!playing);
              }}
              aria-label={playing ? "Pause slideshow" : "Play slideshow"}
            >
              {playing ? <Pause /> : <Play />}
            </button>
            <button type="button" className="lp-round" onClick={() => go(index + 1)} aria-label="Next slide">
              <ChevronRight />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
