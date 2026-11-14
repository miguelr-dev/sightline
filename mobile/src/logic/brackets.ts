// Live-Text-style corner brackets on the viewfinder (tested in qa.test.ts).

export type Size = { w: number; h: number };
export type Rect = { x: number; y: number; w: number; h: number };

/** The preview is aspect-fill: the frame is scaled to cover the view and centred (overflow cropped). */
export function aspectFill(view: Size, frame: Size): { scale: number; dx: number; dy: number } {
  const scale = Math.max(view.w / frame.w, view.h / frame.h);
  return { scale, dx: (view.w - frame.w * scale) / 2, dy: (view.h - frame.h * scale) / 2 };
}

/** A box normalized 0–1 to the frame the server saw → view points, clamped to the view. */
export function normBoxToView(box: Rect, view: Size, frame: Size): Rect {
  const t = aspectFill(view, frame);
  let x = box.x * frame.w * t.scale + t.dx;
  let y = box.y * frame.h * t.scale + t.dy;
  let x2 = x + box.w * frame.w * t.scale;
  let y2 = y + box.h * frame.h * t.scale;
  x = Math.max(0, Math.min(view.w, x));
  y = Math.max(0, Math.min(view.h, y));
  x2 = Math.max(0, Math.min(view.w, x2));
  y2 = Math.max(0, Math.min(view.h, y2));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(x2 - x), h: Math.round(y2 - y) };
}

/** expo-camera on iOS reports barcode corners already in preview (view) points. */
export function cornersToRect(points: { x: number; y: number }[]): Rect | null {
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

const MAX_AGE = { detect: 2500, barcode: 700 }; // frame-check boxes are ~1.2 s old already

export function bracketVisible(o: { steady: boolean; hasTarget: boolean; ageMs: number; kind: "detect" | "barcode" }): boolean {
  return o.steady && o.hasTarget && o.ageMs < MAX_AGE[o.kind];
}
