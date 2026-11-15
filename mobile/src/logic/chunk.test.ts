import { describe, expect, it } from "vitest";
import { chunk, splitSentences } from "./chunk";

describe("splitSentences", () => {
  it("never splits a price or a decimal at its point", () => {
    expect(splitSentences("Lemon Sorbet is vegetarian for 6.50 dollars. Ask about allergens.")).toEqual([
      "Lemon Sorbet is vegetarian for 6.50 dollars. ",
      "Ask about allergens.",
    ]);
    expect(splitSentences("8.4 fluid ounces.")).toEqual(["8.4 fluid ounces."]);
  });

  it("doesn't split after common abbreviations", () => {
    expect(splitSentences("Dr. Smith on Main St. is open. Call now.")).toEqual([
      "Dr. Smith on Main St. is open. ",
      "Call now.",
    ]);
    expect(splitSentences("12 fl oz. per can, about 9 a.m. daily.")).toEqual(["12 fl oz. per can, about 9 a.m. daily."]);
    expect(splitSentences("Use e.g. water. Done.")).toEqual(["Use e.g. water. ", "Done."]);
  });

  it("still splits ordinary sentences, questions and CJK text", () => {
    expect(splitSentences("One. Two! Three? Four")).toEqual(["One. ", "Two! ", "Three? ", "Four"]);
    expect(splitSentences("注意。工事中です。")).toEqual(["注意。", "工事中です。"]);
  });
});

describe("chunk", () => {
  // Run 1, menu conversation turn 1: the 140-character first-chunk limit fell on "6.50".
  const TURN1 =
    "Vegetarian options are the Garden Salad, the Margherita Flatbread, the Mushroom Risotto and the Spring Rolls; the Lemon Sorbet costs 6.50 dollars. Ask about allergens.";

  it("never ends a chunk in the middle of a price", () => {
    const parts = chunk(TURN1, 300, 140);
    for (let i = 0; i < parts.length - 1; i++) expect(parts[i]).not.toMatch(/\d\.$/);
    expect(parts.join(" ")).toContain("6.50 dollars.");
    expect(parts.some((p) => /^50\b/.test(p))).toBe(false);
  });

  it("keeps the whole sentence together even past the first-chunk limit", () => {
    const parts = chunk(TURN1, 300, 140);
    expect(parts).toEqual([
      "Vegetarian options are the Garden Salad, the Margherita Flatbread, the Mushroom Risotto and the Spring Rolls; the Lemon Sorbet costs 6.50 dollars.",
      "Ask about allergens.",
    ]);
  });

  it("splits a very long sentence at word boundaries", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ");
    const parts = chunk(long, 100);
    expect(parts.every((p) => p.length <= 100)).toBe(true);
    expect(parts.join(" ")).toBe(long);
  });
});
