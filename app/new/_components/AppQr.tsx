"use client";

import { useSyncExternalStore } from "react";

import { encodeQr } from "@/app/components/site/qr";

// A QR code to /app on whatever host serves this page (localhost, a preview or
// production), drawn locally so the page never calls a QR service.
const noop = () => () => {};
const originSnapshot = () => window.location.origin;

export function AppQr({ path = "/app", size = 168 }: { path?: string; size?: number }) {
  const origin = useSyncExternalStore(noop, originSnapshot, () => "");
  if (!origin) return <div className="qr-empty" style={{ width: size, height: size }} aria-hidden />;

  const url = `${origin}${path}`;
  const modules = encodeQr(url);
  const quiet = 2;
  const total = modules.length + quiet * 2;
  let d = "";
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + quiet} ${y + quiet}h1v1h-1z`;
    }),
  );
  const pretty = url.replace(/^https?:\/\//, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      role="img"
      aria-label={`QR code. Scan it with your phone’s camera to open ${pretty}`}
      shapeRendering="crispEdges"
      className="block"
    >
      <rect width={total} height={total} fill="#fff" />
      <path d={d} fill="#0a0a0a" />
    </svg>
  );
}
