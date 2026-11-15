import { beforeEach, describe, expect, it, vi } from "vitest";

// D7: a Read of a Spanish sign stays verbatim Spanish, and the reply says which language the
// spoken text is in, so the phone reads it with a Spanish voice.

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/claude")>();
  return { ...actual, askJson: vi.fn() };
});
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    dbConfigured: () => false,
    getCachedAnalysis: vi.fn(async () => undefined),
    putCachedAnalysis: vi.fn(async () => {}),
  };
});

import { LANGUAGES, SPEECH_LANGUAGES, spokenLanguageCode } from "@/lib/modes";
import { PROMPT_VERSION, systemPrompt } from "@/lib/prompts";
import { analyzePhoto } from "@/lib/analyze";
import { askJson } from "@/lib/claude";

const IMAGE = "/9j/" + "A".repeat(200);
const SIGN = "Precaución. Obras en la acera. Use la otra acera.";

type Schema = { properties: Record<string, { enum?: string[] }>; required: string[] };
const schemaOf = (i = 0) => vi.mocked(askJson).mock.calls[i][1].schema as unknown as Schema;

describe("spokenLanguage: validation", () => {
  it("is one primary tag per app language", () => {
    expect(SPEECH_LANGUAGES).toEqual(LANGUAGES.map((l) => l.code.split("-")[0]));
    expect(SPEECH_LANGUAGES).toContain("es");
    expect(SPEECH_LANGUAGES).toContain("fil");
  });

  it.each([
    ["es", "es"],
    ["ES", "es"],
    ["es-ES", "es"],
    ["es_MX", "es"],
    [" fr ", "fr"],
    ["fil", "fil"],
    ["xx", undefined],
    ["", undefined],
    ["spanish", undefined],
    [3, undefined],
    [undefined, undefined],
  ])("%j → %j", (input, expected) => {
    expect(spokenLanguageCode(input)).toBe(expected);
  });
});

describe("spokenLanguage: prompt and schema", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("asks for spokenLanguage from the app's language list, in fixed and auto modes", async () => {
    vi.mocked(askJson).mockResolvedValue({ spokenText: SIGN, sections: [], itemKind: "none", webQuery: "", spokenLanguage: "es" });
    await analyzePhoto({ image: IMAGE, mode: "read", language: "English" });
    await analyzePhoto({ image: IMAGE + "B", mode: "auto", language: "English" });
    for (const i of [0, 1]) {
      const schema = schemaOf(i);
      expect(schema.properties.spokenLanguage.enum).toEqual(SPEECH_LANGUAGES);
      expect(schema.required).toContain("spokenLanguage");
    }
  });

  it("the prompt keeps Read answers to the verbatim text, one language per answer", () => {
    for (const mode of ["read", "auto"] as const) {
      const p = systemPrompt(mode, "English");
      expect(p).toMatch(/spokenLanguage/);
      expect(p).toMatch(/no framing in another language/i);
    }
    expect(PROMPT_VERSION).not.toBe("2026-11-14.11"); // before spokenLanguage and body-level not-visible filtering
  });
});

describe("spokenLanguage: the reply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it('a Spanish sign read verbatim comes back with spokenLanguage "es"', async () => {
    vi.mocked(askJson).mockResolvedValue({ spokenText: SIGN, sections: [], itemKind: "none", webQuery: "", spokenLanguage: "es-ES" });
    const r = await analyzePhoto({ image: IMAGE, mode: "read", language: "English" });
    expect(r.body.spokenText).toBe(SIGN);
    expect(r.body.spokenLanguage).toBe("es");
  });

  it("an unknown code is left out, so the phone falls back to its default", async () => {
    vi.mocked(askJson).mockResolvedValue({ spokenText: "Привет", sections: [], itemKind: "none", webQuery: "", spokenLanguage: "ru" });
    const r = await analyzePhoto({ image: IMAGE, mode: "read", language: "English" });
    expect(r.body.spokenLanguage).toBeUndefined();
  });
});
