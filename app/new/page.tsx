import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BrandMark } from "../components/BrandMark";

import { AppQr } from "./_components/AppQr";
import { Audiences, Faq, Film, Privacy, Stat } from "./_components/FromOurSite";
import { HeroCarousel } from "./_components/HeroCarousel";
import { LiveDemo } from "./_components/LiveDemo";
import { Reveal } from "./_components/motion";
import {
  Answers,
  FromTheWeb,
  HowItWorks,
  Remembers,
  VoiceOverPanel,
  Voices,
} from "./_components/Sections";
import "./new.css";
import "./polish.css";

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

const BUILT_WITH = [
  { name: "Claude", body: "Reads the photo, picks the mode and writes the answer." },
  { name: "ElevenLabs", body: "Speaks every answer in a natural voice, and hears your questions." },
  { name: "Bright Data", body: "Searches the web for recalls, nutrition and reviews." },
  { name: "Neon", body: "Keeps your scan history, so you can ask about it later." },
];

const NAV = [
  { href: "#how", label: "How it works" },
  { href: "#demo", label: "Demo" },
  { href: "#try", label: "Try a sample" },
  { href: "#access", label: "Accessibility" },
  { href: "#faq", label: "FAQ" },
];

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-8 place-items-center rounded-[10px] bg-[#0a0a0a]" aria-hidden>
        <BrandMark size={26} color="#ffffff" />
      </span>
      <span className="text-[19px] font-semibold tracking-[-0.03em]">SightLine</span>
    </span>
  );
}

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
          <Link href="/" aria-label="SightLine home" className="rounded-lg">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <ul className="hidden items-center gap-1 text-[15px] font-medium text-muted-foreground md:flex">
              {NAV.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="rounded-full px-3 py-2 transition hover:text-foreground">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
            <Link href={APP_PATH} className="pill pill-dark pill-sm">
              Try it
            </Link>
          </div>
        </nav>
      </header>

      <main id="main">
        {/* Hero: the headline, one action, and the carousel as the centrepiece. */}
        <section aria-labelledby="hero-h" className="pt-7 sm:pt-9">
          <div className="mx-auto max-w-[1200px] px-4 text-center sm:px-6">
            <h1
              id="hero-h"
              className="mx-auto text-[clamp(46px,7.2vw,84px)] font-bold leading-[0.95] tracking-[-0.055em]"
            >
              Point. Hear. <span className="mark">Know.</span>
            </h1>
            <p className="sr-only">
              SightLine is an AI copilot for blind and low-vision people. Point your iPhone at a menu, a can, a
              medicine box or a sign, and it tells you what matters, out loud.
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link href={APP_PATH} className="pill pill-dark">
                Try SightLine
                <ArrowRight className="size-[18px]" strokeWidth={2.4} aria-hidden />
              </Link>
              <a href="#try" className="pill pill-light">
                Try a sample
              </a>
            </div>
          </div>

          <HeroCarousel />
        </section>

        {/* The problem, then how it works, the voiced film, and a sample to try. */}
        <Stat />
        <HowItWorks />
        <Film />
        <LiveDemo />
        <Answers />
        <FromTheWeb />
        <Remembers />
        <Voices />
        <Audiences />
        <VoiceOverPanel />
        <Privacy />
        <Faq />

        {/* Built with */}
        <section id="built" aria-labelledby="built-h" className="scroll-mt-16 py-14 sm:py-20">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <h2 id="built-h" className="eyebrow">
              Built with
            </h2>
            <ul className="built">
              {BUILT_WITH.map(({ name, body }, i) => (
                <Reveal as="li" key={name} delay={i * 70}>
                  <p className="built-name">{name}</p>
                  <p className="built-body">{body}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {/* Final call to action */}
        <section aria-labelledby="cta-h" className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="cta">
            <div>
              <h2 id="cta-h" className="cta-h">
                Point. Hear. <span className="mark">Know.</span>
              </h2>
              <p className="lede mt-5">Open SightLine on your phone and point it at something.</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href={APP_PATH} className="pill pill-dark">
                  Try SightLine
                  <ArrowRight className="size-[18px]" strokeWidth={2.4} aria-hidden />
                </Link>
              </div>
            </div>
            <figure className="cta-qr">
              <AppQr size={152} />
              <figcaption>Scan to open on your phone</figcaption>
            </figure>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#e5e5ea]">
        <div className="mx-auto flex max-w-[1200px] flex-col gap-8 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <Wordmark />
            <p className="mt-3 text-[15px] text-muted-foreground">Built at SanD Hacks Fall 2026, UC San Diego.</p>
          </div>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[15px] font-medium text-muted-foreground">
            {[
              { href: APP_PATH, label: "Try it" },
              { href: "/accessibility", label: "Accessibility" },
              { href: "/privacy", label: "Privacy" },
              { href: "/terms", label: "Terms" },
            ].map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-11 items-center rounded hover:text-foreground">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </footer>
    </div>
  );
}
