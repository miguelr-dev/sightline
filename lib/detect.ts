import { MODES, type FrameCheckResponse, type Mode } from "./modes";

/** A /api/frame-check reply as received: every field optional, the mode not yet validated. */
export type FrameCheck = Omit<Partial<FrameCheckResponse>, "suggestedMode"> & { suggestedMode?: string };

// Detect for the web app (/app): a copy of the iPhone app's pure decisions in
// mobile/src/logic/autoCapture.ts, so both apps offer the same card at the same moments.
// Keep the two in sync. Tested in tests/detect.test.ts. Detect never reads by itself: it only
// offers a tappable card for what's in view, plus the occasional hint.

export type Detection = { key: string; label: string; mode: Mode | null; confidence: number | null };

// ---- fuzzy keys (same as lib/hat.ts on the server) ----------------------------------------------
// Frame-check names the same item differently from frame to frame ("kirkland-tropical-energy-drink",
// "energy-drink-can"). Keys are compared by their distinctive words; sharing one means same item.
const SKIP_WORDS = new Set(["menu", "package", "label", "sign", "page", "slide", "scene", "box"]);
const FILLER = new Set(["the", "and", "for", "with"]);

export function matchKey(key: string): string {
  const words = [...new Set(key.toLowerCase().split("-"))].filter((w) => w.length >= 3 && !FILLER.has(w));
  const named = words.filter((w) => !SKIP_WORDS.has(w));
  return (named.length ? named : words.length ? words : [key.toLowerCase()]).sort().join("-");
}

export function sameItem(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const B = new Set(matchKey(b).split("-"));
  return matchKey(a)
    .split("-")
    .some((w) => B.has(w));
}

export type AutoState = {
  shown: Detection | null; // what the card shows
  candidate: string | null; // a different item seen once while the card shows something else
  dismissed: { key: string; until: number } | null; // × on the card: hide this item briefly
  hint: { text: string; since: number } | null;
  lastHintAt: number;
};

export const initialAutoState: AutoState = {
  shown: null,
  candidate: null,
  dismissed: null,
  hint: null,
  lastHintAt: -Infinity,
};

const DISMISS_MS = 5000;
const HINT_REPEAT_MS = 3000;
const HINT_GAP_MS = 5000;

export type FrameOutcome = {
  state: AutoState;
  card: Detection | null; // null = nothing to show for this frame (the card may fade)
  appeared: boolean; // the card is new or a different item: haptic + VoiceOver announcement
  speakHint?: string;
};

function toDetection(fc: FrameCheck): Detection | null {
  if (!fc.detected || !fc.key) return null;
  const mode = MODES.includes(fc.suggestedMode as Mode) ? (fc.suggestedMode as Mode) : null;
  return {
    key: fc.key,
    label: fc.label?.trim() || "Something to read",
    mode,
    confidence: typeof fc.confidence === "number" ? fc.confidence : null,
  };
}

export function reduceFrame(state: AutoState, fc: FrameCheck, at: number): FrameOutcome {
  const s: AutoState = { ...state };
  if (s.dismissed && at >= s.dismissed.until) s.dismissed = null;

  const d = toDetection(fc);
  let card: Detection | null = null;
  let appeared = false;

  if (d && !(s.dismissed && sameItem(d.key, s.dismissed.key))) {
    if (!s.shown) {
      s.shown = d; // first sighting: show at once
      appeared = true;
      s.candidate = null;
    } else if (sameItem(s.shown.key, d.key)) {
      s.candidate = null; // same item, maybe reworded: keep the card (and its label) steady
    } else if (s.candidate && sameItem(s.candidate, d.key)) {
      s.shown = d; // a different item seen twice in a row: switch
      appeared = true;
      s.candidate = null;
    } else {
      s.candidate = d.key; // one frame of something else: keep the card steady
    }
    card = s.shown;
  } else {
    s.shown = null;
    s.candidate = null;
  }

  // Hints: only when nothing is detected, the same hint repeats for 3 s, at most every 5 s.
  let speakHint: string | undefined;
  if (fc.detected || !fc.hint) s.hint = null;
  else if (s.hint?.text !== fc.hint) s.hint = { text: fc.hint, since: at };
  else if (at - s.hint.since >= HINT_REPEAT_MS && at - s.lastHintAt >= HINT_GAP_MS) {
    s.lastHintAt = at;
    speakHint = fc.hint;
  }

  return { state: s, card, appeared, ...(speakHint ? { speakHint } : {}) };
}

/** A result sheet closed: start fresh so anything in view (even the same item) is offered again. */
export function resumeAfterSheet(state: AutoState): AutoState {
  return { ...state, shown: null, candidate: null, dismissed: null };
}

/** The × on the card: hide this item (and rewordings of it) for a few seconds. */
export function dismissCard(state: AutoState, key: string, at: number): AutoState {
  return { ...state, shown: null, candidate: null, dismissed: { key, until: at + DISMISS_MS } };
}

/** Sent with the next frame-check so the server keeps the same key for the same item. */
export function lastSeen(state: AutoState): { lastKey?: string; lastLabel?: string } {
  return state.shown ? { lastKey: state.shown.key, lastLabel: state.shown.label } : {};
}
