"use client";

import { useSyncExternalStore } from "react";
import { encodeQr } from "./qr";

// The QR code points at /app on whatever host serves this page, so it is right on
// localhost, on a Vercel preview and on the production domain without any setup.
const noop = () => () => {};
const originSnapshot = () => window.location.origin;

export function QrCode({ path = "/app", size = 176 }: { path?: string; size?: number }) {
  const origin = useSyncExternalStore(noop, originSnapshot, () => "");
  if (!origin) return <div className="lp-qr lp-qr-empty" style={{ width: size, height: size }} aria-hidden="true" />;

  const url = `${origin}${path}`;
  const modules = encodeQr(url);
  const n = modules.length;
  const quiet = 3;
  const total = n + quiet * 2;
  let d = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  const pretty = url.replace(/^https?:\/\//, "");
  return (
    <figure className="lp-qr-figure">
      <svg
        className="lp-qr"
        width={size}
        height={size}
        viewBox={`0 0 ${total} ${total}`}
        role="img"
        aria-label={`QR code. Scan it with your phone's camera to open ${pretty}`}
        shapeRendering="crispEdges"
      >
        <rect width={total} height={total} fill="#fff" />
        <path d={d} fill="#000" />
      </svg>
      <figcaption className="lp-qr-caption">{pretty}</figcaption>
    </figure>
  );
}
