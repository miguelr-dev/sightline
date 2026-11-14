import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/claude")>();
  return { ...actual, askJson: vi.fn() };
});
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    dbConfigured: () => true,
    getCachedAnalysis: vi.fn(async () => undefined),
    putCachedAnalysis: vi.fn(async () => {}),
    recentScanId: vi.fn(async () => undefined),
    insertScan: vi.fn(async () => {}),
  };
});

import { analyzePhoto } from "@/lib/analyze";
import { askJson, bookModel } from "@/lib/claude";
import * as db from "@/lib/db";
import { POST } from "@/app/api/analyze/route";

const IMAGE = "/9j/" + "A".repeat(200);
const PAGE = "The lighthouse stood alone. Its keeper had left in May.\n\nNobody came after that.";

function bookReply(extra: Record<string, unknown> = {}) {
  vi.mocked(askJson).mockResolvedValue({
    pageText: PAGE,
    pageNumber: "12",
    complete: true,
    cutOff: "",
    ...extra,
  });
}

describe("book mode in analyzePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.mocked(db.getCachedAnalysis).mockResolvedValue(undefined);
  });

  it("uses the book model, a large token budget and the page schema", async () => {
    bookReply();
    await analyzePhoto({ image: IMAGE, mode: "read", book: true, language: "English" });
    const call = vi.mocked(askJson).mock.calls[0][1];
    expect(call.model).toBe(bookModel());
    expect(call.maxTokens).toBeGreaterThanOrEqual(8000);
    const schema = call.schema as { properties: Record<string, unknown> };
    expect(Object.keys(schema.properties)).toEqual(
      expect.arrayContaining(["pageText", "pageNumber", "complete", "cutOff"]),
    );
    expect(call.system).toMatch(/every word/i);
    expect(call.system).toMatch(/running head/i);
    expect(call.system).toMatch(/left page.*then.*right page/i);
  });

  it("returns the page with sentences, signature and number, and speaks the start", async () => {
    bookReply();
    const { body } = await analyzePhoto({ image: IMAGE, mode: "read", book: true, language: "English" });
    expect(body.page).toMatchObject({ text: PAGE, pageNumber: "12", complete: true });
    expect(body.page?.sentences).toEqual([
      "The lighthouse stood alone.",
      "Its keeper had left in May.",
      "Nobody came after that.",
    ]);
    expect(body.page?.signature).toMatch(/^[0-9a-f]{16}$/);
    expect(body.spokenText).toBe("The lighthouse stood alone. Its keeper had left in May.");
    expect(body.itemKind).toBe("book");
    expect(body.sections?.[0]).toEqual({ title: "Page 12", body: PAGE, provenance: "label" });
  });

  it("speaks the cut-off hint when the page isn't all in view", async () => {
    bookReply({ complete: false, cutOff: "The bottom lines are cut off. Move the phone back a little." });
    const { body } = await analyzePhoto({ image: IMAGE, mode: "read", book: true, language: "English" });
    expect(body.spokenText).toBe("The bottom lines are cut off. Move the phone back a little.");
    expect(body.page?.complete).toBe(false);
  });

  it("records the page to history as a book with its page number", async () => {
    bookReply();
    await analyzePhoto({
      image: IMAGE,
      mode: "read",
      book: true,
      language: "English",
      device: "phone-1234-abcd",
    });
    expect(db.insertScan).toHaveBeenCalledWith(
      expect.objectContaining({ itemKind: "book", title: expect.stringMatching(/^Page 12: /) }),
    );
  });

  it("caches book pages separately from plain Read answers", async () => {
    bookReply();
    await analyzePhoto({ image: IMAGE, mode: "read", book: true, language: "English" });
    vi.mocked(askJson).mockResolvedValue({ spokenText: "x", sections: [], itemKind: "none", webQuery: "" });
    await analyzePhoto({ image: IMAGE, mode: "read", language: "English" });
    const keys = vi.mocked(db.getCachedAnalysis).mock.calls.map(([k]) => k);
    expect(keys[0]).not.toBe(keys[1]);
  });

  it("a follow-up about the page gets the page text as context", async () => {
    vi.mocked(db.getCachedAnalysis).mockImplementation(async () => undefined);
    // First call: the page itself is cached. Second lookup (the follow-up) finds it.
    vi.mocked(db.getCachedAnalysis)
      .mockResolvedValueOnce(undefined) // the follow-up's own cache entry
      .mockResolvedValueOnce({
        spokenText: "",
        details: "",
        page: { text: PAGE, sentences: [], signature: "x", complete: true },
      });
    vi.mocked(askJson).mockResolvedValue({ spokenText: "It means he left.", sections: [], itemKind: "none", webQuery: "" });
    await analyzePhoto({
      image: IMAGE,
      mode: "read",
      book: true,
      language: "English",
      question: "what does the second sentence mean?",
    });
    const call = vi.mocked(askJson).mock.calls[0][1];
    const text = JSON.stringify(call.content);
    expect(text).toContain("The lighthouse stood alone.");
    expect(text).toContain("what does the second sentence mean?");
  });
});

describe("POST /api/analyze with book: true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("returns the page", async () => {
    bookReply();
    const res = await POST(
      new Request("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: IMAGE, mode: "read", book: true }),
      }),
    );
    const body = await res.json();
    expect(body.page.pageNumber).toBe("12");
    expect(body.page.sentences).toHaveLength(3);
  });
});
