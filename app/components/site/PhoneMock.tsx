// A vector recreation of the SightLine app's camera screen, as the web app at /app draws it
// (app/components/SightLine.tsx, which matches the iPhone app): a white DETECT pill, Recent and
// Settings buttons, camera corners that turn into yellow brackets on a detected item, the white
// detection card, the 1× · 2× · 5× zoom pill, the AUTO · READ · DESCRIBE · MENU · TRANSLATE strip
// (barcodes are spotted in any mode), a round shutter, and the white answer sheet. Decorative: the
// surrounding page carries the real text.

/* eslint-disable @next/next/no-img-element -- static mockup imagery */
import { ArrowUp, Chevron, Clock, Gear, Magnify, Mic, Viewfinder } from "./Icons";

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
  vfClass?: string; // "track": yellow brackets locked onto the menu board in IMG.menuPortrait
  zoom?: 1 | 2 | 5; // the selected zoom chip; the camera image scales to match
  mode: StripMode;
  lang?: string; // shown as "→ English" in Translate
  detect?: { title: string; sub: string; pressed?: boolean; delay?: string } | null;
  status?: string | null; // "Looking…"
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
      <img className={`cam ${s.camClass ?? ""}`} src={s.img} alt="" style={s.zoom && s.zoom > 1 ? { transform: `scale(${s.zoom})` } : undefined} />
      <div className="scrim-t" />
      <div className="scrim-b" />
      <div className={`vf ${s.vfClass ?? ""}`} style={s.vfClass?.includes("track") && s.detect?.delay ? { animationDelay: s.detect.delay } : undefined}>
        <i />
        <i />
        <i />
        <i />
      </div>

      <div className="itop">
        <span className="ichip on">
          <Viewfinder size={12} dark />
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

      <div className="izoom">
        {([1, 2, 5] as const).map((z) => (
          <span key={z} className={(s.zoom ?? 1) === z ? "on" : ""}>
            {z}×
          </span>
        ))}
      </div>

      <div className="istrip">
        {STRIP.map((m) => (
          <span key={m.key} className={m.key === s.mode ? "sel" : ""}>
            {m.label}
            <i />
          </span>
        ))}
      </div>

      <div className="irow3">
        {s.thumb ? (
          <img className="ithumb" src={s.thumb} alt="" />
        ) : (
          // "Choose a photo", until there is a last answer to show
          <span className="ithumb-empty">
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="6.5" y="3" width="14.5" height="14.5" rx="2" />
              <path d="M3 7v12.5A1.5 1.5 0 0 0 4.5 21H17M21 13.5l-4.5-4.5-7 7" />
            </svg>
          </span>
        )}
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
          <span className="iph">
            <img className="ph2" src={s.sheet.img} alt="" />
            <span className="imag">
              <Magnify size={11} />
            </span>
          </span>
          <p className="ans">{s.sheet.text}</p>
          <div className="ibtns">
            <span className="k">
              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" />
                <path d="M3.5 3.5v5h5" />
              </svg>
              Replay
            </span>
            <span>■ Stop</span>
          </div>
          <span className="icap">Speed</span>
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
          <span className="ilook">
            <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
              <circle cx="12" cy="12" r="9.5" />
              <path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5s1.3-6.8 3.9-9.5z" />
            </svg>
            Look it up on the web
          </span>
          <div className="iaskwrap">
            <span className="icap">Ask about this</span>
            <div className="iask">
              {s.sheet.question ? (
                <span className="q">
                  {s.sheet.question}
                  <span className="caret" />
                </span>
              ) : (
                <span className="ph3">How much is it?</span>
              )}
              <Mic size={11} />
              <span className="up">
                <ArrowUp size={11} />
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
