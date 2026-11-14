import { describe, expect, it } from "vitest";
import { buildPage, pageSignature, splitSentences } from "@/lib/book";

describe("splitSentences", () => {
  it.each([
    [
      "Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal. They were the last people you'd expect.",
      [
        "Mr. and Mrs. Dursley, of number four, Privet Drive, were proud to say that they were perfectly normal.",
        "They were the last people you'd expect.",
      ],
    ],
    ["The U.S. economy grew 3.5 percent. Prices rose.", ["The U.S. economy grew 3.5 percent.", "Prices rose."]],
    ["Dr. Smith met Prof. Jones at 4 p.m. on Main St. today. It rained.", ["Dr. Smith met Prof. Jones at 4 p.m. on Main St. today.", "It rained."]],
    ["Fruit, e.g. apples, i.e. the red ones, is fine. Next.", ["Fruit, e.g. apples, i.e. the red ones, is fine.", "Next."]],
    ['"Stop!" she said. He stopped.', ['"Stop!" she said.', "He stopped."]],
    ["J. R. R. Tolkien wrote it. Fine.", ["J. R. R. Tolkien wrote it.", "Fine."]],
    ["Wait... What happened? Nothing!", ["Wait...", "What happened?", "Nothing!"]],
    ["First paragraph ends here\n\nSecond paragraph starts.", ["First paragraph ends here", "Second paragraph starts."]],
    ["  ", []],
  ])("%s", (text, expected) => {
    expect(splitSentences(text)).toEqual(expected);
  });
});

describe("pageSignature", () => {
  const page =
    "It was a bright cold day in April, and the clocks were striking thirteen. Winston Smith, his chin nuzzled into his breast in an effort to escape the vile wind, slipped quickly through the glass doors of Victory Mansions.";

  it("is 16 hex characters", () => {
    expect(pageSignature(page)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("ignores case, punctuation and spacing differences", () => {
    const variant = page.toUpperCase().replace(/,/g, "").replace(/ /g, "  ");
    expect(pageSignature(variant)).toBe(pageSignature(page));
  });

  it("is the same when only the middle of the page differs (an OCR slip)", () => {
    expect(pageSignature(page.replace("nuzzled", "nuzzlcd"))).toBe(pageSignature(page));
  });

  it("differs for a different page", () => {
    expect(pageSignature("A completely different page of text about something else entirely.")).not.toBe(
      pageSignature(page),
    );
  });
});

describe("buildPage", () => {
  const text = "Chapter One begins here. The rain had stopped by noon.\n\nShe walked to the market. It was closed.";

  it("splits the text and speaks the first two sentences", () => {
    const { page, spokenText } = buildPage({ pageText: text, pageNumber: "12", complete: true, cutOff: "" });
    expect(page).toMatchObject({ text, pageNumber: "12", complete: true });
    expect(page.sentences).toHaveLength(4);
    expect(page.signature).toBe(pageSignature(text));
    expect(page.cutOff).toBeUndefined();
    expect(spokenText).toBe("Chapter One begins here. The rain had stopped by noon.");
  });

  it("speaks only the first sentence when the first two are long", () => {
    const long = `${"word ".repeat(30).trim()}. ${"more ".repeat(30).trim()}.`;
    const { spokenText } = buildPage({ pageText: long, pageNumber: "", complete: true, cutOff: "" });
    expect(splitSentences(spokenText)).toHaveLength(1);
  });

  it("speaks the cut-off hint when the page is incomplete", () => {
    const { page, spokenText } = buildPage({
      pageText: text,
      pageNumber: "",
      complete: false,
      cutOff: "The bottom lines are cut off. Move the phone back a little.",
    });
    expect(page.complete).toBe(false);
    expect(page.cutOff).toBe("The bottom lines are cut off. Move the phone back a little.");
    expect(page.pageNumber).toBeUndefined();
    expect(spokenText).toBe("The bottom lines are cut off. Move the phone back a little.");
  });
});
