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

// The live /api/barcode answer for 90151620, the code printed on this bottle.
// Photo: Egor Komarov on Pexels (Pexels License).
const BARCODE_TITLE = "Almdudler Original 0,35l";
const BARCODE_LINE = "Almdudler Original 0,35l, 350ml. No allergens listed. 27.6 grams of sugar per serving.";
const BARCODE_ROWS = [
  { name: "Nutrition", text: "Calories: 116 · Sugar: 27.6 g · Fat: 0 g" },
  { name: "Allergens", text: "No allergens listed." },
  { name: "Score", text: "Nutri-Score: D" },
];

function BarcodeDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 6800, 3900);
  const locked = t >= 1500;
  const open = t >= 4400 ? 1 : t >= 2900 ? 0 : -1;
  return (
    <DemoCard
      title={["Scan any", "barcode"]}
      description={`SightLine finds the barcode printed on an Almdudler bottle, looks it up on Open Food Facts, and says: ${BARCODE_LINE}`}
      frozen={state.paused}
    >
      <Scene
        eager
        src="/new/almdudler-bottle.jpg"
        alt="Close-up of a frosted amber Almdudler bottle with a bottle-shaped barcode, the number 9015 1620 and 350 ml printed on the glass."
        ratio={[640, 1000]}
        fx={50}
      >
        <Brackets
          show={t >= 150 && t < 2400}
          box={locked ? { l: 33, t: 30.5, w: 35, h: 42.5 } : { l: 20, t: 16, w: 62, h: 70 }}
        >
          <span className="dc-scan" data-on={on(t >= 250 && t < 1500)} />
        </Brackets>
      </Scene>
      <ModeChip>BARCODE</ModeChip>
      <Sheet show={t >= 2200} label="Barcode · Open Food Facts" speaking={t >= 2600 && t < 6000}>
        <p className="dc-title">{BARCODE_TITLE}</p>
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

// The live /api/analyze answer to this question about this photo, word for word.
// Photo: Christoph Birken on Unsplash (Unsplash License).
const MENU_QUESTION = "How much is the avocado toast?";
const MENU_ANSWER = "Avocado toast is 14 euros on the à la carte brunch menu.";
/** "Avocado toast 14", in the photo's own percentages (909 × 1000). */
const AVOCADO_ROW: Box = { l: 31.5, t: 23.6, w: 14, h: 2.2 };

function MenuDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7000, 6000);
  const asked = wordsAt(t, 700, 210, MENU_QUESTION.split(" ").length);
  const said = wordsAt(t, 2900, 190, MENU_ANSWER.split(" ").length);
  return (
    <DemoCard
      title={["Ask about", "the menu"]}
      description={`You hold the mic and ask, “${MENU_QUESTION}” SightLine remembers the brunch menu you scanned outside a Paris café and answers: ${MENU_ANSWER}`}
      frozen={state.paused}
    >
      <Scene
        eager
        src="/new/paris-brunch-menu.jpg"
        alt="A printed brunch menu on a green café front in Paris: brunch à la carte, pasta, salads, meat, fish, desserts and crêpes, each with a price."
        ratio={[909, 1000]}
        fx={53}
      >
        <span className="dc-mark" data-on={on(t >= 2250)} style={boxStyle(AVOCADO_ROW)} />
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
      <Sheet show={t >= 2500} label="Ask · Brunch menu" speaking={said > 0 && t < 5000}>
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

// The first sentences of the page, as /api/analyze book mode split them, word for word.
// The page is from a 19th-century edition of the Mabinogion (public domain).
// Photo: Erol Ahmed on Unsplash (Unsplash License).
const BOOK_SENTENCES = [
  "Now this is how Arthur hunted the stag.",
  "The men and the dogs were divided into hunting-parties, and the dogs were let loose upon the stag.",
  "And the last dog that was let loose was the favorite dog of Arthur; Cavall was his name.",
];

function BookDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7200, 3600);
  const current = t < 2700 ? -1 : Math.min(BOOK_SENTENCES.length - 1, Math.floor((t - 2700) / 1500));
  // The page's text block, from the chapter heading down.
  const text: Box = { l: 35.5, t: 31, w: 50, h: 51 };
  return (
    <DemoCard
      title={["Read any", "book aloud"]}
      description={`Book mode reads an open page of the Mabinogion aloud, highlighting each sentence as it is spoken: ${BOOK_SENTENCES.join(" ")}`}
      frozen={state.paused}
      screen="#f3f3f1"
    >
      <Scene
        eager
        src="/new/geraint-page.jpg"
        alt="An old green clothbound book open on white sheets at Chapter VI, Geraint, the Son of Erbin, continued, with a blue ribbon bookmark."
        ratio={[755, 1000]}
        fx={60}
        width="186cqw"
        top="-32cqw"
      >
        <Brackets show={t >= 200 && t < 2300} box={t < 400 ? { l: 22, t: 12, w: 70, h: 80 } : text} />
      </Scene>
      <ModeChip>BOOK</ModeChip>
      <Sheet show={t >= 2300} label="Book · Chapter VI" speaking={current >= 0}>
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
      </Sheet>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* 6. Read any sign                                                          */
/* ------------------------------------------------------------------------ */

// The live /api/analyze answer for this photo, word for word.
// Photo: Erik Mclean on Unsplash (Unsplash License).
const SIGN_LINE = "Sidewalk closed. Pedestrians must go left. No access to King Street.";

function SignDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7000, 6200);
  const said = wordsAt(t, 2800, 190, SIGN_LINE.split(" ").length);
  // The three signs' lettering, from SIDEWALK CLOSED down to KING ST.
  const text: Box = { l: 30.5, t: 29, w: 40.5, h: 56.5 };
  return (
    <DemoCard
      title={["Read any", "sign"]}
      description={`Three orange signs on a city sidewalk. SightLine reads them and says: ${SIGN_LINE}`}
      frozen={state.paused}
    >
      <Scene
        eager
        src="/new/sidewalk-closed.jpg"
        alt="Orange construction signs on a city sidewalk: Sidewalk closed, a pedestrian with an arrow pointing left, and No access to King St."
        ratio={[668, 1000]}
        fx={50}
      >
        <Brackets
          show={t >= 200 && t < 2500}
          box={t < 400 ? { l: 20, t: 20, w: 60, h: 74 } : { l: 27.5, t: 26.5, w: 46, h: 61.5 }}
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
