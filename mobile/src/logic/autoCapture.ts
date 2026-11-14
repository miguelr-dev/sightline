import { MODES, type FrameCheck, type Mode } from "../modes";

// Pure decisions for auto mode (tested in autoCapture.test.ts). Auto never reads by itself: it
// only offers a tappable card for what's in view, plus the occasional spoken hint.

export type Detection = { key: string; label: string; mode: Mode | null; confidence: number | null };

export type AutoState = {
  shown: Detection | null; // what the card shows
  candidate: string | null; // a different key seen once while the card shows something else
  readKey: string | null; // tapped and read; hidden until the camera moves on
  readMisses: number;
  hint: { text: string; since: number } | null;
  lastHintAt: number;
};

export const initialAutoState: AutoState = {
  shown: null,
  candidate: null,
  readKey: null,
  readMisses: 0,
  hint: null,
  lastHintAt: -Infinity,
};

const SWITCH_FRAMES = 2; // a different item must be seen this many frames in a row
const READ_RESET_MISSES = 3; // frames without the read key before it can show again
const HINT_REPEAT_MS = 3000;
const HINT_GAP_MS = 5000;

export type FrameOutcome = {
  state: AutoState;
  card: Detection | null; // null = nothing detected in this frame (the card may fade)
  appeared: boolean; // the card is new or changed item: haptic + VoiceOver announcement
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
  let s: AutoState = { ...state };

  // The key that was just read stays hidden until it's been out of view for a few frames.
  if (s.readKey) {
    if (fc.detected && fc.key === s.readKey) s.readMisses = 0;
    else if (++s.readMisses >= READ_RESET_MISSES) {
      s.readKey = null;
      s.readMisses = 0;
    }
  }

  const d = toDetection(fc);
  let card: Detection | null = null;
  let appeared = false;

  if (d && d.key !== s.readKey) {
    if (!s.shown) {
      s.shown = d; // first sighting: show at once
      appeared = true;
      s.candidate = null;
    } else if (s.shown.key === d.key) {
      s.shown = d; // same item: refresh the label quietly
      s.candidate = null;
    } else if (s.candidate === d.key) {
      s.shown = d; // seen twice in a row: switch
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

/** The user tapped the card (or Capture) and read this item. */
export function markRead(state: AutoState, key: string): AutoState {
  return { ...state, readKey: key, readMisses: 0, shown: null, candidate: null };
}
