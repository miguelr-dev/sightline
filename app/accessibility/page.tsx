import type { Metadata } from "next";
import { SiteShell } from "../components/site/SiteShell";

export const metadata: Metadata = { title: "Accessibility statement · SightLine" };

export default function AccessibilityPage() {
  return (
    <SiteShell>
      <article className="lp-doc">
        <h1>Accessibility statement</h1>
        <p className="meta">Last updated: November 2026</p>
        <p>SightLine exists to make printed and visual information accessible, so the app and this website are held to the same standard we ask of everyone else.</p>
        <h2>Our goal</h2>
        <p>We aim to meet the Web Content Accessibility Guidelines (WCAG) 2.2 at level AA, and level AAA for color contrast wherever we can.</p>
        <h2>What we&apos;ve built in</h2>
        <ul>
          <li>Every control has a text label, and results are announced to screen readers as they arrive.</li>
          <li>Works with VoiceOver on iOS and TalkBack on Android. An Auto-speak switch stops SightLine talking over your screen reader.</li>
          <li>Black on white, and every text color passes WCAG AA. The selected mode is filled black with a check mark, not shown by color alone.</li>
          <li>Every control is at least 44 points, and Capture is always on screen.</li>
          <li>Haptic feedback and spoken status (“Looking…”) so you know what&apos;s happening without looking.</li>
          <li>Text follows your phone&apos;s text size setting (Dynamic Type), and Reduce Motion is respected.</li>
          <li>This website uses Atkinson Hyperlegible, a typeface designed by the Braille Institute for low-vision readers, keeps pinch zoom on, and pauses its animations under reduced motion.</li>
        </ul>
        <h2>Known limitations</h2>
        <ul>
          <li>In the web version, vibration isn&apos;t available in Safari on iPhone. The iPhone app uses haptics instead.</li>
          <li>Voice commands depend on your browser&apos;s speech recognition. Where it isn&apos;t supported, every feature still works with buttons and a text box.</li>
          <li>SightLine needs an internet connection to describe a photo.</li>
        </ul>
        <h2>How we test</h2>
        <p>Automated checks with axe-core, plus manual testing with VoiceOver and TalkBack.</p>
        <h2>Tell us what isn&apos;t working</h2>
        <p>
          If anything in SightLine or on this site gets in your way, we want to hear about it.{" "}
          <a href="https://github.com/miguelr-dev/sightline/issues">Open an issue on GitHub</a>.
        </p>
      </article>
    </SiteShell>
  );
}
