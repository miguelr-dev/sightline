import { describe, expect, it } from "vitest";
import { answerLang, speechLanguageTag } from "./speechLang";

// D7: an answer is spoken with a voice for the language it's in. Read mode stays verbatim, so a
// Spanish sign is read by a Spanish voice; Translate always uses its target language.

describe("speechLanguageTag", () => {
  it.each([
    ["es", "es-ES"],
    ["ES", "es-ES"],
    ["es-MX", "es-ES"],
    ["fil", "fil-PH"],
    ["en", "en-US"],
    ["xx", undefined],
    ["", undefined],
    [undefined, undefined],
    [7, undefined],
  ])("%j → %j", (input, expected) => {
    expect(speechLanguageTag(input)).toBe(expected);
  });
});

describe("answerLang", () => {
  it('reads a Spanish sign in Read mode with a Spanish voice when the server says "es"', () => {
    expect(answerLang("read", "English", "es")).toBe("es-ES");
  });

  it("falls back to English without (or with an unknown) spokenLanguage", () => {
    expect(answerLang("read", "English")).toBe("en-US");
    expect(answerLang("describe", "English", "xx")).toBe("en-US");
  });

  it("Translate always speaks its target language", () => {
    expect(answerLang("translate", "French", "es")).toBe("fr-FR");
    expect(answerLang("translate", "Japanese")).toBe("ja-JP");
  });
});
