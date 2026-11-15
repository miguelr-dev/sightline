import { beforeEach, describe, expect, it, vi } from "vitest";

// D2: sections that only say what ISN'T in the photo ("Not visible…") are dropped whatever
// their title; an important one leaves a single short line in an existing section instead.

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

import { analyzePhoto, foldMissing, labelSections } from "@/lib/analyze";
import { askJson } from "@/lib/claude";

const IMAGE = "/9j/" + "A".repeat(200);

describe("labelSections: not-visible bodies", () => {
  it("drops the real example: 'Ingredients and nutrition' whose body is 'Not visible…'", () => {
    const { sections, missing } = labelSections(
      [
        { title: "Caffeine", body: "200 mg per can." },
        { title: "Ingredients and nutrition", body: "Not visible on this label; turn the can to read them." },
      ],
      "menu",
    );
    expect(sections.map((s) => s.title)).toEqual(["Caffeine"]);
    expect(missing).toEqual(["Ingredients and nutrition"]);
  });

  it.each([
    "Ingredients and nutrition facts aren't visible in this photo.",
    "Not shown.",
    "The nutrition panel is cut off. Move the phone back a little.",
    "Not readable from this angle.",
    "On the back of the can; turn it to read them.",
  ])("drops a body that is only a note: %s", (body) => {
    expect(labelSections([{ title: "Details", body }], "menu").sections).toEqual([]);
  });

  it("keeps the real content of a body and drops only its note", () => {
    const { sections } = labelSections([{ title: "Size and price", body: "12 fl oz can. Price not visible." }], "menu");
    expect(sections).toEqual([{ title: "Size and price", body: "12 fl oz can.", provenance: "label" }]);
  });

  it("keeps a clause with numbers even if it mentions what's missing", () => {
    const body = "10 calories and 200 mg caffeine per can, other values not visible.";
    expect(labelSections([{ title: "Nutrition", body }], "menu").sections[0].body).toBe(body);
  });

  it("still drops not-visible titles, and leaves ordinary sections alone", () => {
    const { sections } = labelSections(
      [
        { title: "Not visible", body: "Ingredients" },
        { title: "Allergens", body: "Contains milk and soy." },
      ],
      "menu",
    );
    expect(sections).toEqual([{ title: "Allergens", body: "Contains milk and soy.", provenance: "label" }]);
  });

  it("never edits Read or Translate text, which is verbatim", () => {
    const body = "Water will be cut off tomorrow. Not visible from the street.";
    expect(labelSections([{ title: "Full text", body }], "read").sections[0].body).toBe(body);
    expect(labelSections([{ title: "Original text", body }], "translate").sections[0].body).toBe(body);
  });
});

describe("foldMissing", () => {
  const caffeine = { title: "Caffeine", body: "200 mg per can.", provenance: "label" as const };

  it("folds one short line for an important missing section into an existing one", () => {
    const out = foldMissing([caffeine], ["Ingredients and nutrition"]);
    expect(out).toHaveLength(1);
    expect(out[0].body).toBe("200 mg per can.\nIngredients and nutrition: not in this photo; try another side.");
  });

  it("adds nothing for unimportant ones, or when another section already covers it", () => {
    expect(foldMissing([caffeine], ["Size and price"])).toEqual([caffeine]);
    const barcode = { title: "Nutrition, per serving (from barcode)", body: "Calories 10", provenance: "label" as const };
    const ingredients = { title: "Ingredients (from barcode)", body: "Water", provenance: "label" as const };
    expect(foldMissing([caffeine, barcode, ingredients], ["Ingredients and nutrition"])).toEqual([caffeine, barcode, ingredients]);
  });

  it("adds nothing when there's no section to fold into", () => {
    expect(foldMissing([], ["Ingredients"])).toEqual([]);
  });
});

describe("analyzePhoto drops not-visible sections end to end", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("the can back: 'Ingredients and nutrition: Not visible…' is gone, with one folded line", async () => {
    vi.mocked(askJson).mockResolvedValue({
      chosenMode: "menu",
      spokenText: "Kirkland Signature energy drink, Tropical. Not recommended for children.",
      sections: [
        { title: "Warnings", body: "Not recommended for children or people sensitive to caffeine." },
        { title: "Ingredients and nutrition", body: "Not visible on this label; turn the can to read them." },
      ],
      itemKind: "food_drink",
      webQuery: "Kirkland Signature energy drink tropical",
      brand: "Kirkland Signature",
      barcode: "",
      spokenLanguage: "en",
    });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    const titles = (r.body.sections ?? []).map((s) => s.title);
    expect(titles).toEqual(["Warnings"]);
    expect(JSON.stringify(r.body.sections)).not.toMatch(/Not visible/);
    expect(r.body.sections?.[0].body).toMatch(/\nIngredients and nutrition: not in this photo/);
  });
});
