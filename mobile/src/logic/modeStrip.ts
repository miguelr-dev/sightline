import { MODE_LABELS, type Mode } from "../modes";

// The camera's mode strip (tested in modeStrip.test.ts): AUTO first and default. In AUTO the
// server picks the mode; older servers that reject "auto" get a fallback.

export type StripMode = "auto" | Mode;
export const STRIP_MODES: StripMode[] = ["auto", "read", "describe", "menu", "translate"];
export const DEFAULT_STRIP_MODE: StripMode = "auto";

export const STRIP_LABELS: Record<StripMode, string> = { auto: "Auto", ...MODE_LABELS };

/** The mode sent to /api/analyze. */
export function analyzeModeFor(
  strip: StripMode,
  o: { autoSupported: boolean; suggested?: Mode | null },
): StripMode {
  if (strip !== "auto") return strip;
  if (o.autoSupported) return "auto";
  return o.suggested ?? "describe";
}

/** An older server answers mode "auto" with a 400: retry with the fallback mode. */
export function autoRetry(r: { sent: StripMode; status: number; error: boolean }): boolean {
  return r.sent === "auto" && r.error && r.status === 400;
}

export function headerLabel(strip: StripMode, interpreted: { mode: Mode } | undefined, language?: string): string {
  if (strip === "auto") return interpreted ? `Auto · ${MODE_LABELS[interpreted.mode]}` : "Auto";
  if (strip === "translate" && language) return `Translate to ${language}`;
  return MODE_LABELS[strip];
}

/** Subtitle mode name on the detection card ("Tap to read · Menu / Label"), if any. */
export function cardSubtitle(_strip: StripMode, suggested: Mode | null): string | null {
  return suggested ? MODE_LABELS[suggested] : null;
}

/** /api/frame-check needs a concrete mode. */
export function frameCheckMode(strip: StripMode): Mode {
  return strip === "auto" ? "read" : strip;
}
