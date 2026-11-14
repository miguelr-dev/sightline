import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analyze", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/analyze")>();
  return { ...actual, analyzePhoto: vi.fn() };
});

import { MAX_TURNS, cleanConversation } from "@/lib/analyze";
import { analyzePhoto } from "@/lib/analyze";
import { userPrompt } from "@/lib/prompts";
import { analysisKey } from "@/lib/db";
import { POST } from "@/app/api/analyze/route";

const IMAGE = "/9j/" + "A".repeat(200);
const turns = [
  { question: "what dishes are under 20 dollars", answer: "Tomato basil soup, 7.50; fish tacos, 16.50; risotto, 18." },
  { question: "which one is vegetarian", answer: "The tomato basil soup and the mushroom risotto." },
];

describe("cleanConversation", () => {
  it("keeps the last 6 well-formed turns, trimmed", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ question: ` q${i} `, answer: `a${i}` }));
    const c = cleanConversation(many);
    expect(MAX_TURNS).toBe(6);
    expect(c).toHaveLength(6);
    expect(c[0]).toEqual({ question: "q3", answer: "a3" });
  });

  it("drops junk and caps long text", () => {
    const c = cleanConversation([
      { question: "ok", answer: "fine" },
      { question: 5, answer: "x" },
      "nope",
      { question: "q", answer: "a".repeat(2000) },
    ]);
    expect(c).toHaveLength(2);
    expect(c[1].answer.length).toBeLessThanOrEqual(600);
    expect(cleanConversation(undefined)).toEqual([]);
  });
});

describe("userPrompt with a conversation", () => {
  it("includes earlier turns in order, before the new question", () => {
    const p = userPrompt("menu", "English", "how much was the first one you mentioned", {
      conversation: turns,
    });
    const q1 = p.indexOf("Q: what dishes are under 20 dollars");
    const a2 = p.indexOf("A: The tomato basil soup and the mushroom risotto.");
    const now = p.indexOf("how much was the first one you mentioned");
    expect(q1).toBeGreaterThan(-1);
    expect(a2).toBeGreaterThan(q1);
    expect(now).toBeGreaterThan(a2);
    expect(p).toMatch(/earlier in this conversation/i);
  });

  it("follow-ups about safety answer from what's printed, never inferring", () => {
    const p = userPrompt("menu", "English", "does this contain peanuts?");
    expect(p).toContain("The label lists");
    expect(p).toMatch(/doesn't mention/);
    expect(p).toMatch(/never (say|infer)[^.]*safe/i);
  });
});

describe("cache keys include the conversation", () => {
  it("the same question after a different conversation is a different answer", () => {
    const base = { image: "x", mode: "menu", language: "English", model: "m", version: "v" };
    const a = analysisKey({ ...base, question: "which one?", conversation: turns });
    const b = analysisKey({ ...base, question: "which one?", conversation: turns.slice(0, 1) });
    const c = analysisKey({ ...base, question: "which one?" });
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("POST /api/analyze passes the conversation along", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzePhoto).mockResolvedValue({
      body: { spokenText: "7 dollars 50.", details: "" },
      status: 200,
      mode: "menu",
    });
  });

  it("for follow-up questions", async () => {
    await POST(
      new Request("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: IMAGE,
          mode: "menu",
          question: "how much was the first one you mentioned",
          conversation: turns,
        }),
      }),
    );
    expect(analyzePhoto).toHaveBeenCalledWith(expect.objectContaining({ conversation: turns }));
  });

  it("for utterances", async () => {
    await POST(
      new Request("http://localhost:3000/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: IMAGE,
          mode: "menu",
          utterance: "which one comes with rice",
          conversation: turns,
        }),
      }),
    );
    expect(analyzePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ question: "which one comes with rice", conversation: turns }),
    );
  });
});
