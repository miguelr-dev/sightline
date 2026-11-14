"use client";

/* eslint-disable @next/next/no-img-element -- local, pre-sized webp files */
import { useEffect, useState } from "react";
import { SAMPLES } from "./content";
import { Speaker, Wave } from "./Icons";

const SPEEDS = [0.75, 1, 1.25, 1.5];

export function TryIt() {
  const [idx, setIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [speaking, setSpeaking] = useState(false);
  const sample = SAMPLES[idx];

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const stop = () => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  };

  const play = () => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    if (speaking) return stop();
    synth.cancel();
    const u = new SpeechSynthesisUtterance(sample.said);
    u.lang = "en-US";
    u.rate = SPEEDS[speed];
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.speak(u);
    setSpeaking(true);
  };

  return (
    <section className="sec" id="try" aria-labelledby="try-h" style={{ borderTop: "1px solid #2A2A2A" }}>
      <div className="wrap">
        <p className="eyebrow">Try it here</p>
        <h2 id="try-h" className="disp sec-h" style={{ marginTop: 18 }}>
          Pick a photo.
          <br />
          <span style={{ color: "#8A8A8A" }}>Hear what it says.</span>
        </h2>
        <div className="try">
          <div>
            <div className="tryview">
              <img src={sample.img} alt={sample.alt} />
            </div>
            <div className="thumbs" role="group" aria-label="Sample photos">
              {SAMPLES.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  className={`thumb ${i === idx ? "on" : ""}`}
                  aria-pressed={i === idx}
                  onClick={() => {
                    stop();
                    setIdx(i);
                  }}
                >
                  <img src={s.img} alt="" />
                  {s.title}
                </button>
              ))}
            </div>
          </div>
          <div className="saybox">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <span className="langchip">{sample.mode} mode</span>
              {speaking && <Wave />}
            </div>
            <p className="eyebrow" style={{ color: "#B8B8B8" }}>
              SightLine says
            </p>
            <p className="q" aria-live="polite">
              “{sample.said}”
            </p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="btn btn-p" type="button" onClick={play}>
                <Speaker />
                {speaking ? "Stop" : "Play it out loud"}
              </button>
              <div className="speeds" role="group" aria-label="Speech speed">
                {SPEEDS.map((v, i) => (
                  <button key={v} type="button" className={i === speed ? "on" : ""} aria-pressed={i === speed} aria-label={`${v} times speed`} onClick={() => setSpeed(i)}>
                    {v}x
                  </button>
                ))}
              </div>
            </div>
            <p style={{ margin: 0, fontSize: 15, color: "#B8B8B8" }}>
              Real answers SightLine gave for these photos, lightly shortened. Playback uses your device&apos;s voice.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
