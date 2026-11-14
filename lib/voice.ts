// Speech recognition (where the browser supports it) and voice command parsing.

import { findLanguage, LANGUAGES, type Mode } from "./modes";

type RecognitionResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function recognitionSupported(): boolean {
  return getCtor() !== null;
}

export type Listener = { stop: () => void };

/** Listen for one phrase. Resolves via callbacks; returns a handle to cancel. */
export function listenOnce(opts: {
  lang?: string;
  onResult: (text: string) => void;
  onError: (reason: string) => void;
  onEnd?: () => void;
}): Listener | null {
  const Ctor = getCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = opts.lang ?? "en-US";
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;
  let gotResult = false;
  rec.onresult = (e) => {
    const text = e.results[0]?.[0]?.transcript?.trim() ?? "";
    if (text) {
      gotResult = true;
      opts.onResult(text);
    }
  };
  rec.onerror = (e) => {
    gotResult = true; // don't also report "no speech"
    opts.onError(e.error);
  };
  rec.onend = () => {
    if (!gotResult) opts.onError("no-speech");
    opts.onEnd?.();
  };
  try {
    rec.start();
  } catch {
    opts.onError("start-failed");
    return null;
  }
  return { stop: () => rec.abort() };
}

export type Command =
  | { type: "stop" }
  | { type: "repeat" }
  | { type: "capture"; mode: Mode; language?: string }
  | { type: "question"; text: string }
  | { type: "lookup" }
  | { type: "help" };

const LANGUAGE_NAMES = LANGUAGES.map((l) => l.name.toLowerCase()).join("|");

export function parseCommand(raw: string): Command {
  const t = raw.toLowerCase().replace(/[.,!?]/g, "").trim();

  if (/^(stop|quiet|be quiet|silence|shut up|pause)\b/.test(t)) return { type: "stop" };
  if (/\b(repeat|say (that|it) again|again|replay)\b/.test(t)) return { type: "repeat" };
  if (/^(help|what can i say|commands)\b/.test(t)) return { type: "help" };
  if (
    /\b(look (it|this|that) up|look up|search (the )?(web|internet|online)|search (for )?(it|this|that)|check (the )?(web|internet|online)|google (it|this|that)|(any|check for) recalls?|(is|was) (it|this|that) recalled|web lookup)\b/.test(t)
  ) {
    return { type: "lookup" };
  }

  const tr = t.match(new RegExp(`translate(?: (?:this|it|that))?(?: (?:in)?to (${LANGUAGE_NAMES}))?`));
  if (tr) {
    const lang = findLanguage(tr[1]);
    return { type: "capture", mode: "translate", language: lang?.name };
  }
  if (/\b(menu|label|medicine|medication|pill|product|ingredients|allergens?|nutrition)\b/.test(t)) {
    return { type: "capture", mode: "menu" };
  }
  if (/^(describe|what do you see|what's (in front|around|here)|what is (in front|around|here)|look around|where am i)/.test(t)) {
    return { type: "capture", mode: "describe" };
  }
  if (/^(read|what does (this|it) say)/.test(t)) return { type: "capture", mode: "read" };

  // Anything else is treated as a question about the last photo.
  return { type: "question", text: raw.trim() };
}
