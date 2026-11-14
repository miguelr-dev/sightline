"use client";

import Link from "next/link";
import { useState } from "react";
import { APP_PATH } from "./content";
import { LogoMark } from "./Icons";

const LINKS = [
  { href: "/#how", label: "How it works" },
  { href: "/#features", label: "Features" },
  { href: "/#travelers", label: "For travelers" },
  { href: "/#accessibility", label: "Accessibility" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="nav">
      <div className="wrap navin">
        <Link className="brand" href="/" aria-label="SightLine home">
          <LogoMark />
          SightLine
        </Link>
        <nav aria-label="Main">
          <ul className="navlinks">
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <a className="btn btn-p btn-sm navcta" href={APP_PATH}>
            Try SightLine
          </a>
          <button
            className="btn btn-g btn-sm navtoggle"
            type="button"
            aria-expanded={open}
            aria-controls="mobilemenu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? "Close" : "Menu"}
          </button>
        </div>
      </div>
      {open && (
        <div className="mobilemenu" id="mobilemenu">
          <ul className="wrap" style={{ listStyle: "none", margin: 0, paddingTop: 8, paddingBottom: 20, display: "flex", flexDirection: "column", gap: 4 }}>
            {LINKS.map((l) => (
              <li key={l.href}>
                <a href={l.href} onClick={() => setOpen(false)} style={{ display: "block", padding: "12px 0", fontSize: 22, textDecoration: "none" }}>
                  {l.label}
                </a>
              </li>
            ))}
            <li style={{ paddingTop: 12 }}>
              <a className="btn btn-p" href={APP_PATH}>
                Try SightLine
              </a>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
