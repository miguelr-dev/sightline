"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { Play } from "./icons";

export type VideoSource =
  | { kind: "youtube"; embed: string; poster: string; posterAlt: string }
  | { kind: "file"; src: string; poster: string; posterAlt: string; captions?: string; silent?: boolean }
  | { kind: "none"; poster: string; posterAlt: string };

export function VideoPlayer({ source, title }: { source: VideoSource; title: string }) {
  const [started, setStarted] = useState(false);

  if (started && source.kind === "youtube") {
    return (
      <div className="lp-player">
        <iframe
          className="lp-player-media"
          src={source.embed}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      </div>
    );
  }

  if (started && source.kind === "file") {
    return (
      <div className="lp-player">
        {/* Native controls: keyboard and screen reader friendly out of the box. */}
        <video
          className="lp-player-media"
          src={source.src}
          poster={source.poster}
          controls
          autoPlay
          playsInline
          aria-label={source.silent ? `${title} (silent walkthrough)` : title}
          ref={(el) => el?.focus()}
        >
          {source.captions ? <track kind="captions" src={source.captions} srcLang="en" label="English" default /> : null}
        </video>
      </div>
    );
  }

  return (
    <div className="lp-player">
      <Image
        src={source.poster}
        alt={source.posterAlt}
        fill
        sizes="(min-width: 1280px) 1200px, calc(100vw - 32px)"
        className="lp-player-poster"
      />
      {source.kind === "none" ? (
        // No video yet: the play affordance opens the live app instead.
        <div className="lp-player-overlay">
          <Link href="/app" className="lp-play" aria-label="Demo video coming soon. Open the live app instead">
            <Play size={30} />
          </Link>
          <p className="lp-player-note" aria-hidden="true">
            Demo video coming soon. Try the live app.
          </p>
        </div>
      ) : (
        <div className="lp-player-overlay">
          <button type="button" className="lp-play" onClick={() => setStarted(true)} aria-label={`Play ${title}`}>
            <Play size={30} />
          </button>
          {source.kind === "file" && source.silent ? (
            <p className="lp-player-note">A short, silent walkthrough. The full demo is on its way.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
