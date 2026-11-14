// Decorative icons for the marketing site. Every control that uses one also has a text
// label, so they are hidden from assistive tech.

type P = { size?: number; className?: string };
const base = { "aria-hidden": true, focusable: false } as const;

export function LogoMark({ size = 34, onLight = false }: { size?: number; onLight?: boolean }) {
  const fg = onLight ? "#000" : "#fff";
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" {...base}>
      {!onLight && <rect x="1" y="1" width="30" height="30" rx="8" fill="#000" />}
      <ellipse cx="16" cy="16" rx="11" ry="6.8" fill="none" stroke={fg} strokeWidth="2.6" />
      <circle cx="16" cy="16" r="3.6" fill={fg} />
    </svg>
  );
}

export const ArrowRight = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const Play = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
  </svg>
);

export const Pause = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}>
    <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
    <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
  </svg>
);

export const Chevron = ({ size = 18, dir = "right" }: P & { dir?: "left" | "right" | "down" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d={dir === "left" ? "M15 6l-6 6 6 6" : dir === "down" ? "M6 9l6 6 6-6" : "M9 6l6 6-6 6"} />
  </svg>
);

export const Check = ({ size = 22, className }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} {...base}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export const Plus = ({ size = 14 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Speaker = ({ size = 18 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinejoin="round" {...base}>
    <path d="M4 9h3.5L13 4.5v15L7.5 15H4z" />
    <path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
  </svg>
);

export const Sparkle = ({ size = 11 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...base}>
    <path d="M12 2l1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9z" />
  </svg>
);

export const Gear = ({ size = 14, light = false }: P & { light?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={light ? "#fff" : "#000"} strokeWidth="2.2" {...base}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
);

export const Clock = ({ size = 14, light = false }: P & { light?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={light ? "#fff" : "#000"} strokeWidth="2.2" strokeLinecap="round" {...base}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
);

export const Viewfinder = ({ size = 16, dark = false }: P & { dark?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={dark ? "#000" : "#fff"} strokeWidth="2.2" strokeLinecap="round" {...base}>
    <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
  </svg>
);

export const Photo = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="2" {...base}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="M21 16l-5-5-9 9" />
  </svg>
);

export const Mic = ({ size = 16, light = false }: P & { light?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={light ? "#fff" : "#000"} strokeWidth="2" strokeLinecap="round" {...base}>
    <rect x="9" y="2.5" width="6" height="12" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
  </svg>
);

export const CameraFill = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" {...base}>
    <path d="M4.5 7h2.8l1.7-2.5h6l1.7 2.5h2.8A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V8.5A1.5 1.5 0 0 1 4.5 7z" />
    <circle cx="12" cy="13" r="3.4" fill="#000" />
  </svg>
);

export const SmallCheck = ({ size = 11 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export const ArrowUp = ({ size = 12 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" {...base}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const Wave = ({ small = false, bars = 5 }: { small?: boolean; bars?: number }) => (
  <span className={small ? "wave sm" : "wave"} aria-hidden="true">
    {Array.from({ length: bars }, (_, i) => (
      <i key={i} />
    ))}
  </span>
);

/** Mode icons, matching the web app's line icons. */
export function ModeIcon({ mode, size = 24 }: { mode: "read" | "describe" | "menu" | "translate"; size?: number }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.3, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...base };
  if (mode === "read") return <svg {...common}><path d="M4 5h16M4 10h16M4 15h16M4 20h9" /></svg>;
  if (mode === "describe") return <svg {...common}><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>;
  if (mode === "menu") return <svg {...common}><path d="M6 2.5h12v19l-3-2-3 2-3-2-3 2z" /><path d="M9 7.5h6M9 11.5h6" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5s1.3-6.8 3.9-9.5z" /></svg>;
}

/** Simple outline marks for social placeholders (not the brands' official logos). */
export function SocialIcon({ name }: { name: "x" | "instagram" | "tiktok" | "linkedin" | "youtube" | "github" }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, ...base };
  switch (name) {
    case "x": return <svg {...p}><path d="M5 4l14 16M19 4L5 20" /></svg>;
    case "instagram": return <svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="1" fill="currentColor" /></svg>;
    case "tiktok": return <svg {...p}><path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 3c.5 2.8 2.4 4.6 5 5" /></svg>;
    case "linkedin": return <svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="3" /><path d="M8 10.5V16M8 7.8v.2M11.5 16v-5.5M11.5 13c0-1.8 1-2.6 2.3-2.6s2.2.8 2.2 2.6V16" /></svg>;
    case "youtube": return <svg {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10.5 9.5v5l4-2.5z" fill="currentColor" /></svg>;
    default: return <svg {...p}><path d="M9 19c-4 1.3-4-2-5.5-2.5M14.5 21v-3.4a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6 2.6 5 2.9 5 2.9a4.3 4.3 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.8 5.6 5.5 6a3 3 0 0 0-.8 2.3V21" /></svg>;
  }
}
