import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element -- local, pre-sized webp files */
import { LogoMark } from "../components/site/Icons";
import { SiteShell } from "../components/site/SiteShell";
import { IMG } from "../components/site/content";

export const metadata: Metadata = { title: "Press kit · SightLine" };

const FACTS: [string, string][] = [
  ["Name", "SightLine"],
  ["Tagline", "Point your camera. Hear the world."],
  ["Launched", "SanD Hacks, Fall 2026"],
  ["Price", "Free during early access"],
  ["Platforms", "Any modern phone browser; iPhone app in testing"],
  ["Modes", "Auto, Read, Describe, Menu / Label, Translate (13 languages); barcodes and book mode in the iPhone app"],
  ["Built with", "Claude by Anthropic, ElevenLabs, Bright Data, Neon, Next.js, Expo"],
  ["Source", "github.com/miguelr-dev/sightline"],
];

export default function PressPage() {
  return (
    <SiteShell>
      <article className="lp-doc" style={{ maxWidth: 1000 }}>
        <h1>Press kit</h1>
        <p style={{ maxWidth: 720 }}>
          SightLine is a free app that reads the world out loud. Point your phone&apos;s camera at a menu, a medicine label, a letter, or a street
          sign, and SightLine reads it, describes it, or translates it into your language. It&apos;s built for people who are blind or have low
          vision, and for travelers who can&apos;t read the local language.
        </p>
        <h2>Fact sheet</h2>
        <dl className="facts">
          {FACTS.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <h2>Logo</h2>
        <div className="marks">
          <div className="mark" style={{ background: "#000" }}>
            <LogoMark size={96} />
          </div>
          <div className="mark" style={{ background: "#fff" }}>
            <LogoMark size={96} onLight />
          </div>
          <div className="mark" style={{ background: "#F2F2F7" }}>
            <LogoMark size={96} onLight />
          </div>
        </div>
        <p>
          Open line is SightLine&apos;s S monogram. Use black on light surfaces and white on dark surfaces.
          Keep the shape and its clear space intact.
        </p>
        <p style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          <a href="/brand/logo-black.svg" download>Black logo (SVG)</a>
          <a href="/brand/logo-white.svg" download>White logo (SVG)</a>
          <a href="/brand/mark-black.svg" download>Symbol (SVG)</a>
          <a href="/brand/app-icon-1024.png" download>App icon (1024 px PNG)</a>
        </p>
        <h2>Colors and type</h2>
        <p>
          Black #000000 and white #FFFFFF, with grays #55555A and #F2F2F7 in the app. Website type: Atkinson Hyperlegible for body text and Inter
          Tight for headlines. The app uses the iPhone&apos;s system font.
        </p>
        <h2>Photos</h2>
        <div className="shots">
          <img src={IMG.menu} alt="A chalkboard Menú del día in Seville, used in the Translate demo." loading="lazy" />
          <img src={IMG.sign} alt="A no-skateboarding sign in Logroño, Spain, used in the Translate demo." loading="lazy" />
          <img src={IMG.medicine} alt="A box of methylprednisolone tablets, used in the Menu / Label demo." loading="lazy" />
        </div>
        <p className="meta">Photo credits are listed at the bottom of every page.</p>
        <h2>Press contact</h2>
        <p>
          <a href="mailto:hello@sightline.example">hello@sightline.example</a>
        </p>
      </article>
    </SiteShell>
  );
}
