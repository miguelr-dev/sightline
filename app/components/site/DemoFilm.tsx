"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAPTERS, FILM_LENGTH, IMG, MENU_LINE } from "./content";
import { Chevron, LogoMark, Pause, Play, Wave } from "./Icons";
import { PhoneMock, type PhoneState } from "./PhoneMock";
import { useReducedMotion } from "./useMotion";

// A code-driven product film: one clock (t, in seconds) drives the phone mockup and the
// captions. Nothing here is a recording; every frame is computed from t.

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
const SIGN_ES = "Prohibido uso de monopatín.";
const SIGN_EN = "Skateboarding prohibited.";
const LABEL_LINES = ["Methylprednisolone tablets, 4 mg", "Sandoz · 21 tablets · prescription only", "Day 1: 2 tablets before breakfast", "1 after lunch, 1 after supper", "2 at bedtime"];

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
    if (lt >= 1.4 && lt < 3.3) phone.detect = { title: "Menú del día", sub: "Tap to read · Translate", pressed: lt >= 3 };
    phone.status = lt >= 3.3 && lt < 4.6 ? "Reading…" : null;
    const n = Math.floor((lt - 5) * 3.2);
    f.caption = lt < 1.4 ? "" : lt < 4.6 ? "Menu detected. Tap to read." : words(MENU_LINE, n);
    f.speaking = n > 0 && n < 24;
    if (lt >= 4.6) phone.sheet = { mode: "Auto · Translate", img: IMG.menu, text: words(MENU_LINE, n), sections: ["First course", "Second course", "Dessert"], speaking: f.speaking };
  } else if (ci === 1) {
    // Ask about the same photo from the answer sheet.
    phone.vfClass = "";
    phone.thumb = IMG.menu;
    f.showLang = true;
    const typing = lt >= 0.8 && lt < 4.4;
    f.question = ASK.slice(0, Math.max(0, Math.floor((lt - 0.8) * 13)));
    f.showQuestion = lt >= 1;
    const n = Math.floor((lt - 5.2) * 3.2);
    f.caption = words(ANSWER, n);
    f.speaking = n > 0 && n < 22;
    phone.sheet = {
      mode: "Auto · Translate",
      img: IMG.menu,
      text: lt < 4.4 ? MENU_LINE : lt < 5.2 ? "Thinking…" : words(ANSWER, n),
      sections: ["First course", "Second course", "Dessert"],
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
      f.speaking = k > 0 && k < SIGN_EN.length + 10;
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
    shoot();
    const idx = Math.floor((lt - 4) / 1.8);
    f.showCaption = lt < 4;
    f.lines = lt >= 4 ? LABEL_LINES.map((text, i) => ({ text, cls: i < idx ? "done" : i === idx ? "now" : "" })) : [];
    f.speaking = lt >= 4 && idx < LABEL_LINES.length;
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
  const ref = useRef<HTMLDivElement>(null);

  // Only run the clock while the film is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const running = playing && visible && !reduced;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setT((x) => (x + 0.1 >= FILM_LENGTH ? 0 : x + 0.1)), 100);
    return () => clearInterval(id);
  }, [running]);

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

  return (
    <section className="sec" id="demo" aria-labelledby="demo-h" style={{ paddingTop: 80 }}>
      <div className="wrap">
        <p className="eyebrow">The demo</p>
        <h2 id="demo-h" className="disp sec-h" style={{ margin: "18px 0 56px" }}>
          See it work.
          <br />
          <span style={{ color: "#8A8A8A" }}>In seventy seconds.</span>
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
            <li>Read any sign. The camera points at a street sign in Logroño, Spain: “{SIGN_ES}” SightLine says: “{SIGN_EN}”</li>
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
