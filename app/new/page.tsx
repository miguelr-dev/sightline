import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ArrowRight, Camera, Mic, Scan, Volume2 } from "lucide-react";

import { HeroCarousel } from "./_components/HeroCarousel";
import "./new.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SightLine: Point. Hear. Know.",
  description:
    "An AI copilot for blind and low-vision people. Point your iPhone at a menu, a can, a medicine box or a sign, and hear what matters.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

const APP_PATH = "/app";

const STEPS = [
  {
    icon: Camera,
    name: "Point",
    body: "Aim at a menu, a can, a medicine box, a sign or a book page. Claude reads it and picks the mode for you.",
  },
  {
    icon: Volume2,
    name: "Hear",
    body: "A natural voice says what matters first: recalls, allergens, prices. In 13 languages.",
  },
  {
    icon: Mic,
    name: "Ask",
    body: "Hold the mic and ask, “How much was the salmon?” SightLine remembers what you scanned.",
  },
];

const ALSO = ["Barcodes", "Book mode", "Ask while looking", "Hat camera"];

const BUILT_WITH = [
  { name: "Claude", body: "Reads what the camera sees and picks the mode." },
  { name: "ElevenLabs", body: "Speaks the answer in a natural voice." },
  { name: "Bright Data", body: "Checks the web for recalls, nutrition and reviews." },
  { name: "Neon", body: "Remembers your scans, so you can ask later." },
];

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-[#0a0a0a]" aria-hidden>
        <Scan className="size-[18px] text-[#ffd60a]" strokeWidth={2.6} />
      </span>
      <span className="text-[19px] font-semibold tracking-[-0.03em]">SightLine</span>
    </span>
  );
}

const pill =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[16px] font-semibold tracking-[-0.01em] transition";
const pillDark = `${pill} bg-[#0a0a0a] text-white hover:bg-[#2c2c2e]`;
const pillLight = `${pill} bg-muted text-foreground hover:bg-[#e5e5ea]`;

