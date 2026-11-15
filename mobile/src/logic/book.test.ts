import { describe, expect, it } from "vitest";
import { bookQuestion, initialBook, parseBookPage, reduceBook, type BookPage, type BookState } from "./book";
import { trimConversation, conversationFrom } from "./conversation";
import { provenanceLabel } from "./provenance";

const page = (sig: string, sentences: string[], extra: Partial<BookPage> = {}): BookPage => ({
  text: sentences.join(" "),
  sentences,
  signature: sig,
  complete: true,
  ...extra,
});
const P1 = page("p1", ["It was a dark night.", "The wind howled.", "Then a knock."]);
const P2 = page("p2", ["Morning came.", "All was calm."]);

function reading(): BookState {
  let s = reduceBook(initialBook, { type: "start" }).state;
  return reduceBook(s, { type: "page", page: P1 }).state;
}

describe("reading session", () => {
  it("start stops speech and captures; a page starts reading at sentence 0", () => {
    const a = reduceBook(initialBook, { type: "start" });
    expect(a.state.status).toBe("capturing");
    expect(a.effects).toEqual([{ type: "stopSpeech" }, { type: "capture" }]);
    const b = reduceBook(a.state, { type: "page", page: P1 });
    expect(b.state).toMatchObject({ status: "reading", pageIndex: 0, sentence: 0 });
    expect(b.effects).toEqual([{ type: "speakFrom", pageIndex: 0, sentence: 0 }]);
  });

  it("tracks the sentence being spoken", () => {
    let s = reading();
    s = reduceBook(s, { type: "speaking", owner: "book-0-1" }).state;
    expect(s.sentence).toBe(1);
  });

  it("pause stops speech; resume continues from the exact sentence", () => {
    let s = reduceBook(reading(), { type: "speaking", owner: "book-0-2" }).state;
    const p = reduceBook(s, { type: "pause" });
    expect(p.state.status).toBe("paused");
    expect(p.effects).toEqual([{ type: "stopSpeech" }]);
    // the stop reports "nothing speaking": that must not count as the page finishing
    s = reduceBook(p.state, { type: "speaking", owner: null }).state;
    expect(s.status).toBe("paused");
    const r = reduceBook(s, { type: "resume" });
    expect(r.state.status).toBe("reading");
    expect(r.effects).toEqual([{ type: "speakFrom", pageIndex: 0, sentence: 2 }]);
  });

  it("back goes one sentence back, and from the first sentence to the previous page's last", () => {
    let s = reduceBook(reading(), { type: "speaking", owner: "book-0-2" }).state;
    let r = reduceBook(s, { type: "back" });
    expect(r.effects).toEqual([{ type: "stopSpeech" }, { type: "speakFrom", pageIndex: 0, sentence: 1 }]);
    // finish page 1, read page 2, then back from its first sentence
    s = reduceBook(s, { type: "speaking", owner: null }).state; // page done → waiting
    s = reduceBook(s, { type: "turnDetected" }).state;
    s = reduceBook(s, { type: "page", page: P2 }).state;
    r = reduceBook(s, { type: "back" });
    expect(r.state).toMatchObject({ pageIndex: 0, sentence: 2 });
  });

  it("page complete → 'Turn the page' once, then waiting", () => {
    let s = reduceBook(reading(), { type: "speaking", owner: "book-0-2" }).state;
    const r = reduceBook(s, { type: "speaking", owner: null });
    expect(r.state.status).toBe("waitingTurn");
    expect(r.effects).toEqual([{ type: "haptic" }, { type: "speak", text: "Turn the page." }]);
    // the prompt itself finishing doesn't repeat it
    expect(reduceBook(r.state, { type: "speaking", owner: null }).effects).toEqual([]);
  });

  it("a page turn while waiting captures; the same signature is ignored, a new one is read", () => {
    let s = reduceBook(reduceBook(reading(), { type: "speaking", owner: "book-0-2" }).state, { type: "speaking", owner: null }).state;
    let r = reduceBook(s, { type: "turnDetected" });
    expect(r.state.status).toBe("capturing");
    expect(r.effects).toEqual([{ type: "capture" }]);
    r = reduceBook(r.state, { type: "page", page: page("p1", ["It was a dark night."]) });
    expect(r.state.status).toBe("waitingTurn");
    expect(r.effects).toEqual([]);
    r = reduceBook(reduceBook(r.state, { type: "turnDetected" }).state, { type: "page", page: P2 });
    expect(r.state).toMatchObject({ status: "reading", pageIndex: 1, sentence: 0 });
    expect(r.state.pages).toHaveLength(2);
  });

  it("turns are ignored unless waiting for one", () => {
    expect(reduceBook(reading(), { type: "turnDetected" }).effects).toEqual([]);
  });

  it("Next page captures right away from anywhere in a session", () => {
    const r = reduceBook(reading(), { type: "nextPage" });
    expect(r.state.status).toBe("capturing");
    expect(r.effects).toEqual([{ type: "stopSpeech" }, { type: "capture" }]);
  });

  it("a cut-off page is spoken and offers a retake instead of reading", () => {
    const s = reduceBook(initialBook, { type: "start" }).state;
    const r = reduceBook(s, { type: "page", page: page("x", ["Half"], { complete: false, cutOff: "The bottom of the page is cut off. Move the phone back a little." }) });
    expect(r.state.status).toBe("cutOff");
    expect(r.effects).toEqual([{ type: "speak", text: "The bottom of the page is cut off. Move the phone back a little." }]);
    expect(reduceBook(r.state, { type: "retake" }).effects).toEqual([{ type: "stopSpeech" }, { type: "capture" }]);
  });

  it("asking pauses; Resume reading continues from the same sentence", () => {
    let s = reduceBook(reading(), { type: "speaking", owner: "book-0-1" }).state;
    let r = reduceBook(s, { type: "ask" });
    expect(r.state.status).toBe("asking");
    expect(r.effects).toEqual([{ type: "stopSpeech" }]);
    r = reduceBook(r.state, { type: "answered" });
    expect(r.state.status).toBe("paused");
    expect(reduceBook(r.state, { type: "resume" }).effects).toEqual([{ type: "speakFrom", pageIndex: 0, sentence: 1 }]);
  });

  it("End stops speech and clears the session", () => {
    const r = reduceBook(reading(), { type: "end" });
    expect(r.state).toEqual(initialBook);
    expect(r.effects).toEqual([{ type: "stopSpeech" }]);
  });
});

