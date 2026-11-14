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

import { REQUEST_MODES, isRequestMode } from "@/lib/modes";
import { PROMPT_VERSION, systemPrompt } from "@/lib/prompts";
import { analyzePhoto } from "@/lib/analyze";
import { askJson } from "@/lib/claude";
import * as db from "@/lib/db";
import { interpretUtterance } from "@/lib/utterance";

const IMAGE = "/9j/" + "A".repeat(200);

describe("auto mode: validation", () => {
  it("accepts auto and the four modes, nothing else", () => {
    expect(REQUEST_MODES).toEqual(["auto", "read", "describe", "menu", "translate"]);
    for (const m of REQUEST_MODES) expect(isRequestMode(m)).toBe(true);
    for (const m of ["Auto", "scan", "", 3, undefined]) expect(isRequestMode(m)).toBe(false);
  });

  it("bumps the prompt version for the auto prompt", () => {
    expect(PROMPT_VERSION).not.toBe("2026-11-14.6");
  });
});

describe("auto mode: the prompt", () => {
  const p = systemPrompt("auto", "English");

  it("has the decision rule and asks for chosenMode", () => {
    expect(p).toContain("chosenMode");
    expect(p).toMatch(/packaged food, drink, product, medicine or menu[^\n]*menu/i);
    expect(p).toMatch(/foreign-language text[^\n]*translate[^\n]*English/i);
    expect(p).toMatch(/documents, signs, screens or plain text[^\n]*read/i);
    expect(p).toMatch(/scenes or no text[^\n]*describe/i);
  });

  it("includes each mode's instructions once, and the focus rule once", () => {
    for (const m of ["Mode: Read", "Mode: Describe", "Mode: Menu / Label", "Mode: Translate"]) {
      expect(p).toContain(m);
    }
    expect(p.split("First decide what the user is pointing the camera at").length - 1).toBe(1);
  });

  it("translates into the user's language when it picks Translate", () => {
    expect(systemPrompt("auto", "Spanish")).toMatch(/Translate into Spanish/);
  });
});

describe("auto mode: analyzePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key"; // the vitest config blanks real keys
  });

  it("asks for chosenMode in one call and reports the mode it chose", async () => {
    vi.mocked(askJson).mockResolvedValue({
      chosenMode: "menu",
      spokenText: "Harbor Table lunch menu.",
      sections: [],
      itemKind: "restaurant",
      webQuery: "Harbor Table menu hours reviews allergens",
    });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English", device: "phone-1234-abcd" });
    expect(askJson).toHaveBeenCalledTimes(1);
    const schema = vi.mocked(askJson).mock.calls[0][1].schema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.chosenMode).toBeDefined();
    expect(schema.required).toContain("chosenMode");
    expect(r.mode).toBe("menu");
    expect(r.body.spokenText).toBe("Harbor Table lunch menu.");
    expect(db.insertScan).toHaveBeenCalledWith(expect.objectContaining({ mode: "menu" }));
  });

  it("falls back to describe when the chosen mode isn't valid", async () => {
    vi.mocked(askJson).mockResolvedValue({
      chosenMode: "dance",
      spokenText: "A room with a sofa.",
      sections: [],
      itemKind: "none",
      webQuery: "",
    });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(r.mode).toBe("describe");
  });

  it("a fixed mode doesn't ask for chosenMode", async () => {
    vi.mocked(askJson).mockResolvedValue({ spokenText: "x", sections: [], itemKind: "none", webQuery: "" });
    const r = await analyzePhoto({ image: IMAGE, mode: "read", language: "English" });
    const schema = vi.mocked(askJson).mock.calls[0][1].schema as { properties: Record<string, unknown> };
    expect(schema.properties.chosenMode).toBeUndefined();
    expect(r.mode).toBe("read");
  });
});

describe("auto mode: utterances still win", () => {
  it('"translate this to French" in auto is Translate into French', () => {
    expect(interpretUtterance("translate this to French", { mode: "auto", language: "English" })).toMatchObject({
      mode: "translate",
      language: "French",
    });
  });

  it("a plain question in auto stays auto, for the model to choose", () => {
    expect(interpretUtterance("is this gluten free", { mode: "auto", language: "English" })).toMatchObject({
      mode: "auto",
      question: "is this gluten free",
    });
  });
});
