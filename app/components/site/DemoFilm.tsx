"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAPTERS, FILM_LENGTH, IMG, MENU_LINE } from "./content";
import { Chevron, LogoMark, Pause, Play, Speaker, SpeakerOff, Wave } from "./Icons";
import { PhoneMock, type PhoneState } from "./PhoneMock";
import { useReducedMotion } from "./useMotion";

// A code-driven product film: one clock (t, in seconds) drives the phone mockup and the
// captions. Nothing here is a recording; every frame is computed from t. With sound on, Matilda
// (the app's ElevenLabs voice) reads each chapter's answer, and the captions follow her pace.

// public/site/voice/<id>.mp3, made with the app's own /api/speak (Matilda, Flash v2.5), so it
// sounds exactly like the app. `at` is when the line starts within its chapter; `dur` is the
// clip's length in seconds.
const VOICE = [
  { id: "menu", ch: 0, at: 5, dur: 18.3 },
  { id: "answer", ch: 1, at: 5.2, dur: 8.0 },
  { id: "sign", ch: 2, at: 6.5, dur: 3.9 },
  { id: "label", ch: 3, at: 4, dur: 14.2 },
  { id: "end", ch: 4, at: 1, dur: 2.6 },
] as const;
type VoiceId = (typeof VOICE)[number]["id"];
const voice = (id: VoiceId) => VOICE.find((v) => v.id === id)!;
/** How far through its clip a line is (0 to 1) at chapter time `lt`. */
const progress = (id: VoiceId, lt: number) => Math.max(0, Math.min(1, (lt - voice(id).at) / voice(id).dur));
const voicing = (id: VoiceId, lt: number) => lt >= voice(id).at && lt < voice(id).at + voice(id).dur;

