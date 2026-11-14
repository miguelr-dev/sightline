import Image from "next/image";
import Link from "next/link";
import { GITHUB_URL, LANGUAGES, MODES, VOICE_COMMANDS, WEB_SOURCES } from "./content";
import { HeroCarousel } from "./HeroCarousel";
import { ArrowUpRight, GitHub, Mic, Play } from "./icons";
import { QrCode } from "./QrCode";
import { VideoDemo } from "./VideoDemo";

const PHONE_W = 866;
const PHONE_H = 1784;

function Phone({ src, alt, sizes, className }: { src: string; alt: string; sizes: string; className?: string }) {
  return <Image src={src} alt={alt} width={PHONE_W} height={PHONE_H} sizes={sizes} className={`lp-phone ${className ?? ""}`} />;
}

export function Landing() {
  return (
    <div className="landing">
      <a className="lp-skip" href="#main">
        Skip to content
      </a>

      <header className="lp-nav">
        <div className="lp-nav-inner">
          <Link href="/" className="lp-wordmark" aria-label="SightLine, home">
            SightLine
          </Link>
          <nav aria-label="Sections" className="lp-nav-links">
            <a href="#modes">Modes</a>
            <a href="#web">Web</a>
            <a href="#voice">Voice</a>
            <a href="#accessibility">Accessibility</a>
            <a href="#demo">Demo</a>
          </nav>
          <Link href="/app" className="lp-pill lp-pill-sm">
            Try it
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero-text">
            <p className="lp-eyebrow">SightLine</p>
            <h1 id="hero-title" className="lp-display">
              Point. Hear. Know.
            </h1>
            <p className="lp-lede lp-hero-lede">
              An AI copilot for blind and low-vision people. Point your phone at a menu, a medicine box or a street sign,
              and hear what matters in a natural voice.
            </p>
            <div className="lp-cta-row">
              <Link href="/app" className="lp-pill">
                Try it on your phone
              </Link>
              <a href="#demo" className="lp-textlink">
                <span className="lp-textlink-icon" aria-hidden="true">
                  <Play size={12} />
                </span>
                Watch the demo
              </a>
            </div>
          </div>
          <div className="lp-wrap lp-wrap-wide">
            <HeroCarousel />
          </div>
        </section>

        {/* Modes */}
        <section id="modes" className="lp-section" aria-labelledby="modes-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <p className="lp-kicker">Four modes</p>
              <h2 id="modes-title" className="lp-title">
                One button. Four ways to see.
              </h2>
              <p className="lp-lede">
                Pick a mode, then tap Capture, or tap anywhere on the camera view. Or just say what you want.
              </p>
            </div>
            <ul className="lp-modes" role="list">
              {MODES.map((m) => (
                <li key={m.name} className="lp-mode">
                  <div className="lp-mode-media">
                    <Phone src={m.image} alt={m.alt} sizes="(min-width: 1024px) 220px, 40vw" />
                  </div>
                  <h3 className="lp-mode-name">{m.name}</h3>
                  <p className="lp-mode-hint">{m.hint}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Answers */}
        <section className="lp-section lp-section-grey" aria-labelledby="answers-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <p className="lp-kicker">Powered by Claude</p>
              <h2 id="answers-title" className="lp-title">
                Answers, not descriptions.
              </h2>
              <p className="lp-lede">
                SightLine leads with what you came for: the name, the dose, the price, the warning. One or two spoken
                sentences first. The rest waits in sections you open when you want them.
              </p>
            </div>
            <div className="lp-pair">
              <figure className="lp-pair-item">
                <div className="lp-panel">
                  <Phone
                    src="/landing/phone-answer-short.webp"
                    alt="SightLine's answer for a cereal box: Oat Crunch Honey Almond whole grain cereal, 14 ounce box, 160 calories and 12 grams of sugar per three-quarter cup. Replay and Stop buttons sit below."
                    sizes="(min-width: 1024px) 340px, 70vw"
                  />
                </div>
                <figcaption>
                  <strong>Spoken first.</strong> A short answer you hear in seconds, with Replay, Stop and speeds from
                  0.75× to 1.5×.
                </figcaption>
              </figure>
              <figure className="lp-pair-item">
                <div className="lp-panel">
                  <Phone
                    src="/landing/phone-answer-details.webp"
                    alt="The same answer scrolled down: the Nutrition section is open, and below it the follow-up question Is this OK for someone with a nut allergy? is answered: No, not safe for a nut allergy."
                    sizes="(min-width: 1024px) 340px, 70vw"
                  />
                </div>
                <figcaption>
                  <strong>Details when you want them.</strong> Collapsible sections, and follow-up questions about the
                  same photo, typed or spoken.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* From the web */}
        <section id="web" className="lp-section" aria-labelledby="web-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <p className="lp-kicker">From the web, with Bright Data</p>
              <h2 id="web-title" className="lp-title">
                What the label can’t tell you.
              </h2>
              <p className="lp-lede">
                When the photo shows a product, a medicine or a restaurant, SightLine searches the live web and adds a
                short spoken summary after the first answer. Recalls and FDA warnings always come first.
              </p>
            </div>
            <div className="lp-split">
              <div className="lp-panel lp-panel-tall">
                <Phone
                  src="/landing/phone-web-recall.webp"
                  alt="SightLine's From the web card for the acetaminophen box: There are recent recalls of acetaminophen 500 milligram Extra Strength caplets. Check your lot number or ask a pharmacist. Sources listed: fda.gov, wbaltv.com and health.com."
                  sizes="(min-width: 1024px) 340px, 70vw"
                />
              </div>
              <div className="lp-split-text">
                <ul className="lp-facts" role="list">
                  <li>
                    <h3>Recalls first</h3>
                    <p>Medicines are checked for recalls and FDA safety notices before anything else.</p>
                  </li>
                  <li>
                    <h3>Nutrition, caffeine, price</h3>
                    <p>For a snack or drink: sugar, caffeine and what it costs.</p>
                  </li>
                  <li>
                    <h3>Hours, reviews, allergens</h3>
                    <p>For a restaurant: cuisine, rating, opening hours and popular dishes.</p>
                  </li>
                  <li>
                    <h3>Never waits</h3>
                    <p>The first answer is spoken right away. The web summary follows when it’s ready.</p>
                  </li>
                </ul>
                <h3 className="lp-sources-title">Every claim has a source</h3>
                <ul className="lp-sources" role="list">
                  {WEB_SOURCES.map((s) => (
                    <li key={s.title} className="lp-source">
                      <span className="lp-source-thumb" aria-hidden="true">
                        {s.domain[0].toUpperCase()}
                      </span>
                      <span className="lp-source-text">
                        <span className="lp-source-title">{s.title}</span>
                        <span className="lp-source-meta">
                          {s.domain} · {s.kind}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Voice */}
        <section id="voice" className="lp-section lp-section-grey" aria-labelledby="voice-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <p className="lp-kicker">Spoken by ElevenLabs</p>
              <h2 id="voice-title" className="lp-title">
                A voice you’d choose.
              </h2>
              <p className="lp-lede">
                Natural ElevenLabs voices read every answer, in 13 languages. Translate reads a sign or a menu and speaks
                it in yours. If the network drops, SightLine switches to your phone’s own voice without stopping.
              </p>
            </div>
            <div className="lp-split lp-split-reverse">
              <div className="lp-panel lp-panel-tall lp-panel-white">
                <Phone
                  src="/landing/phone-translate-japanese.webp"
                  alt="SightLine translating the Harbor Table menu into Japanese and speaking it at 1.25 times speed. The answer is in Japanese, with Translation and Original text sections below."
                  sizes="(min-width: 1024px) 340px, 70vw"
                />
              </div>
              <div className="lp-split-text">
                <h3 className="lp-langs-title">13 languages</h3>
                <ul className="lp-langs" role="list">
                  {LANGUAGES.map((l) => (
                    <li key={l.name}>
                      <span lang={l.lang} dir={l.dir} aria-hidden="true">
                        {l.native}
                      </span>
                      <span className="lp-visually-hidden">{l.name}</span>
                    </li>
                  ))}
                </ul>
                <p className="lp-note">
                  Flash v2.5 speech starts in about a tenth of a second. Long answers are spoken sentence by sentence, so
                  the first words arrive fast.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Hands-free */}
        <section className="lp-section" aria-labelledby="hands-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <p className="lp-kicker">Auto mode and voice commands</p>
              <h2 id="hands-title" className="lp-title">
                Hands-free.
              </h2>
              <p className="lp-lede">
                Turn on Auto and hold your phone over something. SightLine waits until it’s steady and fully in frame,
                tells you to move closer if it isn’t, then reads it.
              </p>
            </div>
            <div className="lp-split">
              <div className="lp-panel lp-panel-tall">
                <Phone
                  src="/landing/phone-auto.webp"
                  alt="SightLine's camera view with Auto on. A can of Volt energy drink is in frame, and a hint at the top says Move a little closer."
                  sizes="(min-width: 1024px) 340px, 70vw"
                />
              </div>
              <div className="lp-split-text">
                <h3 className="lp-sub">
                  <span className="lp-sub-icon" aria-hidden="true">
                    <Mic size={14} />
                  </span>
                  Or just say it
                </h3>
                <ul className="lp-chips" role="list">
                  {VOICE_COMMANDS.map((c) => (
                    <li key={c} className="lp-chip">
                      “{c}”
                    </li>
                  ))}
                </ul>
                <p className="lp-note">
                  Where the browser can’t recognise speech itself, SightLine records the command and transcribes it with
                  ElevenLabs Scribe.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* VoiceOver */}
        <section id="accessibility" className="lp-section lp-section-dark" aria-labelledby="a11y-title">
          <div className="lp-wrap">
            <div className="lp-head">
              <p className="lp-kicker">Accessibility is the product</p>
              <h2 id="a11y-title" className="lp-title">
                Built for VoiceOver.
              </h2>
              <p className="lp-lede">
                Every control has a label, every answer is announced, and nothing depends on seeing the screen.
              </p>
            </div>
            <div className="lp-split">
              <div className="lp-panel lp-panel-tall lp-panel-dark">
                <Phone
                  src="/landing/phone-voiceover.webp"
                  alt="VoiceOver's cursor on SightLine's Capture button, with the caption: Capture, Menu / Label mode, button. Double-tap to capture in Menu / Label mode."
                  sizes="(min-width: 1024px) 340px, 70vw"
                />
              </div>
              <div className="lp-split-text">
                <dl className="lp-stats">
                  <div>
                    <dt>Minimum touch target</dt>
                    <dd>44 pt</dd>
                  </div>
                  <div>
                    <dt>axe-core violations in the web app, WCAG 2.2 A to AAA</dt>
                    <dd>0</dd>
                  </div>
                </dl>
                <ul className="lp-facts lp-facts-dark" role="list">
                  <li>
                    <h3>Announced, not repeated</h3>
                    <p>Answers arrive through a polite live region, and web results through a second one, so nothing is read twice.</p>
                  </li>
                  <li>
                    <h3>Quiet when you need it</h3>
                    <p>Turn Auto-speak off and VoiceOver reads the answers instead, so two voices never talk over each other.</p>
                  </li>
                  <li>
                    <h3>Feedback beyond sight</h3>
                    <p>A beep and a haptic tap when a capture starts, and two rising beeps when the answer is ready.</p>
                  </li>
                  <li>
                    <h3>Your settings, respected</h3>
                    <p>Text follows Dynamic Type, motion follows Reduce Motion, and pinch zoom always works.</p>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* Video */}
        <section id="demo" className="lp-section" aria-labelledby="demo-title">
          <div className="lp-wrap">
            <div className="lp-head lp-head-center">
              <h2 id="demo-title" className="lp-title">
                See it in action.
              </h2>
              <p className="lp-lede">A menu, a medicine box and a street sign, start to finish.</p>
            </div>
            <VideoDemo />
          </div>
        </section>

        {/* CTA */}
        <section className="lp-section lp-section-grey" aria-labelledby="try-title">
          <div className="lp-wrap lp-try">
            <div className="lp-try-text">
              <h2 id="try-title" className="lp-title">
                Try it on your phone.
              </h2>
              <p className="lp-lede">
                SightLine runs in your phone’s browser. Open it, allow the camera, and point. Add it to your Home Screen
                and it opens full screen, like an app.
              </p>
              <div className="lp-cta-row">
                <Link href="/app" className="lp-pill">
                  Open SightLine
                </Link>
              </div>
            </div>
            <div className="lp-try-qr">
              <QrCode />
              <p className="lp-qr-hint">Scan with your iPhone camera.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-inner">
          <p className="lp-footer-credit">
            Built at SanD Hacks Fall 2026 with Claude by Anthropic, ElevenLabs and Bright Data.
          </p>
          <p className="lp-footer-note">
            Product packaging on this page is illustrative. The answers shown are real SightLine responses.
          </p>
          <p>
            <a href={GITHUB_URL} className="lp-footer-link" target="_blank" rel="noopener noreferrer">
              <GitHub size={16} />
              Source on GitHub
              <ArrowUpRight size={12} />
              <span className="lp-visually-hidden"> (opens in a new tab)</span>
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
