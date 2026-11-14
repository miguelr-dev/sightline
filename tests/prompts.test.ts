import { describe, expect, it } from "vitest";
import { PROMPT_VERSION, systemPrompt, userPrompt } from "@/lib/prompts";
import { MODES } from "@/lib/modes";

describe("userPrompt", () => {
  it("is just the photo when there's no question", () => {
    expect(userPrompt("read", "English")).toBe("Here is the photo.");
  });

  it("keeps the follow-up wording for a question about the same photo", () => {
    const p = userPrompt("menu", "English", "How much is the salmon?");
    expect(p).toContain("This is the same photo as before");
    expect(p).toContain('"How much is the salmon?"');
  });

  it("treats a question asked with a fresh photo as being about this photo", () => {
    const p = userPrompt("menu", "English", "is this gluten free", { isFollowUp: false });
    expect(p).not.toContain("same photo");
    expect(p).toContain('The user is pointing the camera at this and asks: "is this gluten free"');
    expect(p).toContain("spokenText");
    expect(p).toMatch(/one or two sentences/);
    expect(p).toMatch(/no preamble about the photo/);
  });

  it("answers a fresh question in the Translate language in Translate mode", () => {
    const p = userPrompt("translate", "French", "what does it say", { isFollowUp: false });
    expect(p).toContain("in French");
  });
});

describe("systemPrompt rules (audit round)", () => {
  it.each(MODES.map((m) => [m]))("%s mode caps the spoken answer at 25 words", (mode) => {
    expect(systemPrompt(mode, "English")).toMatch(/at most 25 words/);
  });

  it("forbids photo preambles in the target language, with an example", () => {
    expect(systemPrompt("translate", "Spanish")).toContain("La imagen muestra");
    expect(systemPrompt("translate", "French")).toContain("L'image montre");
    expect(systemPrompt("translate", "Japanese")).toMatch(/in any language/);
  });

  it("makes generic signs itemKind none with no web query, even in Translate", () => {
    const p = systemPrompt("translate", "French");
    expect(p).toMatch(/generic signs/i);
    expect(p).toMatch(/Exit/);
    expect(p).toMatch(/street/i);
    expect(p).toMatch(/even in Translate mode/);
  });

  it("Read copies spelling exactly, even when it looks wrong", () => {
    expect(systemPrompt("read", "English")).toContain(
      "copy spelling exactly as printed, even if it looks wrong",
    );
  });

  it("bumps the prompt version so old cached answers aren't reused", () => {
    expect(PROMPT_VERSION).not.toBe("2026-11-14.3");
  });
});

describe("systemPrompt rules (QA round)", () => {
  it("Read never translates and keeps the original language", () => {
    const p = systemPrompt("read", "English");
    expect(p).toMatch(/never translate/i);
    expect(p).toMatch(/in the language it's printed in/i);
  });

  it("Read with no text says so in a few words, without describing", () => {
    const p = systemPrompt("read", "English");
    expect(p).toContain('"No readable text"');
    expect(p).toMatch(/at most 8 words/);
  });

  it("never guesses numbers, dates, doses or counts that can't be read", () => {
    for (const mode of ["read", "describe", "menu", "translate", "auto"] as const) {
      const p = systemPrompt(mode, "English");
      expect(p).toMatch(/never state a number, date, dose or count you can't read clearly/i);
      expect(p).toContain("the date is cut off");
    }
  });

  it("doesn't hedge a guess: an uncertain digit means that part isn't readable", () => {
    const p = systemPrompt("menu", "English");
    expect(p).toMatch(/if any digit is uncertain/i);
    expect(p).toContain("as far as the print shows");
  });

  it("always lists visible warnings in sections", () => {
    expect(systemPrompt("menu", "English")).toMatch(/every warning you can see[^.]*sections/i);
  });

  it("bumps the prompt version", () => {
    expect(PROMPT_VERSION).not.toBe("2026-11-14.8");
    expect(PROMPT_VERSION).not.toBe("2026-11-14.9");
  });
});
