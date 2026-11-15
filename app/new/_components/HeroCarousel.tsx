"use client";

import * as React from "react";
import { ChevronDown, Mic, Pause, Rewind, Scan, SkipForward } from "lucide-react";

import {
  CoverflowCarousel,
  type CoverflowSlide,
  type CoverflowSlideState,
} from "@/components/ui/coverflow-carousel";

import {
  Brackets,
  MENU,
  ModeChip,
  Scene,
  Screen,
  Sheet,
  Words,
  boxStyle,
  on,
  wordsAt,
  type Box,
} from "./demo-parts";

/* ------------------------------------------------------------------------ */
/* Demo clock                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Milliseconds into the card's scripted demo. Runs only on the centred card,
 * loops every `length` ms, freezes when the carousel is paused, and returns
 * the finished `still` frame for side cards and for reduced motion.
 */
function useDemoClock(active: boolean, state: CoverflowSlideState, length: number, still: number) {
  const [elapsed, setElapsed] = React.useState(0);
  const [wasActive, setWasActive] = React.useState(active);
  // Restart from the top each time the card arrives in the centre.
  if (active !== wasActive) {
    setWasActive(active);
    setElapsed(0);
  }

  const running = active && !state.paused && !state.reducedMotion;
  React.useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const step = Math.max(0, now - last);
      last = now;
      setElapsed((value) => (value + step >= length ? 0 : value + step));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [running, length]);

  if (state.reducedMotion || !active) return still;
  // Paused before this card started playing: show its answer, not a blank camera.
  if (state.paused && elapsed === 0) return still;
  return elapsed;
}

/* ------------------------------------------------------------------------ */
/* Card                                                                      */
/* ------------------------------------------------------------------------ */

function DemoCard({
  title,
  description,
  frozen,
  screen,
  children,
}: {
  title: [string, string];
  description: string;
  frozen: boolean;
  /** Fill behind the photo where it doesn't reach. */
  screen?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="dc" data-frozen={on(frozen)}>
      <p className="dc-h" aria-hidden>
        {title[0]}
        <br />
        {title[1]}
      </p>
      <p className="sr-only">{description}</p>
      <div className="dc-phone">
        <Screen screen={screen}>{children}</Screen>
      </div>
    </div>
  );
}

type DemoProps = { active: boolean; state: CoverflowSlideState };

/* ------------------------------------------------------------------------ */
/* 1. Point at anything                                                      */
/* ------------------------------------------------------------------------ */

const KIRKLAND_LINE = "Kirkland Energy Drink, Orange. 200 milligrams of caffeine, zero sugar.";

function PointDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 6800, 6000);
  const words = KIRKLAND_LINE.split(" ").length;
  const said = wordsAt(t, 2800, 190, words);
  return (
    <DemoCard
      title={["Point at", "anything"]}
      description={`SightLine spots the can, you tap to read it, and it says: ${KIRKLAND_LINE}`}
      frozen={state.paused}
    >
      <Scene
        eager
        src="/new/kirkland.webp"
        alt="A hand holding an orange Kirkland Signature Sparkling Energy Drink can in a classroom."
        ratio={[640, 1130]}
      >
        <Brackets
          show={t >= 200 && t < 2400}
          box={t < 400 ? { l: 10, t: 8, w: 80, h: 66 } : { l: 24, t: 14.5, w: 55, h: 54 }}
        />
      </Scene>
      <ModeChip>AUTO</ModeChip>
      <div className="dc-pill" data-on={on(t >= 1100 && t < 2250)} aria-hidden>
        <Scan strokeWidth={2.4} />
        <span className="dc-pill-t">
          <b>Kirkland Energy Drink</b>
          <span>Tap to read</span>
        </span>
        <span className="dc-ripple" data-on={on(t >= 1850)} />
      </div>
      <Sheet show={t >= 2300} label="Auto · Label" speaking={said > 0 && t < 5100}>
        <p className="dc-say">
          <Words text={KIRKLAND_LINE} shown={said} />
        </p>
      </Sheet>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* 2. Scan any barcode                                                       */
/* ------------------------------------------------------------------------ */

const BARCODE_ROWS = [
  { name: "Nutrition", text: "250% of the daily value of vitamin B12." },
  { name: "Ingredients", text: "No artificial food dyes. No high fructose corn syrup." },
  { name: "Allergens", text: "" },
];

function BarcodeDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 6800, 3900);
  const locked = t >= 1500;
  const open = t >= 4400 ? 1 : t >= 2900 ? 0 : -1;
  return (
    <DemoCard
      title={["Scan any", "barcode"]}
      description="SightLine finds the barcode on the back of a Kirkland Signature Sparkling Tropical can, looks it up on Open Food Facts, and reads the nutrition and ingredients: 250% of the daily value of vitamin B12, no artificial food dyes, no high fructose corn syrup."
      frozen={state.paused}
    >
      <Scene
        eager
        src="/new/barcode.webp"
        alt="The back of a Kirkland Signature can held in a hand, showing its barcode and recycling label."
        ratio={[500, 610]}
        fx={57}
      >
        <Brackets
          show={t >= 150 && t < 2400}
          box={locked ? { l: 37.5, t: 31, w: 45, h: 42 } : { l: 30, t: 14, w: 56, h: 68 }}
        >
          <span className="dc-scan" data-on={on(t >= 250 && t < 1500)} />
        </Brackets>
      </Scene>
      <ModeChip>BARCODE</ModeChip>
      <Sheet show={t >= 2200} label="Barcode · Open Food Facts" speaking={t >= 2600 && t < 6000}>
        <p className="dc-title">Kirkland Signature Sparkling Tropical</p>
        <div className="dc-rows">
          {BARCODE_ROWS.map((row, i) => (
            <div key={row.name} className="dc-row" data-on={on(open === i)}>
              <div className="dc-row-h">
                {row.name}
                <ChevronDown strokeWidth={2.4} />
              </div>
              <div className="dc-row-b">
                <div>
                  <p>{row.text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* 4. Ask about the menu                                                     */
/* ------------------------------------------------------------------------ */

const MENU_QUESTION = "How much was the first one?";
const MENU_ANSWER = "The Grilled Chicken Plate is 12 dollars and 79 cents.";

function MenuDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7000, 6000);
  const asked = wordsAt(t, 700, 210, MENU_QUESTION.split(" ").length);
  const said = wordsAt(t, 2900, 190, MENU_ANSWER.split(" ").length);
  return (
    <DemoCard
      title={["Ask about", "the menu"]}
      description={`You hold the mic and ask, “${MENU_QUESTION}” SightLine remembers the Retro Family Restaurant menu you scanned and answers: ${MENU_ANSWER}`}
      frozen={state.paused}
    >
      <Scene eager src={MENU.src} alt={MENU.alt} ratio={MENU.ratio} fx={31}>
        <span className="dc-mark" data-on={on(t >= 2250)} style={boxStyle(MENU.firstRow)} />
      </Scene>
      <div className="dc-ask" data-on={on(t >= 450)} aria-hidden>
        <small>You asked</small>
        <p>
          <Words text={MENU_QUESTION} shown={asked} />
        </p>
      </div>
      <span className="dc-mic-ring" data-on={on(t >= 300 && t < 2100)} aria-hidden />
      <span className="dc-mic" data-on={on(t >= 200 && t < 2500)} aria-hidden>
        <Mic strokeWidth={2.2} />
      </span>
      <Sheet show={t >= 2500} label="Ask · Retro Family menu" speaking={said > 0 && t < 5000}>
        <p className="dc-say">
          <Words text={MENU_ANSWER} shown={said} />
        </p>
      </Sheet>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* 5. Read any book aloud                                                    */
/* ------------------------------------------------------------------------ */

const BOOK_SENTENCES = [
  "The house on the hill had been empty for years.",
  "Nobody in the village could say who had lived there last.",
  "But on the first cold night of autumn, a light came on in the attic window.",
  "Maya saw it from her bedroom and pressed her face to the glass.",
];

function BookDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7200, 3600);
  const current = t < 300 ? -1 : Math.min(BOOK_SENTENCES.length - 1, Math.floor((t - 300) / 1550));
  return (
    <DemoCard
      title={["Read any", "book aloud"]}
      description="Book mode reads a printed page aloud and highlights each sentence as it is spoken, then carries on after you turn the page."
      frozen={state.paused}
    >
      <div className="dc-book" aria-hidden>
        <div className="dc-book-h">
          Page 37
          <span>Book</span>
        </div>
        {BOOK_SENTENCES.map((sentence, i) => (
          <p key={i} className="dc-s" data-on={on(i === current)}>
            {sentence}
          </p>
        ))}
        <div className="dc-ctrl">
          <span className="dc-btn">
            <Rewind fill="currentColor" strokeWidth={0} />
            Back
          </span>
          <span className="dc-btn dc-btn-primary">
            <Pause fill="currentColor" strokeWidth={0} />
            Pause
          </span>
          <span className="dc-btn">
            <SkipForward fill="currentColor" strokeWidth={0} />
            Next page
          </span>
        </div>
      </div>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* 6. Read any sign                                                          */
/* ------------------------------------------------------------------------ */

// The live /api/analyze answer for this photo, word for word.
const SIGN_LINE =
  "Ciao! sandwich board: open daily for lunch and dinner, 11 AM to 9 PM, hot pasta to go.";

function SignDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7000, 6200);
  const said = wordsAt(t, 2800, 150, SIGN_LINE.split(" ").length);
  // The sign's lettering, from OPEN down to the web address.
  const text: Box = { l: 35.5, t: 16.5, w: 39.5, h: 76 };
  return (
    <DemoCard
      title={["Read any", "sign"]}
      description={`A red sandwich board outside a pasta shop. SightLine reads it and says: ${SIGN_LINE}`}
      frozen={state.paused}
    >
      <Scene
        eager
        src="/new/ciao-sign.webp"
        alt="A red sandwich board on the pavement: Open. Ciao! Hot pasta-to-go. Open daily, serving lunch and dinner, 11 AM to 9 PM, with a phone number and ciaopasta.com."
        ratio={[864, 1080]}
        fx={60}
      >
        <Brackets
          show={t >= 200 && t < 2500}
          box={t < 400 ? { l: 31, t: 4, w: 58, h: 93 } : { l: 33.5, t: 11, w: 50, h: 85 }}
        />
        <span className="dc-sweep" data-on={on(t >= 1100 && t < 2300)} style={boxStyle(text)} />
      </Scene>
      <ModeChip>AUTO</ModeChip>
      <Sheet show={t >= 2500} label="Auto · Read" speaking={said > 0 && t < 5700}>
        <p className="dc-say">
          <Words text={SIGN_LINE} shown={said} />
        </p>
      </Sheet>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* Read any label                                                            */
/* ------------------------------------------------------------------------ */

// The live /api/analyze answer for this photo, word for word.
// Photo: Juno Jo on Unsplash (Unsplash License).
const LABEL_LINE =
  "Bixby Roasting Co. Light Roast coffee, 12 ounces. Bright and balanced, with Kona, Colombia and Costa Rica beans.";

function LabelDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7000, 6200);
  const said = wordsAt(t, 2800, 160, LABEL_LINE.split(" ").length);
  // The white label at the top of the bag.
  const label: Box = { l: 32, t: 20, w: 34, h: 26 };
  return (
    <DemoCard
      title={["Read any", "label"]}
      description={`A hand holds up a bag of coffee. SightLine reads the label and says: ${LABEL_LINE}`}
      frozen={state.paused}
    >
      <Scene
        eager
        src="/new/coffee-bag.jpg"
        alt="A hand holding up a kraft-paper bag of Bixby Roasting Co. Light Roast coffee in front of striped green leaves."
        ratio={[750, 1000]}
        fx={50}
      >
        <Brackets
          show={t >= 200 && t < 2500}
          box={t < 400 ? { l: 22, t: 14, w: 58, h: 76 } : { l: 26, t: 19, w: 48, h: 66 }}
        />
        <span className="dc-sweep" data-on={on(t >= 1100 && t < 2300)} style={boxStyle(label)} />
      </Scene>
      <ModeChip>AUTO</ModeChip>
      <Sheet show={t >= 2500} label="Auto · Label" speaking={said > 0 && t < 5700}>
        <p className="dc-say">
          <Words text={LABEL_LINE} shown={said} />
        </p>
      </Sheet>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* Carousel                                                                  */
/* ------------------------------------------------------------------------ */

// Each slide holds a little less than its demo loop, so the card moves on
// just as its answer has finished, before the demo starts over.
const SLIDES: CoverflowSlide[] = [
  { label: "Point at anything", duration: 6500, render: (a, s) => <PointDemo active={a} state={s} /> },
  { label: "Scan any barcode", duration: 6500, render: (a, s) => <BarcodeDemo active={a} state={s} /> },
  { label: "Read any label", duration: 6700, render: (a, s) => <LabelDemo active={a} state={s} /> },
  { label: "Ask about the menu", duration: 6700, render: (a, s) => <MenuDemo active={a} state={s} /> },
  { label: "Read any book aloud", duration: 6900, render: (a, s) => <BookDemo active={a} state={s} /> },
  { label: "Read any sign", duration: 6700, render: (a, s) => <SignDemo active={a} state={s} /> },
];

export function HeroCarousel() {
  return (
    <CoverflowCarousel
      slides={SLIDES}
      label="SightLine demos"
      aspectRatio={0.55}
      cardWidth="clamp(220px, 60vw, 316px)"
      rotate={38}
      depth={0.5}
      perspective={3.2}
      gap={0.07}
      fade={0.16}
      autoplay={4500}
      showPagination
      cardClassName="rounded-[26px]! bg-white! shadow-[0_18px_40px_-20px_rgba(0,0,0,0.26),0_0_0_1px_rgba(0,0,0,0.06)]!"
    />
  );
}
