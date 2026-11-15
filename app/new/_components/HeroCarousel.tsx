"use client";

import Image from "next/image";
import * as React from "react";
import {
  ChevronDown,
  Languages,
  Mic,
  Pause,
  Rewind,
  Scan,
  SkipForward,
  TriangleAlert,
} from "lucide-react";

import {
  CoverflowCarousel,
  type CoverflowSlide,
  type CoverflowSlideState,
} from "@/components/ui/coverflow-carousel";

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
      const step = now - last;
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

/** How many words of a line have been "spoken" at time `t`. */
function wordsAt(t: number, start: number, perWord: number, total: number) {
  if (t < start) return 0;
  return Math.min(total, Math.floor((t - start) / perWord) + 1);
}

const on = (value: boolean) => (value ? "" : undefined);

/* ------------------------------------------------------------------------ */
/* Building blocks                                                           */
/* ------------------------------------------------------------------------ */

type Box = { l: number; t: number; w: number; h: number };

const boxStyle = (box: Box): React.CSSProperties => ({
  left: `${box.l}%`,
  top: `${box.t}%`,
  width: `${box.w}%`,
  height: `${box.h}%`,
});

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
        <div className="dc-screen" style={screen ? { background: screen } : undefined}>
          {children}
          <div className="dc-island" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/** The camera photo, sized like object-fit: cover, so overlays can be placed
    in the photo's own percentages. `fx` is the focal point, as a % of width. */
function Scene({
  src,
  alt,
  ratio,
  fx = 50,
  width,
  top,
  children,
}: {
  src: string;
  alt: string;
  ratio: [number, number];
  fx?: number;
  width?: string;
  top?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="dc-scene"
      style={
        {
          "--ar": `${ratio[0]} / ${ratio[1]}`,
          "--arn": ratio[0] / ratio[1],
          "--fx": `${fx}%`,
          ...(width ? { "--w": width } : {}),
          ...(top ? { "--top": top } : {}),
        } as React.CSSProperties
      }
    >
      <Image
        src={src}
        alt={alt}
        fill
        sizes="(max-width: 640px) 70vw, 340px"
        loading="eager"
        draggable={false}
        className="dc-photo"
      />
      <div className="dc-scrim" aria-hidden />
      <div className="dc-overlay" aria-hidden>
        {children}
      </div>
    </div>
  );
}

function Brackets({ show, box, children }: { show: boolean; box: Box; children?: React.ReactNode }) {
  return (
    <div className="dc-brk" data-on={on(show)} style={boxStyle(box)}>
      <i />
      <i />
      <i />
      <i />
      {children}
    </div>
  );
}

function Wave({ on: speaking }: { on: boolean }) {
  return (
    <span className="dc-wave" data-on={on(speaking)} aria-hidden>
      {[0.55, 0.9, 0.7, 1, 0.6].map((h, i) => (
        <i key={i} style={{ "--h": h } as React.CSSProperties} />
      ))}
    </span>
  );
}

function Words({ text, shown }: { text: string; shown: number }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <React.Fragment key={i}>
          <span className="dc-w" data-on={on(i < shown)}>
            {word}
          </span>{" "}
        </React.Fragment>
      ))}
    </>
  );
}

function Sheet({
  show,
  label,
  speaking,
  badge,
  children,
}: {
  show: boolean;
  label: string;
  speaking: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dc-sheet" data-on={on(show)} aria-hidden>
      <div className="dc-grab" />
      <div className="dc-meta">
        <span className="dc-meta-l">
          {badge}
          {label}
        </span>
        <Wave on={speaking} />
      </div>
      {children}
    </div>
  );
}

function ModeChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="dc-chip" aria-hidden>
      {children}
    </span>
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
/* 3. Recalls, said first                                                    */
/* ------------------------------------------------------------------------ */

const RECALL_LINE =
  "Tylenol Extra Strength: recalled November 2025 for defective container. Check your lot number.";

function RecallDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 6600, 5400);
  const words = RECALL_LINE.split(" ").length;
  const said = wordsAt(t, 2000, 175, words);
  return (
    <DemoCard
      title={["Recalls,", "said first"]}
      description={`Before anything else, SightLine warns about a recall it found on the web: ${RECALL_LINE}`}
      frozen={state.paused}
    >
      <Scene
        src="/new/pills.webp"
        alt="White tablets in a blister pack, seen up close."
        ratio={[278, 440]}
      >
        <Brackets
          show={t >= 200 && t < 1450}
          box={t < 400 ? { l: 13, t: 9, w: 74, h: 66 } : { l: 19, t: 17, w: 62, h: 46 }}
        />
      </Scene>
      <ModeChip>AUTO</ModeChip>
      <Sheet
        show={t >= 1300}
        label="From the web"
        speaking={said > 0 && t < 4500}
        badge={
          <span className="dc-alert" data-on={on(t >= 1650)}>
            <TriangleAlert strokeWidth={2.6} />
            Recall
          </span>
        }
      >
        <p className="dc-say">
          <Words text={RECALL_LINE} shown={said} />
        </p>
      </Sheet>
    </DemoCard>
  );
}

