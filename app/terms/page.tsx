import type { Metadata } from "next";
import { SiteShell } from "../components/site/SiteShell";

export const metadata: Metadata = { title: "Terms · SightLine" };

export default function TermsPage() {
  return (
    <SiteShell>
      <article className="lp-doc">
        <h1>Terms of use</h1>
        <p className="meta">Last updated: November 2026</p>
        <p className="note">Draft for early access. Replace with reviewed terms before a public launch.</p>
        <h2>Using SightLine</h2>
        <p>SightLine is free during early access. Use it for lawful, personal purposes, and don&apos;t point it at people who haven&apos;t agreed to be photographed.</p>
        <h2>Accuracy</h2>
        <p>
          SightLine uses AI to read and describe photos and can make mistakes. Don&apos;t rely on it alone for medical, safety, or legal decisions. For
          medicine, always confirm doses with a pharmacist or doctor.
        </p>
        <h2>Changes</h2>
        <p>We may change or pause the service during early access. We&apos;ll update this page when the terms change.</p>
        <h2>Contact</h2>
        <p>
          <a href="mailto:hello@sightline.example">hello@sightline.example</a>
        </p>
      </article>
    </SiteShell>
  );
}
