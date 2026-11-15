// Sections carried over from the first SightLine site (app/components/site) into this landing page:
// the WHO stat, the voiced demo film, who it's for, the privacy promise and the FAQ. They use this
// page's type and spacing (.sl-new: eyebrow, h2, lede) so they read as one site. The film keeps its
// own styles (site.css, scoped under .sl), switched to a light theme by film-light.css.

import { Check, Plus } from "lucide-react";

import { DemoFilm } from "@/app/components/site/DemoFilm";
import { FAQS, IMG } from "@/app/components/site/content";
import "@/app/components/site/site.css";
import "./film-light.css";

import { Reveal } from "./motion";

const WHO = "https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment";

/** The problem, in one number. */
export function Stat() {
  return (
    <section aria-labelledby="why-h" className="pb-6 pt-16 sm:pt-24">
      <Reveal className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <h2 id="why-h" className="sr-only">
          Why it matters
        </h2>
        <p aria-hidden className="text-[clamp(72px,12vw,160px)] font-bold leading-[0.88] tracking-[-0.06em]">
          2.2 billion
        </p>
        <p className="mt-6 max-w-[30ch] text-[clamp(22px,2.3vw,30px)] font-semibold leading-[1.25] tracking-[-0.025em]">
          <span className="sr-only">2.2 billion </span>
          people worldwide live with a vision impairment. Menus, medicine labels and street signs still assume everyone can read
          them.
        </p>
        <p className="mt-5 text-[15px] text-muted-foreground">
          Source:{" "}
          <a href={WHO} className="underline underline-offset-4 hover:text-foreground">
            World Health Organization, Blindness and vision impairment
          </a>
        </p>
      </Reveal>
    </section>
  );
}

/** The voiced product film (Matilda reads each chapter), in a light panel like the page's other stages. */
export function Film() {
  return (
    <div className="scroll-mt-16 px-4 sm:px-6" id="film">
      <div className="sl film-light mx-auto max-w-[1200px] overflow-hidden rounded-[36px] [&_#demo]:!pb-14">
        <DemoFilm />
      </div>
    </div>
  );
}

const AUDIENCES = [
  {
    title: "Can’t see it?",
    body: "For people who are blind or have low vision. SightLine reads the mail, the pill bottle and the thermostat, so you don’t have to wait for someone to help.",
    img: IMG.bottle,
    alt: "A prescription bottle of Nateglinide tablets.",
    pos: "50% 55%",
    ticks: ["Works with VoiceOver, or speaks for itself", "Medicine doses and warnings read word for word", "Tells you if a finger covers the text, and how to fix it"],
  },
  {
    title: "Can’t read it?",
    body: "For travelers. Point at a street sign, a train notice or a menu in another language and hear it in yours, with unfamiliar dishes explained.",
    img: IMG.menu,
    alt: "A chalkboard Menú del día beside café tables on a narrow street in Seville.",
    pos: "50% 50%",
    ticks: ["13 languages, each with its own voice", "Menus with prices and allergens", "Ask “what comes with it?” about the same photo"],
  },
];

/** The two audiences. */
export function Audiences() {
  return (
    <section id="who" aria-labelledby="who-h" className="scroll-mt-16 py-14 sm:py-20">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <Reveal>
          <p className="eyebrow">Who it’s for</p>
          <h2 id="who-h" className="h2">
            Two kinds of people. One button.
          </h2>
        </Reveal>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {AUDIENCES.map((a, i) => (
            <Reveal key={a.title} delay={i * 80} className="rounded-[28px] bg-muted p-4 sm:p-5">
              {/* eslint-disable-next-line @next/next/no-img-element -- static photo */}
              <img src={a.img} alt={a.alt} loading="lazy" className="h-60 w-full rounded-[20px] object-cover sm:h-72" style={{ objectPosition: a.pos }} />
              <div className="px-1 pb-2 pt-6 sm:px-2">
                <h3 className="text-[clamp(28px,2.8vw,36px)] font-bold tracking-[-0.04em]">{a.title}</h3>
                <p className="mt-3 text-[17px] leading-[1.5] text-muted-foreground">{a.body}</p>
                <ul className="mt-5 flex flex-col gap-3">
                  {a.ticks.map((t) => (
                    <li key={t} className="flex items-start gap-3 text-[16px] font-medium">
                      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[#0a0a0a] text-white" aria-hidden>
                        <Check className="size-3.5" strokeWidth={3} />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const PROMISES = [
  { title: "Photos aren’t kept.", body: "Each photo is described and then discarded. Only the answer text is saved, so you can ask about it later. Clear it any time in Settings." },
  { title: "No account.", body: "No sign-up, no email, no profile. Your history belongs to this device, not to your name." },
  { title: "Browser or app.", body: "Works in any phone browser, with an iPhone app in testing. Add it to your home screen if you like." },
];

/** The privacy promise. */
export function Privacy() {
  return (
    <section id="privacy" aria-labelledby="privacy-h" className="scroll-mt-16 py-14 sm:py-20">
      <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
        <Reveal>
          <p className="eyebrow">Privacy</p>
          <h2 id="privacy-h" className="h2">
            Your photos stay yours.
          </h2>
        </Reveal>
        <ul className="mt-10 grid gap-8 md:grid-cols-3">
          {PROMISES.map((p, i) => (
            <Reveal as="li" key={p.title} delay={i * 70} className="border-t-2 border-[#0a0a0a] pt-5">
              <p className="text-[22px] font-bold tracking-[-0.03em]">{p.title}</p>
              <p className="mt-2 text-[17px] leading-[1.5] text-muted-foreground">{p.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** Frequently asked questions. */
export function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-h" className="scroll-mt-16 py-14 sm:py-20">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-4 sm:px-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Reveal>
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-h" className="h2">
            Questions.
          </h2>
        </Reveal>
        <div className="border-b border-[#e5e5ea]">
          {FAQS.map((f) => (
            <details key={f.q} className="group border-t border-[#e5e5ea]">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 py-4 text-[19px] font-semibold tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted transition-transform group-open:rotate-45 motion-reduce:transition-none" aria-hidden>
                  <Plus className="size-4" strokeWidth={2.6} />
                </span>
              </summary>
              <p className="max-w-[60ch] pb-6 text-[17px] leading-[1.55] text-muted-foreground">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
