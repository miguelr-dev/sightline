// A vector recreation of SightLine's camera-first iPhone app (mobile/src/components/CameraChrome.tsx):
// a frosted Detect pill, camera corners, a frosted detection card, the AUTO · READ · DESCRIBE ·
// MENU · TRANSLATE strip, a round shutter, and the white answer sheet. Decorative: the
// surrounding page carries the real text.

/* eslint-disable @next/next/no-img-element -- static mockup imagery */
import { ArrowUp, Chevron, Clock, Gear, Mic, Viewfinder, Wave } from "./Icons";

export type StripMode = "auto" | "read" | "describe" | "menu" | "translate";
const STRIP: { key: StripMode; label: string }[] = [
  { key: "auto", label: "Auto" },
  { key: "read", label: "Read" },
  { key: "describe", label: "Describe" },
  { key: "menu", label: "Menu" },
  { key: "translate", label: "Translate" },
];

export type PhoneState = {
  img: string;
  camClass?: string;
  vfClass?: string;
  mode: StripMode;
  lang?: string; // shown as "→ English" in Translate
  detect?: { title: string; sub: string; pressed?: boolean; delay?: string } | null;
  status?: string | null; // "Reading…"
  thumb?: string | null;
  shutterPressed?: boolean;
  sheet?: {
    mode: string;
    img: string;
    text: string;
    sections: string[];
    speaking?: boolean;
    question?: string; // typed into "Ask about this"
  } | null;
};

export function PhoneMock({ s, className = "" }: { s: PhoneState; className?: string }) {
  return (
    <div className={`phone ios ${className}`} aria-hidden="true">
      <div className="notch" />
      <img className={`cam ${s.camClass ?? ""}`} src={s.img} alt="" />
      <div className="scrim-t" />
      <div className="scrim-b" />
      <div className={`vf ${s.vfClass ?? ""}`}>
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="itop">
        <span className="ichip frost">
          <Viewfinder size={12} />
          Detect
        </span>
        <span style={{ display: "flex", gap: 6 }}>
          <span className="icirc frost">
            <Clock size={14} light />
          </span>
          <span className="icirc frost">
            <Gear size={14} light />
          </span>
        </span>
      </div>

      {s.detect && !s.status && (
        <div className={`ifloat idetect frost-l ${s.detect.pressed ? "pressed" : ""}`} style={s.detect.delay ? { animationDelay: s.detect.delay } : undefined}>
          <Viewfinder size={14} dark />
          <span>
            <b>{s.detect.title}</b>
            <small>{s.detect.sub}</small>
          </span>
          <span className="x">×</span>
        </div>
      )}
      {s.status && (
        <div className="ifloat istatus frost">
          <span className="ispin" />
          {s.status}
        </div>
      )}
      {s.mode === "translate" && s.lang && <div className="ifloat ilang frost">→ {s.lang}</div>}

      <div className="istrip">
        {STRIP.map((m) => (
          <span key={m.key} className={m.key === s.mode ? "sel" : ""}>
            {m.label}
            <i />
          </span>
        ))}
      </div>

      <div className="irow3">
        {s.thumb ? <img className="ithumb" src={s.thumb} alt="" /> : <span className="ithumb-empty" />}
        <span className={`ishutter ${s.shutterPressed ? "pressed" : ""}`}>
          <span />
        </span>
        <span className="imic frost">
          <Mic size={15} light />
        </span>
      </div>

      {s.sheet && (
        <div className="iresult">
          <div className="hd">
            {s.sheet.mode}
            <b>Done</b>
          </div>
          <img className="ph2" src={s.sheet.img} alt="" />
          <p className="ans">{s.sheet.text}</p>
          <div className="ibtns">
            <span className="k">
              {s.sheet.speaking ? <Wave small bars={3} /> : "▶"}
              {s.sheet.speaking ? "Speaking" : "Replay"}
            </span>
            <span>■ Stop</span>
          </div>
          <div className="ispeed">
            <span>0.75×</span>
            <span className="on">1×</span>
            <span>1.25×</span>
            <span>1.5×</span>
          </div>
          <div>
            {s.sheet.sections.map((t) => (
              <div className="isec" key={t}>
                {t}
                <Chevron size={11} dir="down" />
              </div>
            ))}
          </div>
          <div className="iask">
            {s.sheet.question ? (
              <span className="q">
                {s.sheet.question}
                <span className="caret" />
              </span>
            ) : (
              <span className="ph3">Ask about this</span>
            )}
            <span className="up">
              <ArrowUp size={11} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
