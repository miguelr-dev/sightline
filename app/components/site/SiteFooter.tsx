import Link from "next/link";
import { PHOTO_CREDITS } from "./content";
import { LogoMark, SocialIcon } from "./Icons";

// The team has no email address or social accounts yet, so contact goes through GitHub.
const CONTACT = "https://github.com/miguelr-dev/sightline/issues";
const SOCIALS = [{ name: "github", label: "GitHub", href: "https://github.com/miguelr-dev/sightline" }] as const;

export function SiteFooter() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="fgrid">
          <div>
            <Link className="brand" href="/">
              <LogoMark />
              SightLine
            </Link>
            <p className="muted2" style={{ margin: "16px 0 0", maxWidth: 300 }}>
              Point your camera. Hear the world.
            </p>
            <div className="socials">
              {SOCIALS.map((s) => (
                <a key={s.name} href={s.href} aria-label={s.label}>
                  <SocialIcon name={s.name} />
                </a>
              ))}
            </div>
          </div>
          <nav aria-labelledby="f-product">
            <h2 id="f-product">Product</h2>
            <ul>
              <li><Link href="/#how">How it works</Link></li>
              <li><Link href="/#features">Features</Link></li>
              <li><Link href="/#try">Try it</Link></li>
              <li><Link href="/app">Open the app</Link></li>
            </ul>
          </nav>
          <nav aria-labelledby="f-company">
            <h2 id="f-company">Company</h2>
            <ul>
              <li><Link href="/press">Press kit</Link></li>
              <li><a href={CONTACT}>Contact</a></li>
              <li><a href="https://github.com/miguelr-dev/sightline">Source code</a></li>
            </ul>
          </nav>
          <nav aria-labelledby="f-support">
            <h2 id="f-support">Support</h2>
            <ul>
              <li><Link href="/#faq">FAQ</Link></li>
              <li><Link href="/accessibility">Accessibility statement</Link></li>
            </ul>
          </nav>
          <nav aria-labelledby="f-legal">
            <h2 id="f-legal">Legal</h2>
            <ul>
              <li><Link href="/privacy">Privacy policy</Link></li>
              <li><Link href="/terms">Terms</Link></li>
            </ul>
          </nav>
        </div>
        <p style={{ margin: "56px 0 0", fontSize: 13.5, lineHeight: 1.6, color: "#B8B8B8", maxWidth: 980 }}>
          Photos from Wikimedia Commons, cropped and resized:{" "}
          {PHOTO_CREDITS.map((c, i) => (
            <span key={c.src}>
              <a href={c.src}>“{c.title}”</a> by {c.by},{" "}
              {c.licenseUrl ? <a href={c.licenseUrl}>{c.license}</a> : c.license}
              {i < PHOTO_CREDITS.length - 1 ? "; " : "."}
            </span>
          ))}
        </p>
        <div className="fbottom">
          <span>© 2026 SightLine · Built at SanD Hacks Fall 2026</span>
          <span>
            Built with Claude by Anthropic, ElevenLabs, Bright Data, and Neon
          </span>
        </div>
      </div>
    </footer>
  );
}