export default function NewLanding() {
  return (
    <div className={`sl-new ${inter.variable} min-h-dvh`}>
      <a
        href="#main"
        className="sr-only z-[300] rounded-full bg-[#0a0a0a] px-4 py-2 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-[250] bg-white/80 backdrop-blur-xl backdrop-saturate-150">
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-4 px-4 sm:px-6"
        >
          <Link href="/new" aria-label="SightLine home" className="rounded-lg">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <ul className="hidden items-center gap-1 text-[15px] font-medium text-muted-foreground md:flex">
              <li>
                <a href="#how" className="rounded-full px-3 py-2 transition hover:text-foreground">
                  How it works
                </a>
              </li>
              <li>
                <a href="#built" className="rounded-full px-3 py-2 transition hover:text-foreground">
                  Built with
                </a>
              </li>
              <li>
                <a href="#access" className="rounded-full px-3 py-2 transition hover:text-foreground">
                  Accessibility
                </a>
              </li>
            </ul>
            <Link href={APP_PATH} className={`${pillDark} h-10 px-5 text-[15px]`}>
              Try it
            </Link>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* Hero */}
        <section aria-labelledby="hero-h" className="pt-10 sm:pt-14">
          <div className="mx-auto max-w-[1200px] px-4 text-center sm:px-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-muted px-3.5 py-1.5 text-[14px] font-medium text-muted-foreground">
              <span className="size-2 rounded-full bg-[#ffd60a] ring-1 ring-black/10" aria-hidden />
              For blind and low-vision people, and travelers
            </p>
            <h1
              id="hero-h"
              className="mx-auto mt-5 text-[clamp(50px,8.4vw,96px)] font-bold leading-[0.95] tracking-[-0.055em]"
            >
              Point. Hear. <span className="mark">Know.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-[46ch] text-[clamp(17px,1.6vw,20px)] leading-[1.45] tracking-[-0.01em] text-muted-foreground">
              Point your iPhone at a menu, a can, a medicine box or a sign. SightLine reads it and tells you
              what matters, out loud.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href={APP_PATH} className={pillDark}>
                Try SightLine
                <ArrowRight className="size-[18px]" strokeWidth={2.4} aria-hidden />
              </Link>
              <a href="#how" className={pillLight}>
                How it works
              </a>
            </div>
          </div>

          <div className="mt-2 sm:mt-4">
            <HeroCarousel />
          </div>
        </section>

        {/* How it works */}
        <section id="how" aria-labelledby="how-h" className="scroll-mt-16 py-20 sm:py-32">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <p className="text-[15px] font-semibold text-muted-foreground">How it works</p>
            <h2
              id="how-h"
              className="mt-3 max-w-[16ch] text-[clamp(36px,5.2vw,60px)] font-bold leading-[1] tracking-[-0.045em]"
            >
              Point, hear, ask.
            </h2>
            <ol className="mt-10 grid gap-3 sm:mt-12 sm:gap-4 md:grid-cols-3">
              {STEPS.map(({ icon: Icon, name, body }, i) => (
                <li key={name} className="flex flex-col rounded-[28px] bg-muted p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="grid size-12 place-items-center rounded-full bg-white" aria-hidden>
                      <Icon className="size-[22px]" strokeWidth={2.2} />
                    </span>
                    <span className="text-[15px] font-semibold tabular-nums text-muted-foreground" aria-hidden>
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-6 text-[26px] sm:mt-14 sm:text-[28px] font-bold tracking-[-0.035em]">{name}</h3>
                  <p className="mt-2 text-[17px] leading-[1.5] text-muted-foreground">{body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-8 flex flex-wrap items-center gap-2 text-[15px] text-muted-foreground">
              <span className="mr-1 font-semibold text-foreground">Also</span>
              {ALSO.map((item) => (
                <span key={item} className="rounded-full border border-[#e5e5ea] px-3.5 py-1.5">
                  {item}
                </span>
              ))}
            </p>
          </div>
        </section>

        {/* Built with */}
        <section id="built" aria-labelledby="built-h" className="scroll-mt-16 border-t border-[#e5e5ea] py-20 sm:py-24">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <h2 id="built-h" className="text-[15px] font-semibold text-muted-foreground">
              Built with
            </h2>
            <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-10 lg:grid-cols-4">
              {BUILT_WITH.map(({ name, body }) => (
                <li key={name}>
                  <p className="text-[clamp(26px,3vw,34px)] font-bold tracking-[-0.045em]">{name}</p>
                  <p className="mt-2 max-w-[26ch] text-[16px] leading-[1.45] text-muted-foreground">{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Accessibility promise */}
        <section id="access" aria-labelledby="access-h" className="scroll-mt-16 px-4 pb-24 sm:px-6 sm:pb-32">
          <div className="mx-auto max-w-[1200px] rounded-[36px] bg-[#0a0a0a] px-6 py-16 text-center text-white sm:px-12 sm:py-24">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#ffd60a]" aria-hidden>
              <Scan className="size-6 text-black" strokeWidth={2.6} />
            </span>
            <h2
              id="access-h"
              className="mx-auto mt-8 max-w-[18ch] text-[clamp(34px,5vw,56px)] font-bold leading-[1.02] tracking-[-0.045em]"
            >
              Made to be used without looking.
            </h2>
            <p className="mx-auto mt-6 max-w-[52ch] text-[18px] leading-[1.55] text-[#c7c7cc]">
              Every control is labelled for VoiceOver. Every target is at least 44 points. Every color passes
              WCAG AA. Every animation respects Reduce Motion.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link href={APP_PATH} className={`${pill} bg-white text-[#0a0a0a] hover:bg-[#e5e5ea]`}>
                Try SightLine
                <ArrowRight className="size-[18px]" strokeWidth={2.4} aria-hidden />
              </Link>
              <Link
                href="/accessibility"
                className={`${pill} bg-white/10 text-white hover:bg-white/15`}
              >
                Accessibility statement
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e5e5ea]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Wordmark />
            <p className="mt-3 text-[15px] text-muted-foreground">
              Built at SanD Hacks Fall 2026, UC San Diego.
            </p>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-medium text-muted-foreground">
            <li>
              <Link href={APP_PATH} className="rounded hover:text-foreground">
                Try it
              </Link>
            </li>
            <li>
              <Link href="/accessibility" className="rounded hover:text-foreground">
                Accessibility
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="rounded hover:text-foreground">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="rounded hover:text-foreground">
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </footer>
    </div>
  );
}
