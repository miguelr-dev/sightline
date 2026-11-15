"use client";

import Image from "next/image";
import * as React from "react";

/* Shared pieces of the scripted phone demos: the carousel cards and the
   animated sections below it both draw with these. Sizes inside the screen
   are in container units of the screen, so a phone scales as a whole. */

export type Box = { l: number; t: number; w: number; h: number };

export const boxStyle = (box: Box): React.CSSProperties => ({
  left: `${box.l}%`,
  top: `${box.t}%`,
  width: `${box.w}%`,
  height: `${box.h}%`,
});

/** A boolean as a data attribute: present when true, absent when false. */
export const on = (value: boolean) => (value ? "" : undefined);

/** How many words of a line have been "spoken" at time `t`. */
export function wordsAt(t: number, start: number, perWord: number, total: number) {
  if (t < start) return 0;
  return Math.min(total, Math.floor((t - start) / perWord) + 1);
}

export const wordCount = (text: string) => text.split(" ").length;

/** The screen of an iPhone: dynamic island, home indicator, and whatever is on it. */
export function Screen({
  screen,
  children,
}: {
  /** Fill behind the photo where it doesn't reach. */
  screen?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="dc-screen" style={screen ? { background: screen } : undefined}>
      {children}
      <div className="dc-island" aria-hidden />
      <div className="dc-home" aria-hidden />
    </div>
  );
}

/** A whole phone, sized by `width`, for the sections below the carousel. */
export function Phone({
  width,
  screen,
  className,
  children,
}: {
  width: string;
  screen?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`ph ${className ?? ""}`} style={{ "--ph-w": width } as React.CSSProperties} aria-hidden>
      <div className="ph-body">
        <Screen screen={screen}>{children}</Screen>
      </div>
    </div>
  );
}

/** The camera photo, sized like object-fit: cover, so overlays can be placed
    in the photo's own percentages. `fx` is the focal point, as a % of width. */
export function Scene({
  src,
  alt,
  ratio,
  fx = 50,
  width,
  top,
  sizes = "(max-width: 640px) 70vw, 340px",
  eager,
  children,
}: {
  src: string;
  alt: string;
  ratio: [number, number];
  fx?: number;
  width?: string;
  top?: string;
  sizes?: string;
  /** Load now rather than when scrolled near (the carousel is above the fold). */
  eager?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="dc-scene"
      style={
        {
          "--ar": `${ratio[0]} / ${ratio[1]}`,
          "--arn": ratio[0] / ratio[1],
          "--fx": `${fx}%`,
          ...(width ? { "--w": width } : {}),
          ...(top ? { "--top": top } : {}),
        } as React.CSSProperties
      }
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        loading={eager ? "eager" : undefined}
        draggable={false}
        className="dc-photo"
      />
      <div className="dc-scrim" aria-hidden />
      <div className="dc-overlay" aria-hidden>
        {children}
      </div>
    </div>
  );
}

export function Brackets({ show, box, children }: { show: boolean; box: Box; children?: React.ReactNode }) {
  return (
    <div className="dc-brk" data-on={on(show)} style={boxStyle(box)}>
      <i />
      <i />
      <i />
      <i />
      {children}
    </div>
  );
}

export function Wave({ on: speaking, className }: { on: boolean; className?: string }) {
  return (
    <span className={`dc-wave ${className ?? ""}`} data-on={on(speaking)} aria-hidden>
      {[0.55, 0.9, 0.7, 1, 0.6].map((h, i) => (
        <i key={i} style={{ "--h": h } as React.CSSProperties} />
      ))}
    </span>
  );
}

export function Words({ text, shown }: { text: string; shown: number }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <React.Fragment key={i}>
          <span className="dc-w" data-on={on(i < shown)}>
            {word}
          </span>{" "}
        </React.Fragment>
      ))}
    </>
  );
}

export function Sheet({
  show,
  label,
  speaking,
  badge,
  children,
}: {
  show: boolean;
  label: string;
  speaking: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dc-sheet" data-on={on(show)} aria-hidden>
      <div className="dc-grab" />
      <div className="dc-meta">
        <span className="dc-meta-l">
          {badge}
          {label}
        </span>
        <Wave on={speaking} />
      </div>
      {children}
    </div>
  );
}

export function ModeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="dc-chip" aria-hidden>
      {children}
    </span>
  );
}
