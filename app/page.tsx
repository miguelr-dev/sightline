import type { Metadata, Viewport } from "next";
/* eslint-disable @next/next/no-img-element -- local, pre-sized webp files */
import { DemoFilm } from "./components/site/DemoFilm";
import { Hero } from "./components/site/Hero";
import { Check, ModeIcon, Plus } from "./components/site/Icons";
import { QrCode } from "./components/site/QrCode";
import { SiteShell } from "./components/site/SiteShell";
import { Signup } from "./components/site/Signup";
import { TryIt } from "./components/site/TryIt";
import { A11Y_FEATURES, APP_PATH, FAQS, IMG, MODE_PANELS, MORE_FEATURES } from "./components/site/content";

export const metadata: Metadata = {
  title: "SightLine: Point your camera. Hear the world.",
  description:
    "SightLine reads text out loud, tells you what you're holding, and translates signs and menus. For people who are blind or have low vision, and for travelers.",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
};

const sectionTop = { borderTop: "1px solid #2A2A2A" };

function SectionHead({ id, eyebrow, line1, line2 }: { id: string; eyebrow: string; line1: string; line2?: string }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={id} className="disp sec-h" style={{ marginTop: 18 }}>
        {line1}
        {line2 && (
          <>
            <br />
            <span style={{ color: "#8A8A8A" }}>{line2}</span>
          </>
        )}
      </h2>
    </>
  );
}

