"use client";

import { useEffect, useState } from "react";
import { APP_PATH, HERO_LINE, IMG } from "./content";
import { ArrowRight, Play } from "./Icons";
import { PhoneMock } from "./PhoneMock";
import { useReducedMotion } from "./useMotion";

const WORDS = HERO_LINE.split(" ");
const RATE = 4.2; // words a second, from 1.2 s
const LOOP_S = 13; // the full menu translation shows, then holds for about 3 s

export function Hero() {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setT((x) => (x + 0.1) % LOOP_S), 100);
    return () => clearInterval(id);
  }, [reduced]);

  const n = reduced ? WORDS.length : Math.max(0, Math.floor((t - 1.2) * RATE));
  const shown = WORDS.slice(0, n).join(" ");
  const rest = n >= WORDS.length ? "" : HERO_LINE.slice(shown.length);

  return (
    <section className="hero" id="top" aria-labelledby="hero-h">
      <div className="wrap">
        <p className="eyebrow reveal">Free early access</p>
        <h1 id="hero-h" className="disp herohead reveal d2" style={{ marginTop: 22 }}>
          Point your camera.
          <br />
          <span style={{ color: "#8A8A8A" }}>Hear the world.</span>
        </h1>
        <p className="lead reveal d3" style={{ margin: "32px auto 0" }}>
          SightLine reads text out loud, tells you what you&apos;re holding, and translates signs and menus. Hold your phone up and it
          spots what&apos;s in front of you.
        </p>
        <div className="reveal d4" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginTop: 36 }}>
          <a className="btn btn-p" href={APP_PATH}>
            Try SightLine
            <ArrowRight />
          </a>
          <a className="btn btn-g" href="#demo">
            <Play />
            Watch the demo
          </a>
        </div>
      </div>

      <div className="stage">
        <PhoneMock
          className="reveal d4"
          s={{ img: IMG.menuPortrait, mode: "auto", vfClass: "track", detect: { title: "Menú del día", sub: "Tap to read · Translate", delay: "1.4s" } }}
        />
        {/* The caption types itself for sighted visitors; screen readers get the whole line once. */}
        <p className="herocap" aria-hidden="true">
          {shown}
          <span className="ghost">{rest}</span>
        </p>
        <p className="sr">SightLine says: {HERO_LINE}</p>
      </div>
    </section>
  );
}
