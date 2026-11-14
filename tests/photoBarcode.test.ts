import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Barcode digits printed on the package, read from the photo by the model, then looked up.

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
    getCachedBarcode: vi.fn(async () => undefined),
    putCachedBarcode: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/brightdata", () => ({
  brightDataConfigured: () => false,
  searchWeb: vi.fn(async () => ({ results: [] })),
  searchImage: vi.fn(async () => []),
}));

import { analyzePhoto } from "@/lib/analyze";
import { askJson } from "@/lib/claude";
import { systemPrompt } from "@/lib/prompts";
import { productIdentity } from "@/lib/barcode";
import * as db from "@/lib/db";

const IMAGE = "/9j/" + "A".repeat(200);
const KIRKLAND = "196633831439";

// Open Food Facts' record for the user's can (what it really returns, trimmed).
const OFF_KIRKLAND = {
  status: 1,
  product: {
    product_name: "Energy Drink - Tropical",
    brands: "Kirkland",
    quantity: "12 oz",
    serving_size: "1 Can (12 fl oz)",
    ingredients_text_en: "Carbonated water, citric acid, natural flavors, caffeine",
    nutriments: { "energy-kcal_serving": 10, sugars_serving: 0, caffeine_serving: 0.2 },
    image_front_url: "https://images.openfoodfacts.org/kirkland.jpg",
  },
};

const fetchMock = vi.fn();

function modelSays(over: Record<string, unknown> = {}) {
  vi.mocked(askJson).mockResolvedValue({
    chosenMode: "menu",
    spokenText: "Sparkling Tropical energy drink can. No artificial food dyes.",
    sections: [
      { title: "Claims printed on the can", body: "No artificial food dyes. Zero sugar." },
      { title: "Not visible", body: "The brand and nutrition panel aren't shown." },
    ],
    itemKind: "food_drink",
    webQuery: "Sparkling Tropical energy drink nutrition facts caffeine sugar price",
    brand: "",
    barcode: KIRKLAND,
    ...over,
  });
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("photo barcode: the prompt", () => {
  it("asks for the printed barcode digits, only when clearly legible, never guessed", () => {
    const p = systemPrompt("auto", "English");
    expect(p).toMatch(/barcode:[^\n]*digits printed under[^\n]*(UPC|EAN)/i);
    expect(p).toMatch(/barcode:[^\n]*empty/i);
    expect(p).toMatch(/barcode:[^\n]*never guess/i);
  });

  it("asks for the brand as printed, empty when it isn't readable", () => {
    const p = systemPrompt("menu", "English");
    expect(p).toMatch(/brand:[^\n]*as printed[^\n]*empty/i);
  });

  it("puts barcode and brand in the output schema in every mode", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    modelSays({ barcode: "" });
    for (const mode of ["auto", "menu", "read", "describe", "translate"] as const) {
      vi.mocked(askJson).mockClear();
      await analyzePhoto({ image: IMAGE, mode, language: "English" });
      const schema = vi.mocked(askJson).mock.calls[0][1].schema as {
        properties: Record<string, unknown>;
        required: string[];
      };
      expect(schema.properties.barcode).toBeDefined();
      expect(schema.properties.brand).toBeDefined();
    }
  });
});

describe("photo barcode: identity from the barcode", () => {
  it("names the product with brand: 'Kirkland Energy Drink, Tropical'", () => {
    expect(
      productIdentity({
        found: true,
        title: "Energy Drink - Tropical",
        brand: "Kirkland",
        spokenText: "",
        sections: [],
        itemKind: "food_drink",
      }),
    ).toBe("Kirkland Energy Drink, Tropical");
    expect(
      productIdentity({
        found: true,
        title: "Diet Coke Soft Drink",
        brand: "Coca-Cola",
        spokenText: "",
        sections: [],
        itemKind: "food_drink",
      }),
    ).toBe("Coca-Cola Diet Coke Soft Drink");
    // The brand isn't repeated when the name already has it.
    expect(
      productIdentity({
        found: true,
        title: "Kirkland Signature Sparkling Energy Drink",
        brand: "Kirkland Signature",
        spokenText: "",
        sections: [],
        itemKind: "food_drink",
      }),
    ).toBe("Kirkland Signature Sparkling Energy Drink");
  });
});