describe("conversation memory", () => {
  it("keeps the last 6 turns", () => {
    const turns = Array.from({ length: 9 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const t = trimConversation(turns);
    expect(t).toHaveLength(6);
    expect(t[0].question).toBe("q3");
    expect(t[5].question).toBe("q8");
  });
  it("builds turns from answered follow-ups only", () => {
    const c = conversationFrom([
      { id: 1, question: "How much is the salmon?", answer: { spokenText: "24 dollars.", details: "" } },
      { id: 2, question: "Pending?" },
      { id: 3, question: "Bad?", answer: { spokenText: "Sorry.", details: "", error: true } },
    ]);
    expect(c).toEqual([{ question: "How much is the salmon?", answer: "24 dollars." }]);
  });
});

describe("provenance", () => {
  it("maps section provenance to a caption", () => {
    expect(provenanceLabel("label")).toBe("On the package");
    expect(provenanceLabel("web")).toBe("Online");
    expect(provenanceLabel(undefined)).toBeNull();
    expect(provenanceLabel("other")).toBeNull();
  });
});

describe("parseBookPage", () => {
  it("reads the server's page", () => {
    expect(parseBookPage({ text: "A. B.", sentences: ["A.", " B. "], pageNumber: 12, signature: "s1", complete: true })).toEqual({
      text: "A. B.",
      sentences: ["A.", "B."],
      pageNumber: 12,
      signature: "s1",
      complete: true,
    });
  });
  it("keeps cutOff and falls back to splitting text into sentences", () => {
    expect(parseBookPage({ text: "One. Two!", signature: "s", complete: false, cutOff: "Cut off." })).toMatchObject({
      sentences: ["One.", "Two!"],
      cutOff: "Cut off.",
    });
  });
  it("returns null without a page or signature", () => {
    expect(parseBookPage(undefined)).toBeNull();
    expect(parseBookPage({ text: "x" })).toBeNull();
  });
});

// D8: "Ask about this page" asks in book mode (the server then uses the page's exact text) and
// sends the earlier questions about the page, so "she" and "that" in a second question resolve.
describe("bookQuestion", () => {
  it("sends book:true, Read mode and the question", () => {
    expect(bookQuestion("IMG", "Where was the key hidden?", [])).toEqual({
      image: "IMG",
      mode: "read",
      book: true,
      question: "Where was the key hidden?",
    });
  });

  it("sends the earlier turns about this page, the last 6 at most", () => {
    const turns = Array.from({ length: 8 }, (_, i) => ({ question: `q${i}`, answer: `a${i}` }));
    const req = bookQuestion("IMG", "Why did she hide it there?", turns);
    expect(req.book).toBe(true);
    expect(req.conversation).toEqual(turns.slice(-6));
  });
});