function words(str: string, n: number) {
  const w = str.split(" ");
  return w.slice(0, Math.max(0, Math.min(w.length, n))).join(" ");
}
function fmt(t: number) {
  const s = Math.floor(t);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
function chapterAt(t: number) {
  const i = CHAPTERS.findIndex((c) => t >= c.s && t < c.e);
  return i < 0 ? CHAPTERS.length - 1 : i;
}

type Frame = {
  phone: PhoneState;
  ci: number;
  caption: string;
  showCaption: boolean;
  showLang: boolean;
  question: string;
  showQuestion: boolean;
  lines: { text: string; cls: string }[];
  speaking: boolean;
  final: boolean;
};

const ASK = "How much is it, and what comes with it?";
const ANSWER = "It’s 14 euros 90 for the whole set menu: a first course, a main, dessert, bread, and a glass of wine.";
const MENU_WORDS = MENU_LINE.split(" ").length;
const SIGN_ES = "Prohibido uso de monopatín.";
const SIGN_EN = "Skateboarding prohibited.";
const LABEL_LINES: string[] = ["Methylprednisolone tablets, 4 mg", "Sandoz · 21 tablets · prescription only", "Day 1: 2 tablets before breakfast", "1 after lunch, 1 after supper", "2 at bedtime"];
const LABEL_CHARS = LABEL_LINES.reduce((n, l) => n + l.length, 0);

function frameAt(t: number): Frame {
  const ci = chapterAt(t);
  const lt = t - CHAPTERS[ci].s;
  const phone: PhoneState = { img: IMG.menuPortrait, mode: "auto", vfClass: lt < 1.8 ? "locking" : "", lang: "English" };
  const f: Frame = { phone, ci, caption: "", showCaption: true, showLang: false, question: "", showQuestion: false, lines: [], speaking: false, final: false };
  // Tap the shutter at 2s, then "Reading…" until 4s, as in the app.
  const shoot = () => {
    phone.shutterPressed = lt >= 2 && lt < 2.35;
    phone.status = lt >= 2.35 && lt < 4 ? "Reading…" : null;
  };
  const translateTitle = "Translate to English";

  if (ci === 0) {
    // Auto: the app spots the menu, the user taps the card, and the answer sheet slides up.
    f.showLang = true;
    if (lt >= 1.4 && lt < 3.3) {
      phone.detect = { title: "Menú del día", sub: "Tap to read · Translate", pressed: lt >= 3 };
      phone.vfClass = "track"; // the brackets lock onto the menu board
    }
    phone.status = lt >= 3.3 && lt < 4.6 ? "Reading…" : null;
    const n = lt < voice("menu").at ? 0 : Math.ceil(progress("menu", lt) * MENU_WORDS);
    f.caption = lt < 1.4 ? "" : lt < 4.6 ? "Menu detected. Tap to read." : words(MENU_LINE, n);
    f.speaking = voicing("menu", lt);
    // The same sections the app shows for a translated menu.
    if (lt >= 4.6) phone.sheet = { mode: "Auto · Translate", img: IMG.menu, text: words(MENU_LINE, n), sections: ["Translation", "Original text"], speaking: f.speaking };
  } else if (ci === 1) {
    // Ask about the same photo from the answer sheet.
    phone.vfClass = "";
    phone.thumb = IMG.menu;
    f.showLang = true;
    const typing = lt >= 0.8 && lt < 4.4;
    f.question = ASK.slice(0, Math.max(0, Math.floor((lt - 0.8) * 13)));
    f.showQuestion = lt >= 1;
    const n = lt < voice("answer").at ? 0 : Math.ceil(progress("answer", lt) * ANSWER.split(" ").length);
    f.caption = words(ANSWER, n);
    f.speaking = voicing("answer", lt);
    phone.sheet = {
      mode: "Auto · Translate",
      img: IMG.menu,
      text: lt < 4.4 ? MENU_LINE : lt < 5.2 ? "Thinking…" : words(ANSWER, n),
      sections: ["Translation", "Original text"],
      speaking: f.speaking,
      question: typing ? f.question : undefined,
    };
  } else if (ci === 2) {
    phone.img = IMG.signPortrait;
    phone.mode = "translate";
    phone.thumb = IMG.menu;
    f.showLang = true;
    shoot();
    if (lt >= 6.5) {
      const k = Math.floor((lt - 6.5) * 9);
      f.caption = k >= SIGN_EN.length ? SIGN_EN : SIGN_EN.slice(0, k) + SIGN_ES.slice(k);
      f.speaking = voicing("sign", lt);
    } else if (lt >= 4) {
      f.caption = SIGN_ES;
    }
    if (lt >= 4)
      phone.sheet = {
        mode: translateTitle,
        img: IMG.sign,
        text: lt < 6.5 ? f.caption : `This is a Spanish sign. It says: ${f.caption}`,
        sections: ["Translation", "Original text"],
        speaking: f.speaking,
      };
  } else if (ci === 3) {
    phone.img = IMG.medicinePortrait;
    phone.mode = "menu";
    phone.thumb = IMG.sign;
    phone.zoom = lt >= 0.9 ? 2 : 1; // small print: tap 2× before the photo
    shoot();
    // Highlight each line while Matilda reads it (lines take time in proportion to their length).
    const p = progress("label", lt) * LABEL_CHARS;
    let idx = 0;
    for (let acc = 0; idx < LABEL_LINES.length && acc + LABEL_LINES[idx].length <= p; idx++) acc += LABEL_LINES[idx].length;
    f.showCaption = lt < 4;
    f.lines = lt >= 4 ? LABEL_LINES.map((text, i) => ({ text, cls: i < idx ? "done" : i === idx ? "now" : "" })) : [];
    f.speaking = voicing("label", lt);
    if (lt >= 4)
      phone.sheet = {
        mode: "Menu / Label",
        img: IMG.medicine,
        text: "Methylprednisolone tablets, 4 milligrams, 21 tablets, prescription only. Day 1: 2 tablets before breakfast.",
        sections: ["Dosage directions", "Warnings", "From the web"],
        speaking: f.speaking,
      };
  } else {
    f.final = true;
    phone.vfClass = "";
  }
  return f;
}

export function DemoFilm() {
  const reduced = useReducedMotion();
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [visible, setVisible] = useState(false);
  const [sound, setSound] = useState(false); // off until tapped: browsers block sound that starts by itself
  const ref = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clipRef = useRef<VoiceId | null>(null);

  // Only run the clock while the film is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = playing && visible && !reduced;
  // The clock follows real time (not "+0.1 per tick"), so it stays in step with the voice.
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      setT((x) => (x + dt >= FILM_LENGTH ? 0 : x + dt));
    }, 100);
    return () => clearInterval(id);
  }, [running]);

  // Sound: play the line that belongs at time t, and keep it in step if the clock drifts or jumps.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const ci = chapterAt(t);
    const active = sound && running ? VOICE.find((v) => v.ch === ci && voicing(v.id, t - CHAPTERS[ci].s)) : undefined;
    if (!active) {
      if (!a.paused) a.pause();
      clipRef.current = null;
      return;
    }
    const want = t - CHAPTERS[ci].s - active.at;
    if (clipRef.current !== active.id) {
      clipRef.current = active.id;
      a.src = `/site/voice/${active.id}.mp3`;
      a.currentTime = want;
      void a.play().catch(() => {});
    } else if (a.paused && !a.ended) {
      a.currentTime = want;
      void a.play().catch(() => {});
    } else if (!a.paused && Math.abs(a.currentTime - want) > 1) {
      a.currentTime = want;
    }
  }, [t, sound, running]);
  useEffect(() => () => audioRef.current?.pause(), []);

  // Reduced motion: show the finished frame of each chapter and step with Previous / Next.
  const shownT = reduced && t < CHAPTERS[0].e - 0.6 ? CHAPTERS[0].e - 0.6 : t;
  const f = frameAt(shownT);
  const jump = useCallback(
    (i: number) => {
      const c = CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, i))];
      setT(reduced ? c.e - 0.6 : c.s);
    },
    [reduced],
  );

  /** The speaker icon. Turning sound on replays the current chapter so Matilda starts at its line. */
  const toggleSound = () => {
    if (sound) {
      setSound(false);
      audioRef.current?.pause();
      return;
    }
    // Made and started inside the tap, so iOS Safari lets it play later.
    const a = (audioRef.current ??= new Audio());
    a.preload = "auto";
    a.muted = true;
    a.src = `/site/voice/${(VOICE.find((v) => v.ch === f.ci) ?? VOICE[0]).id}.mp3`;
    void a
      .play()
      .then(() => {
        if (clipRef.current === null) a.pause();
        a.muted = false;
      })
      .catch(() => {
        a.muted = false;
      });
    clipRef.current = null;
    setSound(true);
    setPlaying(true);
    setT(CHAPTERS[f.ci].s);
  };

  return (
    <section className="sec" id="demo" aria-labelledby="demo-h" style={{ paddingTop: 80 }}>
      <div className="wrap">
        <p className="eyebrow">The demo</p>
        <h2 id="demo-h" className="disp sec-h" style={{ margin: "18px 0 56px" }}>
          See it work.
          <br />
          <span style={{ color: "#8A8A8A" }}>In ninety seconds.</span>
        </h2>

        <div className="film" ref={ref}>
          <div aria-hidden="true" style={{ display: "flex", justifyContent: "center" }}>
            <PhoneMock s={f.phone} />
          </div>

          <div className="filmcap" aria-hidden="true">
            <p className="eyebrow">
              Chapter {f.ci + 1} · {CHAPTERS[f.ci].title}
            </p>
            {f.showLang && (
              <span className="langchip">
                Spanish → English
              </span>
            )}
            {f.showQuestion && (
              <p className="asked">
                You asked: <b>“{f.question}”</b>
              </p>
            )}
            {f.lines.length > 0 && (
              <ul className="lines">
                {f.lines.map((l) => (
                  <li key={l.text} className={l.cls}>
                    {l.text}
                  </li>
                ))}
              </ul>
            )}
            {f.showCaption && <p className="bigcap">{f.caption}</p>}
            {f.speaking && <Wave />}
          </div>

          {f.final && (
            <div className="endcard" aria-hidden="true">
              <LogoMark size={88} />
              <p className="disp">
                Point your camera.
                <br />
                Hear the world.
              </p>
              <span className="btn" style={{ background: "#000", color: "#fff", pointerEvents: "none" }}>
                Try SightLine
              </span>
            </div>
          )}
        </div>

        <div className="controls">
          {!reduced && (
            <button className="ibtn p" type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause the demo" : "Play the demo"}>
              {playing ? <Pause /> : <Play size={18} />}
            </button>
          )}
          {!reduced && (
            <button
              className={`ibtn${sound ? " p" : ""}`}
              type="button"
              onClick={toggleSound}
              aria-pressed={sound}
              aria-label={sound ? "Turn the demo's sound off" : "Turn the demo's sound on"}
              title={sound ? "Sound on" : "Sound off"}
            >
              {sound ? <Speaker /> : <SpeakerOff />}
            </button>
          )}
          <button className="ibtn" type="button" onClick={() => jump(f.ci - 1)} aria-label="Previous chapter">
            <Chevron dir="left" />
          </button>
          <button className="ibtn" type="button" onClick={() => jump(f.ci + 1 >= CHAPTERS.length ? 0 : f.ci + 1)} aria-label="Next chapter">
            <Chevron />
          </button>
          <div className="scrub" role="group" aria-label="Chapters">
            {CHAPTERS.map((c, i) => {
              const pct = shownT >= c.e ? 100 : shownT < c.s ? 0 : Math.round(((shownT - c.s) / (c.e - c.s)) * 100);
              return (
                <button
                  key={c.title}
                  type="button"
                  className={`seg ${i === f.ci ? "on" : ""}`}
                  onClick={() => jump(i)}
                  aria-label={`Chapter ${i + 1}: ${c.title}`}
                  aria-current={i === f.ci ? "step" : undefined}
                  style={{ flexGrow: c.e - c.s }}
                >
                  <span className="bar">
                    <span className="fill" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="lbl">{c.title}</span>
                </button>
              );
            })}
          </div>
          <span className="time" aria-hidden="true">
            {fmt(shownT)} / {fmt(FILM_LENGTH)}
          </span>
        </div>

        <details className="transcript">
          <summary>Read the transcript</summary>
          <ol>
            <li>
              It spots the menu. In Auto mode, a phone is held up to a chalkboard “Menú del día” outside a café in Seville. A card appears:
              “Menu detected. Tap to read.” The user taps it, and SightLine says: “{MENU_LINE}”
            </li>
            <li>Just ask. From the answer, the user asks, “{ASK}” SightLine says: “{ANSWER}”</li>
            <li>Read any sign. The camera points at a street sign in Logroño, Spain: “{SIGN_ES}” SightLine says: “This is a Spanish sign. It says: {SIGN_EN}”</li>
            <li>
              Know what you&apos;re holding. A box of prescription tablets is held close. SightLine reads: “Methylprednisolone tablets, 4
              milligrams. Sandoz, 21 tablets, prescription only. Day 1: 2 tablets before breakfast, 1 after lunch, 1 after supper, 2 at
              bedtime.”
            </li>
            <li>Point your camera. Hear the world.</li>
          </ol>
        </details>
      </div>
    </section>
  );
}
