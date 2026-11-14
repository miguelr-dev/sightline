// A vector recreation of the SightLine iPhone app (mobile/src/theme.ts): white pills over
// the camera, a white bottom sheet with mode tiles and a black Capture pill, and the
// answer sheet that slides up. Decorative: the surrounding page carries the real text.

/* eslint-disable @next/next/no-img-element -- static mockup imagery */
import { MODE_UI, type ModeKey } from "./content";
import { ArrowRight, ArrowUp, CameraFill, Chevron, Clock, Gear, Mic, Photo, SmallCheck, Sparkle, Viewfinder, Wave } from "./Icons";

export type PhoneState = {
  img: string;
  camClass?: string;
  vfClass?: string;
  mode: ModeKey;
  showLangRow?: boolean;
  detect?: boolean;
  detectClass?: string;
  detectDelay?: string;
  lastRow?: { thumb: string; text: string } | null;
  capClass?: string;
  ripple?: boolean;
  looking?: boolean;
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
  const hint = MODE_UI.find((m) => m.key === s.mode)?.hint;
  return (
    <div className={`phone ios ${className}`} aria-hidden="true">
      <div className="notch" />
      <img className={`cam ${s.camClass ?? ""}`} src={s.img} alt="" />
      <div className={`vf ${s.vfClass ?? ""}`}>
        <i />
        <i />
        <i />
        <i />
      </div>
      <div className="itop">
        <span className="ipill">SightLine</span>
        <span style={{ display: "flex", gap: 6 }}>
          <span className="ipill dark">
            <Sparkle />
            Auto on
          </span>
          <span className="icirc">
            <Clock />
          </span>
          <span className="icirc">
            <Gear />
          </span>
        </span>
      </div>
      <div className="isheet">
        <div className="itiles">
          {MODE_UI.map((m) => (
            <div key={m.key} className={`itile ${m.key === s.mode ? "sel" : ""}`}>
              {m.key === s.mode && <SmallCheck />}
              {m.label}
            </div>
          ))}
        </div>
        <p className="isub" style={{ margin: 0 }}>
          {hint}
        </p>
        {s.showLangRow && !s.detect && (
          <div className="irow">
            <span>Translate to</span>
            <b>English ›</b>
          </div>
        )}
        {s.detect && (
          <div className={`idetect ${s.detectClass ?? ""}`} style={s.detectDelay ? { animationDelay: s.detectDelay } : undefined}>
            <span className="badge">
              <Viewfinder />
            </span>
            <span>
              <b>Menu detected</b>
              <small>Tap to read · Translate</small>
            </span>
            <span className="go">
              <ArrowRight size={12} />
            </span>
          </div>
        )}
        {s.lastRow && (
          <div className="irow">
            <img src={s.lastRow.thumb} alt="" />
            <span className="t">{s.lastRow.text}</span>
            <span>›</span>
          </div>
        )}
        <div className="ibar">
          <span className="iround">
            <Photo />
          </span>
          <span className={`cap ${s.capClass ?? ""}`}>
            {s.ripple && <span className="ripple" />}
            {s.looking ? <Wave small /> : <CameraFill />}
            {s.looking ? "Looking…" : "Capture"}
          </span>
          <span className="iround">
            <Mic />
          </span>
        </div>
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
              {s.sheet.speaking && <Wave small bars={3} />}
              {s.sheet.speaking ? "Speaking" : "Replay"}
            </span>
            <span>■ Stop</span>
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
              <ArrowUp />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
