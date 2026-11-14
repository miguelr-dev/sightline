import type { AnalyzeResponse, Mode } from "../modes";
import type { StripMode } from "./modeStrip";

// "Ask while looking" (tested in askWhileLooking.test.ts): hold the mic on the camera screen, say
// "what does this sign say", and the app answers about a fresh frame. Pure pieces only.

export type Interpreted = { mode: Mode; question?: string; language?: string };

export type LookingRequest = {
  conversation?: { question: string; answer: string }[];
  image: string;
  mode: StripMode;
  language?: string;
  utterance?: string;
  question?: string;
};

const MAX_UTTERANCE = 300;

/** The /api/analyze body. Older servers get the transcript as a plain follow-up `question`. */
export function buildLookingRequest(o: {
  image: string;
  mode: StripMode;
  language: string;
  utterance: string;
  supportsUtterance: boolean;
}): LookingRequest {
  const said = o.utterance.replace(/\s+/g, " ").trim().slice(0, MAX_UTTERANCE);
  return {
    image: o.image,
    mode: o.mode,
    ...(o.mode === "translate" && o.language ? { language: o.language } : {}),
    ...(o.supportsUtterance ? { utterance: said } : { question: said }),
  };
}

/** A server that understood `utterance` says how it interpreted it; one that didn't, doesn't. */
export function fallbackFor(r: AnalyzeResponse & { interpreted?: unknown }): "ok" | "retry-as-question" {
  if (r.error) return "ok";
  return r.interpreted ? "ok" : "retry-as-question";
}

// Requests that are really just "read it" rather than a specific question.
const PLAIN_READ = /^(what does (this|that|it)( \w+)? (say|read)|what('s| is) (this|that|it)|read (this|it))\b/i;

/** Short status text (shown, never spoken) for what the server took the request to mean. */
export function statusLine(i: Interpreted | undefined): string {
  if (!i) return "Looking…";
  if (i.mode === "translate") return i.language ? `Translating to ${i.language}…` : "Translating…";
  if (i.question && !PLAIN_READ.test(i.question.trim())) return "Checking…";
  switch (i.mode) {
    case "read":
      return "Reading…";
    case "menu":
      return "Reading the label…";
    default:
      return "Looking…";
  }
}

// ---- captions -----------------------------------------------------------------------------------

export type CaptionState = {
  phase: "idle" | "listening" | "transcribing" | "asking" | "answered" | "error";
  text: string; // the user's words
  status: string; // short status or error line
};

export const initialCaption: CaptionState = { phase: "idle", text: "", status: "" };

export type CaptionEvent =
  | { type: "press" }
  | { type: "release" }
  | { type: "transcribed"; text: string }
  | { type: "interpreted"; interpreted?: Interpreted }
  | { type: "answered" }
  | { type: "failed"; message: string }
  | { type: "faded" };

export type CaptionEffect = { type: "stopSpeech" } | { type: "announce"; text: string };

export function reduceCaption(s: CaptionState, e: CaptionEvent): { state: CaptionState; effects: CaptionEffect[] } {
  const same = { state: s, effects: [] as CaptionEffect[] };
  switch (e.type) {
    case "press":
      // The mic always cuts off whatever is being said first.
      return { state: { phase: "listening", text: "", status: "Listening…" }, effects: [{ type: "stopSpeech" }] };
    case "release":
      return s.phase === "listening" ? { state: { ...s, phase: "transcribing", status: "" }, effects: [] } : same;
    case "transcribed": {
      if (s.phase !== "transcribing") return same;
      const text = e.text.replace(/\s+/g, " ").trim();
      if (!text) return { state: { phase: "error", text: "", status: "I didn't catch that." }, effects: [{ type: "announce", text: "I didn't catch that." }] };
      return { state: { phase: "asking", text, status: "Looking…" }, effects: [{ type: "announce", text: `You asked: ${text}` }] };
    }
    case "interpreted":
      return s.phase === "asking" ? { state: { ...s, status: statusLine(e.interpreted) }, effects: [] } : same;
    case "answered":
      return s.phase === "asking" ? { state: { ...s, phase: "answered" }, effects: [{ type: "announce", text: "Answer ready." }] } : same;
    case "failed":
      return s.phase === "idle" ? same : { state: { ...s, phase: "error", status: e.message }, effects: [{ type: "announce", text: e.message }] };
    case "faded":
      return s.phase === "answered" || s.phase === "error" ? { state: initialCaption, effects: [] } : same;
  }
}

// ---- silence detection --------------------------------------------------------------------------

const SPEECH_DB = -38; // louder than this counts as speaking
const QUIET_DB = -45; // quieter than this counts as silence
const QUIET_MS = 1200; // stop after this long quiet, once something was said
const NO_SPEECH_MS = 6000; // give up if nothing is said at all

export type SilenceState = { startedAt: number | null; heard: boolean; quietSince: number | null };
export const initialSilence: SilenceState = { startedAt: null, heard: false, quietSince: null };

/** Feed recorder metering (dBFS) samples; says when a tap-to-talk recording should stop. */
export function trackSilence(s: SilenceState, db: number | undefined, at: number): { state: SilenceState; stop: boolean } {
  if (typeof db !== "number" || !Number.isFinite(db)) return { state: s, stop: false };
  const startedAt = s.startedAt ?? at;
  if (db > SPEECH_DB) return { state: { startedAt, heard: true, quietSince: null }, stop: false };
  if (!s.heard) return { state: { ...s, startedAt }, stop: at - startedAt >= NO_SPEECH_MS };
  if (db >= QUIET_DB) return { state: { ...s, startedAt }, stop: false };
  const quietSince = s.quietSince ?? at;
  return { state: { startedAt, heard: true, quietSince }, stop: at - quietSince >= QUIET_MS };
}
