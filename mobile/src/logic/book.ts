// Book mode (tested in book.test.ts): read a page sentence by sentence, wait for a page turn,
// skip a re-captured same page, read the new one. The UI runs the effects.

export type BookPage = {
  text: string;
  sentences: string[];
  pageNumber?: number;
  signature: string;
  complete: boolean;
  cutOff?: string;
};

export type BookState = {
  status: "idle" | "capturing" | "reading" | "paused" | "waitingTurn" | "asking" | "cutOff";
  pages: BookPage[];
  pageIndex: number;
  sentence: number;
  prompted: boolean; // "Turn the page" already said for this wait
};

export const initialBook: BookState = { status: "idle", pages: [], pageIndex: 0, sentence: 0, prompted: false };

export type BookEvent =
  | { type: "start" }
  | { type: "page"; page: BookPage }
  | { type: "speaking"; owner: string | null }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "back" }
  | { type: "nextPage" }
  | { type: "turnDetected" }
  | { type: "retake" }
  | { type: "ask" }
  | { type: "answered" }
  | { type: "end" };

export type BookEffect =
  | { type: "stopSpeech" }
  | { type: "capture" }
  | { type: "speakFrom"; pageIndex: number; sentence: number }
  | { type: "speak"; text: string }
  | { type: "haptic" };

export const TURN_PROMPT = "Turn the page.";

/** Speech owner for a sentence, so the reading view can highlight it. */
export const sentenceOwner = (page: number, sentence: number) => `book-${page}-${sentence}`;

function parseOwner(owner: string): { page: number; sentence: number } | null {
  const m = /^book-(\d+)-(\d+)$/.exec(owner);
  return m ? { page: Number(m[1]), sentence: Number(m[2]) } : null;
}

export function reduceBook(s: BookState, e: BookEvent): { state: BookState; effects: BookEffect[] } {
  const none = { state: s, effects: [] as BookEffect[] };
  switch (e.type) {
    case "start":
      return { state: { ...initialBook, status: "capturing" }, effects: [{ type: "stopSpeech" }, { type: "capture" }] };
    case "page": {
      if (s.status !== "capturing") return none;
      if (e.page.cutOff || !e.page.sentences.length) {
        return {
          state: { ...s, status: "cutOff" },
          effects: [{ type: "speak", text: e.page.cutOff ?? "I couldn't read that page. Please try again." }],
        };
      }
      const current = s.pages[s.pageIndex];
      // Re-captured the page that was just read: keep waiting for a real turn.
      if (current && current.signature === e.page.signature && s.pages.length > 0) {
        return { state: { ...s, status: "waitingTurn" }, effects: [] };
      }
      const pages = [...s.pages, e.page];
      return {
        state: { ...s, pages, pageIndex: pages.length - 1, sentence: 0, status: "reading", prompted: false },
        effects: [{ type: "speakFrom", pageIndex: pages.length - 1, sentence: 0 }],
      };
    }
    case "speaking": {
      if (s.status !== "reading") return none;
      if (e.owner) {
        const o = parseOwner(e.owner);
        return o ? { state: { ...s, pageIndex: o.page, sentence: o.sentence }, effects: [] } : none;
      }
      const page = s.pages[s.pageIndex];
      if (page && s.sentence >= page.sentences.length - 1 && !s.prompted) {
        return {
          state: { ...s, status: "waitingTurn", prompted: true },
          effects: [{ type: "haptic" }, { type: "speak", text: TURN_PROMPT }],
        };
      }
      return none;
    }
    case "pause":
      return s.status === "reading" ? { state: { ...s, status: "paused" }, effects: [{ type: "stopSpeech" }] } : none;
    case "resume":
      if (s.status !== "paused") return none;
      return { state: { ...s, status: "reading" }, effects: [{ type: "speakFrom", pageIndex: s.pageIndex, sentence: s.sentence }] };
    case "back": {
      if (!s.pages.length) return none;
      let pageIndex = s.pageIndex;
      let sentence = s.sentence - 1;
      if (sentence < 0) {
        if (pageIndex === 0) sentence = 0;
        else {
          pageIndex -= 1;
          sentence = s.pages[pageIndex].sentences.length - 1;
        }
      }
      return {
        state: { ...s, pageIndex, sentence, status: "reading", prompted: false },
        effects: [{ type: "stopSpeech" }, { type: "speakFrom", pageIndex, sentence }],
      };
    }
    case "nextPage":
    case "retake":
      if (s.status === "idle") return none;
      return { state: { ...s, status: "capturing" }, effects: [{ type: "stopSpeech" }, { type: "capture" }] };
    case "turnDetected":
      return s.status === "waitingTurn" ? { state: { ...s, status: "capturing" }, effects: [{ type: "capture" }] } : none;
    case "ask":
      return s.status === "idle" ? none : { state: { ...s, status: "asking" }, effects: [{ type: "stopSpeech" }] };
    case "answered":
      return s.status === "asking" ? { state: { ...s, status: "paused" }, effects: [] } : none;
    case "end":
      return { state: initialBook, effects: [{ type: "stopSpeech" }] };
  }
}

/** The `page` field of a book-mode /api/analyze reply, or null. */
export function parseBookPage(v: unknown): BookPage | null {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  if (typeof p.signature !== "string" || !p.signature) return null;
  const text = typeof p.text === "string" ? p.text.trim() : "";
  const given = Array.isArray(p.sentences) ? p.sentences.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
  const sentences = given.length ? given : (text.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? []).map((x) => x.trim()).filter(Boolean);
  return {
    text,
    sentences,
    ...(typeof p.pageNumber === "number" ? { pageNumber: p.pageNumber } : {}),
    signature: p.signature,
    complete: p.complete !== false,
    ...(typeof p.cutOff === "string" && p.cutOff.trim() ? { cutOff: p.cutOff.trim() } : {}),
  };
}