export default function Home() {
  return (
    <SiteShell>
      <Hero />
      <DemoFilm />

      {/* How it works */}
      <section className="sec" id="how" aria-labelledby="how-h" style={sectionTop}>
        <div className="wrap">
          <SectionHead id="how-h" eyebrow="How it works" line1="Three steps." line2="No setup." />
          <div className="steps">
            <div className="step">
              <p className="num">01</p>
              <h3>Point.</h3>
              <p>Open SightLine in your phone&apos;s browser and aim the camera at a page, a package, a sign, or the room.</p>
            </div>
            <div className="step">
              <p className="num">02</p>
              <h3>Tap, say it, or just hold.</h3>
              <p>
                Tap Capture, say “read this” or “translate to Spanish”, or turn on Auto and hold steady. SightLine spots the menu, label,
                or sign and offers to read it.
              </p>
            </div>
            <div className="step">
              <p className="num">03</p>
              <h3>Hear it.</h3>
              <p>A short answer out loud in a couple of seconds, with details in sections you can open. Ask a follow-up about the same photo any time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* The four modes */}
      <section className="sec" id="features" aria-labelledby="modes-h" style={{ paddingBottom: 100 }}>
        <div className="wrap">
          <SectionHead id="modes-h" eyebrow="Four modes" line1="One button." line2="Four ways to see." />
        </div>
        {/* Scrollable region: keyboard users can focus it and scroll with the arrow keys. */}
        <div className="rail" role="region" aria-label="The four modes, scroll sideways" tabIndex={0}>
          {MODE_PANELS.map((p) => (
            <article className="mpanel" key={p.key}>
              <img src={p.img} alt={p.alt} style={p.position ? { objectPosition: p.position } : undefined} loading="lazy" />
              <div className="shade" />
              <div className="copy">
                <h3 className="mname" style={{ margin: 0 }}>
                  <ModeIcon mode={p.key} />
                  {p.name}
                </h3>
                <blockquote>“{p.quote}”</blockquote>
                <p className="what">{p.what}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Features from the app */}
      <section className="sec" aria-labelledby="more-h" style={sectionTop}>
        <div className="wrap">
          <SectionHead id="more-h" eyebrow="And then some" line1="It does more" line2="than read." />
          <div className="a11y">
            {MORE_FEATURES.map((x) => (
              <div key={x.title}>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stat */}
      <section className="stat" aria-labelledby="stat-h" style={sectionTop}>
        <div className="wrap">
          <h2 id="stat-h" className="sr">
            Why it matters
          </h2>
          <p className="disp">2.2 billion</p>
          <p className="lead" style={{ marginTop: 28, color: "#fff", fontSize: "clamp(22px, 2.2vw, 30px)" }}>
            people worldwide live with a vision impairment. Menus, medicine labels, and street signs still assume everyone can read them.
          </p>
          <p style={{ marginTop: 20, fontSize: 15, color: "#B8B8B8" }}>
            Source:{" "}
            <a href="https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment">
              World Health Organization, Blindness and vision impairment fact sheet
            </a>
          </p>
        </div>
      </section>

      {/* Audiences */}
      <section className="sec" id="travelers" aria-labelledby="aud-h" style={sectionTop}>
        <div className="wrap">
          <SectionHead id="aud-h" eyebrow="Who it's for" line1="Two kinds of people." line2="One button." />
          <div className="aud">
            <div className="audcol">
              <img src={IMG.bottle} alt="A prescription bottle of Nateglinide tablets." loading="lazy" style={{ width: "100%", height: 320, objectFit: "cover", objectPosition: "50% 55%", borderRadius: 20, display: "block" }} />
              <h3>Can&apos;t see it?</h3>
              <p className="muted2" style={{ margin: 0 }}>
                For people who are blind or have low vision. SightLine reads the mail, the pill bottle, and the thermostat, so you don&apos;t
                have to wait for someone to help.
              </p>
              <ul className="ticks">
                {["Works with VoiceOver and TalkBack, or speaks for itself", "Medicine doses and warnings read word for word", "Tells you if a finger is covering the text, and how to fix it"].map((t) => (
                  <li key={t}>
                    <Check />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="audcol alt">
              <img src={IMG.menu} alt="A chalkboard Menú del día beside café tables on a narrow street in Seville." loading="lazy" style={{ width: "100%", height: 320, objectFit: "cover", borderRadius: 20, display: "block" }} />
              <h3>Can&apos;t read it?</h3>
              <p className="muted2" style={{ margin: 0 }}>
                For travelers. Point at a street sign, a train notice, or a menu in another language and hear it in yours, with unfamiliar
                dishes explained.
              </p>
              <ul className="ticks">
                {["13 languages, each with its own voice", "Menus summarized with prices and allergens", "Ask “what comes with it?” about the same photo"].map((t) => (
                  <li key={t}>
                    <Check />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <TryIt />

      {/* Accessibility */}
      <section className="sec" id="accessibility" aria-labelledby="a11y-h" style={sectionTop}>
        <div className="wrap">
          <SectionHead id="a11y-h" eyebrow="Accessibility" line1="Built for every" line2="way you see." />
          <div className="a11y">
            {A11Y_FEATURES.map((x) => (
              <div key={x.title}>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section className="sec" aria-labelledby="trust-h" style={sectionTop}>
        <div className="wrap">
          <SectionHead id="trust-h" eyebrow="Privacy" line1="Your photos" line2="stay yours." />
          <div className="trust">
            <p>
              Photos aren&apos;t kept.
              <small>Each photo is described and then discarded. Only the answer text is saved, so you can ask about it later. Clear it any time in Settings.</small>
            </p>
            <p>
              No account.
              <small>No sign-up, no email, no profile. Your history belongs to this device, not to your name.</small>
            </p>
            <p>
              Browser or app.
              <small>Works in any phone browser, with an iPhone app in testing. Add it to your home screen if you like.</small>
            </p>
          </div>
          <p style={{ marginTop: 56, color: "#B8B8B8" }}>
            Built with <a href="https://www.anthropic.com/claude">Claude by Anthropic</a>, voices by <a href="https://elevenlabs.io">ElevenLabs</a>, web
            results by <a href="https://brightdata.com">Bright Data</a>, and history on <a href="https://neon.tech">Neon</a>.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec" id="faq" aria-labelledby="faq-h" style={sectionTop}>
        <div className="wrap">
          <SectionHead id="faq-h" eyebrow="FAQ" line1="Questions." />
          <div className="faq">
            {FAQS.map((f) => (
              <details key={f.q}>
                <summary>
                  {f.q}
                  <span className="plus" aria-hidden="true">
                    <Plus />
                  </span>
                </summary>
                <p className="ans">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Closing */}
      <section className="closing" aria-label="Get SightLine">
        <div className="wrap">
          <h2 id="close-h" className="disp">
            Point your camera.
            <br />
            <span style={{ color: "#8A8A8A" }}>Hear the world.</span>
          </h2>
          <div className="qrwrap">
            <QrCode path={APP_PATH} size={168} />
            <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
              <p style={{ margin: 0, fontSize: 20, maxWidth: 320 }}>Scan with your phone&apos;s camera to open SightLine, or open it here.</p>
              <a className="btn btn-p" href={APP_PATH} style={{ minHeight: 60, padding: "0 34px", fontSize: 19 }}>
                Try SightLine, free
              </a>
            </div>
          </div>
          <p style={{ margin: "72px 0 0", fontWeight: 700 }}>Get early access to what&apos;s next</p>
          <Signup />
        </div>
      </section>
    </SiteShell>
  );
}