/* ------------------------------------------------------------------------ */
/* 4. Ask about the menu                                                     */
/* ------------------------------------------------------------------------ */

const MENU_QUESTION = "How much was the first one?";
const MENU_ANSWER = "Tomato Basil Soup is 7 dollars and 50 cents.";

function MenuDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 7000, 6000);
  const asked = wordsAt(t, 700, 210, MENU_QUESTION.split(" ").length);
  const said = wordsAt(t, 2900, 200, MENU_ANSWER.split(" ").length);
  return (
    <DemoCard
      title={["Ask about", "the menu"]}
      screen="#7a6a5a"
      description={`You hold the mic and ask, “${MENU_QUESTION}” SightLine remembers the Harbor Table menu you scanned and answers: ${MENU_ANSWER}`}
      frozen={state.paused}
    >
      <Scene
        src="/new/menu.webp"
        alt="The Harbor Table lunch menu, with starters, mains and desserts."
        ratio={[720, 960]}
        width="112cqw"
        top="1cqw"
        fx={49}
      >
        <span className="dc-mark" data-on={on(t >= 2250)} style={boxStyle({ l: 6, t: 23.6, w: 86, h: 5.4 })} />
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
      <Sheet show={t >= 2500} label="Ask · Harbor Table menu" speaking={said > 0 && t < 5000}>
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
/* 6. Translate any sign                                                     */
/* ------------------------------------------------------------------------ */

const SIGN_LINE = "Caution. Sidewalk work. Cross on the other side.";

function SignDemo({ active, state }: DemoProps) {
  const t = useDemoClock(active, state, 6600, 5600);
  const said = wordsAt(t, 2900, 200, SIGN_LINE.split(" ").length);
  const sign: Box = { l: 15.3, t: 26.4, w: 69.4, h: 15.4 };
  return (
    <DemoCard
      title={["Translate", "any sign"]}
      description={`A Spanish street sign reads “Precaución. Obras en la acera. Cruce por el otro lado.” SightLine translates it and says: ${SIGN_LINE}`}
      frozen={state.paused}
    >
      <Scene
        src="/new/sign.webp"
        alt="A red Spanish street sign reading Precaución, Obras en la acera, Cruce por el otro lado, above a Calle Mayor sign."
        ratio={[760, 1302]}
      >
        <Brackets
          show={t >= 200 && t < 2500}
          box={t < 400 ? { l: 5, t: 17, w: 90, h: 36 } : { l: 12.6, t: 24.6, w: 74.8, h: 19 }}
        />
        <span className="dc-en" data-on={on(t >= 1750)} style={boxStyle(sign)}>
          <b>CAUTION</b>
          <strong>Sidewalk work</strong>
          <span>Cross on the other side</span>
        </span>
        <span className="dc-sweep" data-on={on(t >= 1100 && t < 2300)} style={boxStyle(sign)} />
      </Scene>
      <span className="dc-lang" data-on={on(t >= 500)} aria-hidden>
        <Languages strokeWidth={2.4} />
        Spanish → English
      </span>
      <Sheet show={t >= 2500} label="Translate · Spanish" speaking={said > 0 && t < 4900}>
        <p className="dc-say">
          <Words text={SIGN_LINE} shown={said} />
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
  { label: "Recalls, said first", duration: 6300, render: (a, s) => <RecallDemo active={a} state={s} /> },
  { label: "Ask about the menu", duration: 6700, render: (a, s) => <MenuDemo active={a} state={s} /> },
  { label: "Read any book aloud", duration: 6900, render: (a, s) => <BookDemo active={a} state={s} /> },
  { label: "Translate any sign", duration: 6300, render: (a, s) => <SignDemo active={a} state={s} /> },
];

export function HeroCarousel() {
  return (
    <CoverflowCarousel
      slides={SLIDES}
      label="SightLine demos"
      aspectRatio={9 / 16}
      cardWidth="clamp(236px, 66vw, 316px)"
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
