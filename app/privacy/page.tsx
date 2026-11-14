import type { Metadata } from "next";
import { SiteShell } from "../components/site/SiteShell";

export const metadata: Metadata = { title: "Privacy policy · SightLine" };

export default function PrivacyPage() {
  return (
    <SiteShell>
      <article className="lp-doc">
        <h1>Privacy policy</h1>
        <p className="meta">Last updated: November 2026</p>
        <p className="note">Draft for early access. Have it reviewed before a public launch.</p>
        <h2>The short version</h2>
        <ul>
          <li>No account, no sign-up, no profile.</li>
          <li>Photos are sent to be described and are never stored by SightLine.</li>
          <li>The text of your recent answers is kept for your device so you can ask about it later. You can clear it in Settings.</li>
        </ul>
        <h2>Photos</h2>
        <p>
          When you capture, the photo is shrunk and sent over an encrypted connection to our server, which passes it to Anthropic&apos;s Claude to be
          described. SightLine does not save the photo. Anthropic processes it under its own commercial terms and privacy policy:{" "}
          <a href="https://www.anthropic.com/legal/privacy">anthropic.com/legal/privacy</a>.
        </p>
        <h2>Answers and history</h2>
        <p>
          SightLine saves the text of each answer, its sections, and any web image links in a database hosted by Neon, tied to a random ID for your
          device rather than to your name. This powers Recent and “Ask your history”. Clearing your history in Settings deletes it.
        </p>
        <h2>Other services we use</h2>
        <ul>
          <li>ElevenLabs turns answer text into speech when the natural voice is on.</li>
          <li>Bright Data runs web searches for what SightLine identified, such as a product name, to find recalls, nutrition, and reviews.</li>
        </ul>
        <h2>Camera and microphone</h2>
        <p>The camera is only used while SightLine is open. The microphone is only used when you tap a voice button.</p>
        <h2>Stored on your device</h2>
        <p>Your settings, such as speech speed, voice, translation language, and Auto capture, stay on your device so they&apos;re there next time.</p>
        <h2>Analytics and cookies</h2>
        <p>SightLine uses no advertising or tracking cookies.</p>
        <h2>Contact</h2>
        <p>
          Questions about privacy: <a href="mailto:hello@sightline.example">hello@sightline.example</a>
        </p>
      </article>
    </SiteShell>
  );
}
