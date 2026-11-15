"use client";

import Link from "next/link";
import * as React from "react";
import {
  Check,
  ChevronDown,
  Clock,
  CupSoda,
  ExternalLink,
  Globe,
  Images,
  Mic,
  Package,
  Pill,
  Scan,
  Search,
  Settings,
  TriangleAlert,
  UtensilsCrossed,
} from "lucide-react";

import { Brackets, ModeChip, Phone, Scene, Sheet, Wave, Words, boxStyle, on, wordCount, wordsAt } from "./demo-parts";
import { Reveal, StageToggle, useStage, type Stage } from "./motion";

/* ------------------------------------------------------------------------ */
/* Layout                                                                    */
/* ------------------------------------------------------------------------ */

function Eyebrow({ children, by }: { children: React.ReactNode; by?: string }) {
  return (
    <p className="eyebrow">
      {children}
      {by && <span className="eyebrow-by">{by}</span>}
    </p>
  );
}

/** The soft grey surface an animated graphic plays on. */
function StageBox({
  stageRef,
  stage,
  label,
  description,
  className,
  children,
}: {
  stageRef: React.Ref<HTMLDivElement>;
  stage: Stage;
  /** Names the animation for the pause button. */
  label: string;
  /** What the graphic shows, for screen readers. The graphic itself is hidden. */
  description: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      ref={stageRef}
      className={`stage ${className ?? ""}`}
      data-frozen={on(stage.frozen)}
      data-play={on(stage.status === "playing")}
    >
      <p className="sr-only">{description}</p>
      <div className="stage-art" aria-hidden>
        {children}
      </div>
      <StageToggle stage={stage} label={label} />
    </div>
  );
}

