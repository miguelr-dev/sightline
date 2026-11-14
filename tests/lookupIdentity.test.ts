import { beforeEach, describe, expect, it, vi } from "vitest";

// The web lookup must not mix products: pictures only for results that are this item, and a
// summary that says so when the brand is unknown and the results name different brands.

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/brightdata", () => ({
  brightDataConfigured: () => true,
  searchWeb: vi.fn(),
  searchImage: vi.fn(),
}));
vi.mock("@/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/claude")>();
  return { ...actual, askJson: vi.fn() };
});
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    getCachedLookup: vi.fn(async () => undefined),
    putCachedLookup: vi.fn(async () => {}),
    attachLookup: vi.fn(async () => {}),
  };
});

import { identityWords, matchesItem, webLookup } from "@/lib/lookup";
import { searchImage, searchWeb } from "@/lib/brightdata";
import { askJson } from "@/lib/claude";
import * as db from "@/lib/db";

const CELSIUS_IMG = "https://img.example/celsius-tropical-vibe.jpg";
const KIRKLAND_IMG = "https://img.example/kirkland-tropical.jpg";

// What Google really returns for the user's brandless query: Kirkland and Celsius mixed.
const SERP = {
  results: [
    {
      title: "CELSIUS Sparkling Tropical Vibe Energy Drink, 12 fl oz - Amazon.com",
      url: "https://www.amazon.com/celsius-tropical-vibe",
      snippet: "200 mg caffeine, 10 calories, zero sugar.",
      thumbnail: "https://img.example/celsius-thumb.jpg",
    },
    {
      title: "Kirkland Signature Sparkling Energy Drink, Tropical, 12 fl oz, 24-count | Costco",
      url: "https://www.costco.com/kirkland-signature-sparkling-energy-drink.html",
      snippet: "Tropical flavor, 200 mg caffeine per can, no artificial food dyes.",
      thumbnail: "https://img.example/kirkland-thumb.jpg",
    },
  ],
  images: [
    { url: CELSIUS_IMG, text: "Celsius Energy Drink Sparkling Tropical Vibe - 12 Fluid Ounce" },
    { url: KIRKLAND_IMG, text: "Kirkland Sparkling Energy- Tropical" },
  ],
  image: CELSIUS_IMG,
};

const BRANDLESS = "Sparkling Tropical energy drink nutrition facts caffeine sugar price";

describe("identity words", () => {
  it("uses the brand plus the query's distinctive product words", () => {
    expect(identityWords(BRANDLESS, "")).toEqual({ brand: [], product: ["tropical"] });
    expect(identityWords("Kirkland Energy Drink Tropical 196633831439", "Kirkland")).toEqual({
      brand: ["kirkland"],
      product: ["tropical"],
    });
    expect(identityWords("Red Bull 8.4 oz nutrition facts caffeine sugar price", "Red Bull")).toEqual({
      brand: ["red", "bull"],
      product: [],
    });
  });

  it("a result matches only with the brand and a distinctive product word", () => {
    const id = identityWords("Kirkland Energy Drink Tropical", "Kirkland Signature");
    expect(matchesItem("Kirkland Sparkling Energy- Tropical", id)).toBe(true);
    expect(matchesItem("Celsius Sparkling Tropical Vibe", id)).toBe(false);
    expect(matchesItem("Kirkland Signature Paper Towels", id)).toBe(false);
  });
});

describe("web lookup: no mixed products", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.clearAllMocks();
    vi.mocked(searchWeb).mockResolvedValue(SERP);
    vi.mocked(searchImage).mockResolvedValue(SERP.images);
    vi.mocked(askJson).mockResolvedValue({
      spokenText: "From the web: I couldn't confirm the brand. Results vary.",
      sections: [],
      sources: [1, 2],
    });
  });

  it("brandless: never picks the Celsius picture, and tells the summary the brand is unconfirmed", async () => {
    const { body } = await webLookup({ query: BRANDLESS, itemKind: "food_drink" }, { persist: "await" });
    expect(body.image).not.toBe(CELSIUS_IMG);
    expect(body.image).toBeUndefined();
    const call = vi.mocked(askJson).mock.calls[0][1];
    const prompt = `${call.system}\n${String(call.content)}`;
    expect(prompt).toMatch(/brand unconfirmed/i);
    expect(prompt).toContain("I couldn't confirm the brand. Results vary:");
    expect(prompt).toMatch(/never state one brand's numbers as this product's/i);
  });

  it("brand known: the picture and thumbnails come only from that brand's results", async () => {
    const { body } = await webLookup(
      { query: "Kirkland Energy Drink Tropical 196633831439", itemKind: "food_drink", brand: "Kirkland" },
      { persist: "await" },
    );
    expect(body.image).toBe(KIRKLAND_IMG);
    const celsius = body.sources.find((s) => s.url.includes("celsius"));
    const kirkland = body.sources.find((s) => s.url.includes("kirkland"));
    expect(celsius?.thumbnail).toBeUndefined();
    expect(kirkland?.thumbnail).toBe("https://img.example/kirkland-thumb.jpg");
    const call = vi.mocked(askJson).mock.calls[0][1];
    expect(`${call.system}\n${String(call.content)}`).toMatch(/Kirkland/);
    expect(`${call.system}\n${String(call.content)}`).not.toMatch(/brand unconfirmed/i);
  });

  it("brand known but no result is that brand: no picture at all", async () => {
    vi.mocked(searchImage).mockResolvedValue([SERP.images[0]]);
    vi.mocked(searchWeb).mockResolvedValue({ ...SERP, images: [SERP.images[0]] });
    const { body } = await webLookup(
      { query: "Kirkland Energy Drink Tropical", itemKind: "food_drink", brand: "Kirkland" },
      { persist: "await" },
    );
    expect(body.image).toBeUndefined();
  });

  it("caches brandless and branded answers separately", async () => {
    await webLookup({ query: BRANDLESS, itemKind: "food_drink" }, { persist: "await" });
    await webLookup({ query: BRANDLESS, itemKind: "food_drink", brand: "Kirkland" }, { persist: "await" });
    const keys = vi.mocked(db.getCachedLookup).mock.calls.map(([k]) => k);
    expect(new Set(keys).size).toBe(2);
  });

  it("a restaurant without a brand still gets a picture that matches its name", async () => {
    vi.mocked(searchWeb).mockResolvedValue({
      results: [{ title: "Harbor Table - Yelp", url: "https://www.yelp.com/biz/harbor-table", snippet: "Seafood" }],
    });
    vi.mocked(searchImage).mockResolvedValue([
      { url: "https://img.example/other.jpg", text: "Some other cafe" },
      { url: "https://img.example/harbor.jpg", text: "Harbor Table dining room" },
    ]);
    const { body } = await webLookup(
      { query: "Harbor Table menu hours reviews allergens", itemKind: "restaurant" },
      { persist: "await" },
    );
    expect(body.image).toBe("https://img.example/harbor.jpg");
  });
});