describe("photo barcode: analyzePhoto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(`openfoodfacts.org/api/v2/product/${KIRKLAND}`)) {
        return new Response(JSON.stringify(OFF_KIRKLAND), { status: 200 });
      }
      return new Response(JSON.stringify({ status: 0 }), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("looks up valid printed digits and leads with the product's exact name and brand", async () => {
    modelSays();
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`openfoodfacts.org/api/v2/product/${KIRKLAND}`),
      expect.anything(),
    );
    expect(r.body.spokenText.startsWith("Kirkland Energy Drink, Tropical.")).toBe(true);
    expect(r.body.spokenText).toContain("No artificial food dyes");
    // The model's brandless name isn't repeated after the real one.
    expect(r.body.spokenText).not.toMatch(/Sparkling Tropical energy drink can/i);
    expect(words(r.body.spokenText)).toBeLessThanOrEqual(25);
    expect(r.body.brand).toBe("Kirkland");
    expect(r.body.barcode).toMatchObject({ code: KIRKLAND, found: true, source: "openfoodfacts" });
  });

  it("searches the web by the exact product name plus the UPC", async () => {
    modelSays();
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(r.body.webQuery).toBe(`Kirkland Energy Drink Tropical ${KIRKLAND}`);
    expect(r.body.itemKind).toBe("food_drink");
  });

  it("adds the barcode's Nutrition and Ingredients as label sections marked (from barcode)", async () => {
    modelSays();
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    const fromBarcode = (r.body.sections ?? []).filter((s) => /\(from barcode\)/.test(s.title));
    expect(fromBarcode.map((s) => s.title)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Nutrition/),
        expect.stringMatching(/^Ingredients/),
      ]),
    );
    for (const s of fromBarcode) expect(s.provenance).toBe("label");
    expect(r.body.details).toContain("Carbonated water");
    // The photo's own sections stay first.
    expect(r.body.sections?.[0].title).toBe("Claims printed on the can");
  });

  it("adds the barcode's key facts (sugar, caffeine) when the photo's answer lacks them", async () => {
    modelSays();
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(r.body.spokenText).toBe(
      "Kirkland Energy Drink, Tropical. 0 grams of sugar and 200 milligrams of caffeine per serving. No artificial food dyes.",
    );
  });

  it("keeps the model's answer when it already names the brand", async () => {
    modelSays({ spokenText: "Kirkland Signature Sparkling Energy Drink, Tropical. 200 milligrams of caffeine.", brand: "Kirkland Signature" });
    const r = await analyzePhoto({ image: IMAGE, mode: "menu", language: "English" });
    expect(r.body.spokenText).toBe("Kirkland Signature Sparkling Energy Drink, Tropical. 200 milligrams of caffeine.");
  });

  it("keeps a long answer within 25 words, never dropping a printed warning", async () => {
    modelSays({
      spokenText:
        "Sparkling Tropical energy drink can. Not recommended for children, pregnant women or people sensitive to caffeine. No artificial food dyes, zero sugar, natural flavors and a fresh taste.",
    });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(words(r.body.spokenText)).toBeLessThanOrEqual(25);
    expect(r.body.spokenText).toContain("Not recommended for children");
    // The full sugar-and-caffeine line doesn't fit beside the warning; caffeine alone does.
    expect(r.body.spokenText).toBe(
      "Kirkland Energy Drink, Tropical. 200 milligrams of caffeine per serving. Not recommended for children, pregnant women or people sensitive to caffeine.",
    );
  });

  it("ignores digits whose check digit is wrong (never guessed)", async () => {
    modelSays({ barcode: "196633831438" });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.body.barcode).toBeUndefined();
    expect(r.body.spokenText).toMatch(/^Sparkling Tropical/);
  });

  it("doesn't look up barcodes in Translate mode", async () => {
    modelSays({ chosenMode: "translate" });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "Spanish" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.body.barcode).toBeUndefined();
    modelSays();
    await analyzePhoto({ image: IMAGE, mode: "translate", language: "Spanish" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("answers from the photo alone when the barcode isn't found", async () => {
    modelSays({ barcode: "049000028911" });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(r.body.barcode).toBeUndefined();
    expect(r.body.spokenText).toMatch(/^Sparkling Tropical/);
    expect(r.body.webQuery).toMatch(/^Sparkling Tropical/);
  });

  it("uses the barcode cache, and caches a fresh lookup", async () => {
    modelSays();
    await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(db.getCachedBarcode).toHaveBeenCalledWith(expect.stringContaining("00196633831439"));
    expect(db.putCachedBarcode).toHaveBeenCalledWith(
      expect.stringContaining("00196633831439"),
      expect.objectContaining({ found: true, brand: "Kirkland" }),
    );
    vi.mocked(db.getCachedBarcode).mockResolvedValueOnce({
      found: true,
      source: "openfoodfacts",
      title: "Energy Drink - Tropical",
      brand: "Kirkland",
      spokenText: "x",
      sections: [],
      itemKind: "food_drink",
    });
    fetchMock.mockClear();
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.body.spokenText).toMatch(/^Kirkland Energy Drink, Tropical\./);
  });

  it("gives up on a slow barcode lookup after 2.5 seconds", async () => {
    modelSays();
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const started = Date.now();
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    const took = Date.now() - started;
    expect(took).toBeGreaterThanOrEqual(2_400);
    expect(took).toBeLessThan(3_500);
    expect(r.body.barcode).toBeUndefined();
    expect(r.body.error).toBeUndefined();
  }, 6_000);
});

describe("no 'missing information' sections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("drops sections titled Not visible, Missing, Unknown or Not shown", async () => {
    modelSays({
      barcode: "",
      sections: [
        { title: "Claims", body: "Zero sugar." },
        { title: "Not visible", body: "Brand." },
        { title: "Missing information", body: "Nutrition panel." },
        { title: "Unknown", body: "Size." },
        { title: "Ingredients (not shown)", body: "On another side." },
      ],
    });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(r.body.sections?.map((s) => s.title)).toEqual(["Claims"]);
  });

  it.each(["auto", "menu", "describe", "read"] as const)(
    "the %s prompt forbids them and says to mention it in one line instead",
    (mode) => {
      const p = systemPrompt(mode, "English");
      expect(p).toMatch(/Never create sections[^\n]*"Not visible"[^\n]*"Missing information"[^\n]*"Unknown"/);
      expect(p).toMatch(/on another side of the can; turn it to read them/);
    },
  );
});
