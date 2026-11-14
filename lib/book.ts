import { createHash } from "node:crypto";

// Server-only: book mode. The model transcribes a printed page word for word; this file turns
// that into sentences (for reading aloud one at a time), a page signature (so the app can tell
// the same page from the next one), and the short spoken start of the page.
// Kept free of other app imports so scripts can load it directly.

export type BookPage = {
  text: string; // the exact full text, paragraphs separated by "\n\n"
  sentences: string[];
  pageNumber?: string;
  signature: string; // 16 hex chars from the first and last ~10 words
  complete: boolean;
  cutOff?: string; // what's missing and how to fix it, when the page isn't all readable
};

export type BookReply = { pageText: string; pageNumber: string; complete: boolean; cutOff: string };

export const BOOK_SCHEMA = {
  type: "object",
  properties: {
    pageText: { type: "string" },
    pageNumber: { type: "string" },
    complete: { type: "boolean" },
    cutOff: { type: "string" },
  },
  required: ["pageText", "pageNumber", "complete", "cutOff"],
  additionalProperties: false,
} as const;

export function bookSystemPrompt(language: string): string {
  return `You are SightLine, reading a printed page aloud for a blind or low-vision reader. Transcribe the page exactly.
- pageText: EVERY word of the page's text, exactly as printed, in reading order. Never summarize, shorten, paraphrase, translate, correct or modernize anything; copy spelling exactly as printed, even if it looks wrong. Keep paragraphs, separated by one blank line (two newlines). Inside a paragraph, join the printed lines with single spaces, and rejoin words hyphenated across a line break. Leave out running heads (the book or chapter title repeated at the top of the page), page numbers and footers. Keep chapter titles, headings, footnotes and captions. For a two-page spread, read the left page completely, then the right page. Write "(unclear)" for a word you can't read. If there is no text, pageText is empty.
- pageNumber: the printed page number, such as "12", or "12-13" for a spread. Empty if none is visible.
- complete: false if any of the body text is cut off at an edge, blurred, covered by a finger, or too dark to read; true otherwise.
- cutOff: if not complete, one short spoken tip in ${language} saying what's missing and how to fix it, such as "The bottom lines are cut off. Move the phone back a little." Otherwise empty.`;
}

// ---------- Sentences ----------

// Abbreviations that are usually followed by a capitalized name, not a new sentence.
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "sr", "jr", "mt", "gen", "col", "capt", "lt", "sgt",
  "rev", "hon", "gov", "sen", "rep", "no", "vol", "fig", "ch", "pp", "vs",
]);

/** Split text into sentences, keeping abbreviations, initials, decimals and quotes together. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const p = para.replace(/\s+/g, " ").trim();
    if (!p) continue;
    let start = 0;
    const boundary = /([.!?…]+)(["'”’)\]]*)\s+/g;
    let m: RegExpExecArray | null;
    while ((m = boundary.exec(p))) {
      const end = m.index + m[1].length + m[2].length;
      const next = p[boundary.lastIndex] ?? "";
      // A lowercase word next means the sentence goes on ("p.m. on", '"Stop!" she said').
      if (/\p{Ll}/u.test(next)) continue;
      if (m[1] === ".") {
        const word = /([\p{L}.]+)$/u.exec(p.slice(start, m.index))?.[1] ?? "";
        const bare = word.replace(/\./g, "").toLowerCase();
        // Initials ("J. R. R. Tolkien") and titles ("Dr. Smith") don't end a sentence.
        if (/^\p{Lu}$/u.test(word) || ABBREVIATIONS.has(bare)) continue;
      }
      out.push(p.slice(start, end).trim());
      start = boundary.lastIndex;
    }
    const rest = p.slice(start).trim();
    if (rest) out.push(rest);
  }
  return out;
}

// ---------- Signature ----------

/** The same page gives the same signature even with case, punctuation or a mid-page OCR slip. */
export function pageSignature(text: string): string {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  const ends = [...words.slice(0, 10), "|", ...words.slice(-10)].join(" ");
  return createHash("sha256").update(ends).digest("hex").slice(0, 16);
}

// ---------- Page ----------

const SPOKEN_MAX_WORDS = 40;
const DEFAULT_CUT_OFF = "Part of the page is cut off. Move the phone back a little.";

/** Build the page and its short spoken start from the model's transcription. */
export function buildPage(r: BookReply): { page: BookPage; spokenText: string } {
  const text = r.pageText
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const sentences = splitSentences(text);
  const complete = r.complete !== false;
  const cutOff = complete ? "" : r.cutOff.trim() || DEFAULT_CUT_OFF;
  const pageNumber = r.pageNumber.trim();

  let spokenText = cutOff;
  if (!spokenText) {
    const [first = "", second] = sentences;
    const both = second ? `${first} ${second}` : first;
    spokenText = both.split(/\s+/).length <= SPOKEN_MAX_WORDS ? both : first;
  }
  return {
    page: {
      text,
      sentences,
      ...(pageNumber ? { pageNumber } : {}),
      signature: pageSignature(text),
      complete,
      ...(cutOff ? { cutOff } : {}),
    },
    spokenText,
  };
}