/** Copy on one side, an animated graphic on the other. Stacks on phones. */
function FeatureRow({
  id,
  eyebrow,
  by,
  title,
  body,
  flip,
  extra,
  children,
}: {
  id: string;
  eyebrow: string;
  by?: string;
  title: React.ReactNode;
  body: React.ReactNode;
  /** Graphic on the left at desktop widths. */
  flip?: boolean;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="feature scroll-mt-16">
      <div className="feature-grid">
        <Reveal className={`feature-copy ${flip ? "md:order-2" : ""}`}>
          <Eyebrow by={by}>{eyebrow}</Eyebrow>
          <h2 id={`${id}-h`} className="h2">
            {title}
          </h2>
          <p className="lede">{body}</p>
          {extra}
        </Reveal>
        {children}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 1. How it works                                                           */
/* ------------------------------------------------------------------------ */

const HOW_SUMMARY = "Harbor Table lunch menu: starters, mains and desserts, 7 to 24 dollars.";
const HOW_QUESTION = "How much was the first one?";
const HOW_ANSWER = "Tomato Basil Soup is 7 dollars and 50 cents.";

const STEPS = [
  { name: "Point", body: "Aim at a menu, a can, a medicine box or a sign.", from: 0, to: 2300 },
  { name: "Hear", body: "It says what matters first, out loud.", from: 2300, to: 5300 },
  { name: "Ask", body: "Hold the mic and ask about what you scanned.", from: 5300, to: 9600 },
];

export function HowItWorks() {
  const [stageRef, stage] = useStage(9600, 9300);
  const { t } = stage;
  const step = t < 2300 ? 0 : t < 5300 ? 1 : 2;
  const summary = wordsAt(t, 2700, 165, wordCount(HOW_SUMMARY));
  const asked = wordsAt(t, 5700, 190, wordCount(HOW_QUESTION));
  const answered = wordsAt(t, 7600, 180, wordCount(HOW_ANSWER));
  const answering = t >= 7300;
  const sheetUp = (t >= 2300 && t < 5300) || answering;
  const lit = (i: number) => stage.reduced || i === step;
  const progress = (i: number) =>
    i === step && !stage.reduced
      ? Math.max(0, Math.min(1, (t - STEPS[i].from) / (STEPS[i].to - STEPS[i].from)))
      : 0;

  return (
    <section id="how" aria-labelledby="how-h" className="feature scroll-mt-16">
      <div className="feature-grid">
        <Reveal className="feature-copy">
          <Eyebrow>How it works</Eyebrow>
          <h2 id="how-h" className="h2">
            Point, hear, ask.
          </h2>
          <p className="lede">Claude reads what the camera sees and picks the mode for you.</p>
          <ol className="steps">
            {STEPS.map((s, i) => (
              <li key={s.name} className="step" data-on={on(lit(i))}>
                <span className="step-n" aria-hidden>
                  {i + 1}
                </span>
                <span className="step-t">
                  <h3>{s.name}</h3>
                  <span>{s.body}</span>
                </span>
                <span className="step-bar" aria-hidden>
                  <i style={{ transform: `scaleX(${progress(i)})` }} />
                </span>
              </li>
            ))}
          </ol>
        </Reveal>

        <StageBox
          stageRef={stageRef}
          stage={stage}
          label="how it works"
          description={`A phone points at the Harbor Table lunch menu. Yellow brackets lock on, and SightLine says: ${HOW_SUMMARY} Then you hold the mic and ask, “${HOW_QUESTION}” It answers: ${HOW_ANSWER}`}
          className="stage-tall"
        >
          <div className="stage-chips md:hidden">
            {STEPS.map((s, i) => (
              <span key={s.name} data-on={on(lit(i))}>
                {s.name}
              </span>
            ))}
          </div>
          <Phone width="clamp(214px, 19vw, 248px)" screen="#7a6a5a">
            <Scene
              src="/new/menu.webp"
              alt=""
              ratio={[720, 960]}
              width="112cqw"
              top="1cqw"
              fx={49}
              sizes="260px"
            >
              <Brackets
                show={t >= 200 && t < 2300}
                box={t < 700 ? { l: -1, t: -1, w: 102, h: 72 } : { l: 4, t: 3, w: 92, h: 48 }}
              />
              <span
                className="dc-mark"
                data-on={on(t >= 7100)}
                style={boxStyle({ l: 6, t: 23.6, w: 86, h: 5.4 })}
              />
            </Scene>
            {t < 5300 && <ModeChip>AUTO</ModeChip>}
            <div className="dc-pill" data-on={on(t >= 1000 && t < 2250)}>
              <Scan strokeWidth={2.4} />
              <span className="dc-pill-t">
                <b>Harbor Table menu</b>
                <span>Tap to read</span>
              </span>
              <span className="dc-ripple" data-on={on(t >= 1800)} />
            </div>
            <div className="dc-ask" data-on={on(t >= 5450)}>
              <small>You asked</small>
              <p>
                <Words text={HOW_QUESTION} shown={asked} />
              </p>
            </div>
            <span className="dc-mic-ring" data-on={on(t >= 5400 && t < 7000)} />
            <span className="dc-mic" data-on={on(t >= 5300 && t < 7300)}>
              <Mic strokeWidth={2.2} />
            </span>
            <Sheet
              show={sheetUp}
              label={answering ? "Ask · Harbor Table menu" : "Menu · Label"}
              speaking={answering ? answered > 0 && t < 9300 : summary > 0 && t < 5100}
            >
              <p className="dc-say">
                {answering ? (
                  <Words text={HOW_ANSWER} shown={answered} />
                ) : (
                  <Words text={HOW_SUMMARY} shown={summary} />
                )}
              </p>
            </Sheet>
          </Phone>
        </StageBox>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. Answers, not descriptions                                              */
/* ------------------------------------------------------------------------ */

const NUTTER = "Nutter Butter, 16 oz. Contains gluten, peanuts and soy. 8 grams of sugar per serving.";
const NUTTER_ROWS = [
  {
    name: "Nutrition",
    web: true,
    text: "Per 2 cookies (28 g): 130 calories, 8 g sugar, 5 g fat, 2 g protein.",
  },
  {
    name: "Ingredients",
    web: false,
    text: "Enriched wheat flour, sugar, peanut butter, canola oil, whole grain wheat flour, high fructose corn syrup…",
  },
  { name: "Allergens", web: false, text: "Gluten, peanuts and soy." },
];

export function Answers() {
  const [stageRef, stage] = useStage(7600, 7000);
  const { t } = stage;
  const said = wordsAt(t, 400, 150, wordCount(NUTTER));
  return (
    <FeatureRow
      id="answers"
      eyebrow="Answers, not descriptions"
      by="Claude"
      flip
      title="What you’d ask, said first."
      body="Not “a blue package on a table”. The name, the allergens and the sugar, with the details a tap away."
    >
      <StageBox
        stageRef={stageRef}
        stage={stage}
        label="answer"
        description={`A result card says: ${NUTTER} Below it, Nutrition, Ingredients and Allergens rows open one by one. Nutrition was found online; ingredients and allergens were read on the package.`}
      >
        <div className="g-hold g-hold-answer">
          <div className="g-card">
            <div className="g-meta">
              <span>Auto · Label</span>
              <Wave on={said > 0 && t < 3300} className="g-wave" />
            </div>
            <p className="g-say">
              <Words text={NUTTER} shown={said} />
            </p>
            <div className="g-rows">
              {NUTTER_ROWS.map((row, i) => (
                <div key={row.name} className="g-row" data-on={on(t >= 3500 + i * 900)}>
                  <div className="g-row-h">
                    <span>{row.name}</span>
                    <span className="g-src">
                      {row.web ? <Globe strokeWidth={2.2} /> : <Package strokeWidth={2.2} />}
                      {row.web ? "Online" : "On the package"}
                    </span>
                    <ChevronDown className="g-chev" strokeWidth={2.4} />
                  </div>
                  <div className="g-row-b">
                    <div>
                      <p>{row.text}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </StageBox>
    </FeatureRow>
  );
}

/* ------------------------------------------------------------------------ */
/* 3. From the web                                                           */
/* ------------------------------------------------------------------------ */

const RECALL =
  "Tylenol Extra Strength: recalled November 2025 for defective container. Check your lot number.";
const SOURCES = [
  { tile: "F", title: "Enforcement report: Tylenol Extra Strength", site: "fda.gov" },
  { tile: "O", title: "Drug label: acetaminophen 500 mg", site: "open.fda.gov" },
  { tile: "F", title: "Recalls and safety alerts", site: "fda.gov" },
];

export function FromTheWeb() {
  const [stageRef, stage] = useStage(6400, 6000);
  const { t } = stage;
  const searching = t < 1300;
  return (
    <FeatureRow
      id="web"
      eyebrow="From the web"
      by="Bright Data"
      title="Checks the web for you."
      body="Recalls, nutrition and reviews, found live with Bright Data. A recall is always said first."
    >
      <StageBox
        stageRef={stageRef}
        stage={stage}
        label="web lookup"
        description={`A “From the web” card searches for a Tylenol Extra Strength recall. The recall comes first, in red: ${RECALL} Then its sources appear: an FDA enforcement report, the openFDA drug label, and the FDA recalls page.`}
      >
        <div className="g-hold">
          <div className="g-card">
            <div className="g-meta">
              <span>From the web</span>
              <span className="g-count" data-on={on(t >= 4200)}>
                3 sources
              </span>
            </div>
            <div className="g-search" data-done={on(!searching)}>
              <Search strokeWidth={2.4} />
              <span>Tylenol Extra Strength recall</span>
              {searching ? (
                <span className="g-dots">
                  <i />
                  <i />
                  <i />
                </span>
              ) : (
                <Check className="g-ok" strokeWidth={2.8} />
              )}
            </div>
            <div className="g-recall" data-on={on(t >= 1500)}>
              <span className="g-alert">
                <TriangleAlert strokeWidth={2.6} />
                Recall
              </span>
              <p>{RECALL}</p>
            </div>
            <div className="g-uses" data-on={on(t >= 2500)}>
              <b>Uses</b>
              <span>Pain reliever and fever reducer.</span>
            </div>
            <ul className="g-sources">
              {SOURCES.map((s, i) => (
                <li key={s.title} data-on={on(t >= 3100 + i * 550)}>
                  <span className="g-tile">{s.tile}</span>
                  <span className="g-source-t">
                    <b>{s.title}</b>
                    <small>{s.site}</small>
                  </span>
                  <ExternalLink strokeWidth={2.2} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      </StageBox>
    </FeatureRow>
  );
}

/* ------------------------------------------------------------------------ */
/* 4. It remembers                                                           */
/* ------------------------------------------------------------------------ */

const MEMORY_Q = "How much was the salmon?";
const MEMORY_A = "Grilled Salmon at Harbor Table, 24 dollars.";
const SCANS = [
  { icon: UtensilsCrossed, title: "Harbor Table lunch menu", meta: "Menu / Label · 2 min ago" },
  { icon: CupSoda, title: "Kirkland Energy Drink, Orange", meta: "Menu / Label · 1 hr ago" },
  { icon: Pill, title: "Tylenol Extra Strength", meta: "Menu / Label · Yesterday" },
];

export function Remembers() {
  const [stageRef, stage] = useStage(7000, 6400);
  const { t } = stage;
  const asked = wordsAt(t, 1700, 170, wordCount(MEMORY_Q));
  const said = wordsAt(t, 3700, 170, wordCount(MEMORY_A));
  return (
    <FeatureRow
      id="memory"
      eyebrow="It remembers"
      by="Neon"
      flip
      title="Ask about what you scanned."
      body="Your scans are kept in Neon, for your phone only. Ask later, in your own words."
    >
      <StageBox
        stageRef={stageRef}
        stage={stage}
        label="history"
        description={`Your recent scans: the Harbor Table lunch menu, a Kirkland energy drink and Tylenol Extra Strength. You ask, “${MEMORY_Q}” SightLine finds the menu and answers: ${MEMORY_A}`}
      >
        <div className="g-hold g-mem">
          <div className="g-card g-recent">
            <p className="g-recent-h">Recent</p>
            <ul>
              {SCANS.map(({ icon: Icon, title, meta }, i) => (
                <li key={title} data-on={on(t >= 150 + i * 220)} data-hit={on(i === 0 && t >= 3500)}>
                  <span className="g-ic">
                    <Icon strokeWidth={2.1} />
                  </span>
                  <span className="g-recent-t">
                    <b>{title}</b>
                    <small>{meta}</small>
                  </span>
                  {i === 0 && (
                    <span className="g-hit-chip" data-on={on(t >= 3500)}>
                      Source
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="g-thread">
            <div className="g-bubble g-me" data-on={on(t >= 1500)}>
              <Mic strokeWidth={2.4} />
              <span>
                <Words text={MEMORY_Q} shown={asked} />
              </span>
            </div>
            <div className="g-typing" data-on={on(t >= 2850 && t < 3500)}>
              <i />
              <i />
              <i />
            </div>
            <div className="g-bubble g-ai" data-on={on(t >= 3500)}>
              <Wave on={said > 0 && t < 5600} className="g-wave" />
              <span>
                <Words text={MEMORY_A} shown={said} />
              </span>
            </div>
          </div>
        </div>
      </StageBox>
    </FeatureRow>
  );
}

/* ------------------------------------------------------------------------ */
/* 5. A voice you choose                                                     */
/* ------------------------------------------------------------------------ */

const VOICES = [
  { name: "Default voice", note: "The server’s standard voice." },
  { name: "Sarah", note: "Warm, clear and calm. American." },
  { name: "George", note: "Steady storyteller. British." },
  { name: "Lily", note: "Bright and friendly. British." },
];
const LINES = [
  { lang: "en", name: "English", line: "Kirkland Energy Drink, Orange. 200 milligrams of caffeine, zero sugar." },
  { lang: "es", name: "Español", line: "Bebida energética Kirkland, sabor naranja. 200 miligramos de cafeína, sin azúcar." },
  { lang: "fr", name: "Français", line: "Boisson énergisante Kirkland, à l’orange. 200 milligrammes de caféine, zéro sucre." },
];

export function Voices() {
  const [stageRef, stage] = useStage(7200, 1200);
  const { t } = stage;
  const current = t < 2400 ? 0 : t < 4800 ? 1 : 2;
  return (
    <FeatureRow
      id="voice"
      eyebrow="A voice you choose"
      by="ElevenLabs"
      title="Easy on the ears."
      body="Natural ElevenLabs voices, in 13 languages. Pick the one you like listening to."
    >
      <StageBox
        stageRef={stageRef}
        stage={stage}
        label="voice"
        description="A voice picker with Sarah selected: warm, clear and calm. The same answer is spoken in English, Spanish and French: Kirkland Energy Drink, Orange. 200 milligrams of caffeine, zero sugar."
      >
        <div className="g-hold g-voice">
          <div className="g-card g-voices">
            <p className="g-meta">
              <span>Voice</span>
            </p>
            <ul>
              {VOICES.map((v) => (
                <li key={v.name} data-on={on(v.name === "Sarah")}>
                  <span className="g-voice-t">
                    <b>{v.name}</b>
                    <small>{v.note}</small>
                  </span>
                  {v.name === "Sarah" && (
                    <span className="g-voice-on">
                      <Wave on={stage.status === "playing"} className="g-wave" />
                      <Check strokeWidth={2.8} />
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="g-card g-langs">
            <div className="g-chips">
              {LINES.map((l, i) => (
                <span key={l.lang} data-on={on(i === current)}>
                  {l.name}
                </span>
              ))}
              <span className="g-chip-more">+10 more</span>
            </div>
            <div className="g-lines">
              {LINES.map((l, i) => (
                <p key={l.lang} lang={l.lang} data-on={on(i === current)}>
                  {l.line}
                </p>
              ))}
            </div>
          </div>
        </div>
      </StageBox>
    </FeatureRow>
  );
}

/* ------------------------------------------------------------------------ */
/* 6. Hands free                                                             */
/* ------------------------------------------------------------------------ */

export function HandsFree() {
  const [stageRef, stage] = useStage(6000, 5200);
  const { t } = stage;
  const flowing = stage.status === "playing" && t >= 1100 && t < 4400;
  const framesShown = t >= 1100;
  const speaking = t >= 3900;
  return (
    <FeatureRow
      id="hat"
      eyebrow="Hat camera"
      flip
      title="Hands free."
      body={
        <>
          A small camera on a cap sends what’s in front of you to your phone. Say “read this menu” through
          your earbuds.
        </>
      }
    >
      <StageBox
        stageRef={stageRef}
        stage={stage}
        label="hat camera"
        description="A line drawing: a cap with a small camera on its front sends frames to a phone. You say “read this menu” and the answer plays in your earbuds."
        className="stage-wide"
      >
        <div className="g-hat">
          <div className="g-say-bubble g-cmd" data-on={on(t >= 300)}>
            <Mic strokeWidth={2.4} />
            “Read this menu”
          </div>
          <svg
            className="g-hat-svg"
            viewBox="30 70 590 186"
            fill="none"
            stroke="#0a0a0a"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            data-flow={on(flowing)}
            data-frames={on(framesShown)}
            data-speak={on(speaking)}
          >
            {/* Cap, side on, facing right */}
            <path d="M44 204 C44 128 98 86 166 86 C226 86 262 124 268 192 L268 204 Z" fill="#ffffff" />
            <path d="M166 86 C150 124 146 166 152 204" />
            <path d="M108 104 C118 140 120 172 118 204" opacity="0.35" />
            <ellipse cx="166" cy="84" rx="11" ry="4.5" fill="#ffffff" />
            <path d="M244 204 L352 209 C362 210 363 220 353 221 L244 222 Z" fill="#ffffff" />
            <path d="M44 204 L268 204" />
            {/* Camera board on the front of the cap */}
            <rect x="236" y="150" width="30" height="34" rx="6" fill="#ffd60a" />
            <circle cx="251" cy="167" r="8.5" fill="#0a0a0a" stroke="none" />
            <circle cx="254" cy="164" r="2.6" fill="#ffffff" stroke="none" />

            {/* Frames on their way to the phone */}
            <g className="g-frames" strokeWidth="2.4" strokeDasharray="4 4">
              <rect className="g-frame" x="286" y="148" width="28" height="22" rx="4" fill="#ffffff" />
              <rect className="g-frame" x="286" y="148" width="28" height="22" rx="4" fill="#ffffff" />
              <rect className="g-frame" x="286" y="148" width="28" height="22" rx="4" fill="#ffffff" />
            </g>

            {/* Phone */}
            <rect x="404" y="86" width="84" height="164" rx="17" fill="#ffffff" />
            <rect x="411" y="93" width="70" height="150" rx="11" fill="#f2f2f7" stroke="none" />
            <rect x="433" y="99" width="26" height="7" rx="3.5" fill="#0a0a0a" stroke="none" />
            <g stroke="#ffd60a" strokeWidth="4">
              <path d="M421 140 v-10 h10" />
              <path d="M461 130 h10 v10" />
              <path d="M421 186 v10 h10" />
              <path d="M471 186 v10 h-10" />
            </g>
            <g stroke="#c7c7cc" strokeWidth="4">
              <path d="M430 148 h32" />
              <path d="M430 160 h24" />
              <path d="M430 172 h28" />
            </g>

            {/* Sound to the earbud */}
            <g className="g-waves" strokeWidth="3">
              <path className="g-arc" d="M508 154 a18 18 0 0 1 0 28" />
              <path className="g-arc" d="M518 146 a28 28 0 0 1 0 44" />
              <path className="g-arc" d="M528 138 a38 38 0 0 1 0 60" />
            </g>

            {/* Earbud */}
            <rect x="584" y="150" width="17" height="70" rx="8.5" fill="#ffffff" />
            <circle cx="582" cy="152" r="21" fill="#ffffff" />
            <ellipse cx="572" cy="152" rx="4.5" ry="8" fill="#0a0a0a" stroke="none" />
            <path d="M592 210 h9" strokeWidth="2.4" opacity="0.4" />
          </svg>
          <div className="g-hat-labels">
            <span>Hat camera</span>
            <span>Phone</span>
            <span>Earbuds</span>
          </div>
          <div className="g-say-bubble g-reply" data-on={on(speaking)}>
            <Wave on={speaking && stage.status === "playing"} className="g-wave" />
            Harbor Table lunch menu: starters, mains and desserts, 7 to 24 dollars.
          </div>
        </div>
      </StageBox>
    </FeatureRow>
  );
}

/* ------------------------------------------------------------------------ */
/* 7. Built for VoiceOver                                                    */
/* ------------------------------------------------------------------------ */

const VO_STOPS = [
  { id: "detect", say: "Detect, switch button, on. Offers a card when it sees something to read." },
  { id: "recent", say: "Recent scans, button." },
  { id: "capture", say: "Capture, Auto mode, button." },
  { id: "ask", say: "Ask about what’s in front of you, button. Hold and speak, or tap and speak." },
];

export function VoiceOverPanel() {
  const [stageRef, stage] = useStage(7200, 4000);
  const { t } = stage;
  const at = Math.max(0, Math.min(VO_STOPS.length - 1, Math.floor(t / 1800)));
  const focus = (id: string) => on(VO_STOPS[at].id === id);
  return (
    <section id="access" aria-labelledby="access-h" className="scroll-mt-16 px-4 py-14 sm:px-6 sm:py-20">
      <div className="vo-panel">
        <Reveal className="vo-copy">
          <p className="eyebrow eyebrow-dark">For blind and low-vision people, and travelers</p>
          <h2 id="access-h" className="h2">
            Made to be used without looking.
          </h2>
          <p className="lede">
            Every control is labelled for VoiceOver. Every target is at least 44 points. Every color passes
            WCAG AA. Every animation respects Reduce Motion.
          </p>
          <Link href="/accessibility" className="pill pill-ghost-dark mt-8">
            Accessibility statement
          </Link>
        </Reveal>

        <div
          ref={stageRef}
          className="vo-stage"
          data-frozen={on(stage.frozen)}
          data-play={on(stage.status === "playing")}
        >
          <p className="sr-only">
            The SightLine camera screen with VoiceOver on. The focus moves from Detect, to Recent scans, to the
            Capture button, to the mic, and each one is read out by name.
          </p>
          <div className="vo-art" aria-hidden>
            <Phone width="clamp(214px, 19vw, 244px)" screen="#7a6a5a">
              <Scene
                src="/new/menu.webp"
                alt=""
                ratio={[720, 960]}
                width="118cqw"
                top="20cqw"
                fx={50}
                sizes="260px"
              />
              <div className="vo-top">
                <span className="vo-detect">
                  <Scan strokeWidth={2.6} />
                  DETECT
                  <i className="vo-ring" data-on={focus("detect")} />
                </span>
                <span className="vo-round">
                  <Clock strokeWidth={2.4} />
                  <i className="vo-ring" data-on={focus("recent")} />
                </span>
                <span className="vo-round">
                  <Settings strokeWidth={2.4} />
                </span>
              </div>
              <div className="vo-bottom">
                <div className="vo-modes">
                  <span>AUTO</span>
                  <span>BARCODE</span>
                </div>
                <div className="vo-row">
                  <span className="vo-thumb">
                    <Images strokeWidth={2.2} />
                  </span>
                  <span className="vo-shutter">
                    <i className="vo-ring" data-on={focus("capture")} />
                  </span>
                  <span className="vo-mic">
                    <Mic strokeWidth={2.4} />
                    <i className="vo-ring" data-on={focus("ask")} />
                  </span>
                </div>
              </div>
            </Phone>
            <div className="vo-cap">
              {VO_STOPS.map((s, i) => (
                <p key={s.id} data-on={on(i === at)}>
                  {s.say}
                </p>
              ))}
            </div>
          </div>
          <StageToggle stage={stage} label="VoiceOver" dark />
        </div>
      </div>
    </section>
  );
}
