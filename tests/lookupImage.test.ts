import { beforeEach, describe, expect, it, vi } from "vitest";

// D4: the product picture. The image search gets about 1.5 s after the summary is ready, and a
// lookup saved without its picture is reused for only 10 minutes, so a later one can fill it in.

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

import { IMAGE_GRACE_MS, webLookup } from "@/lib/lookup";
import { lookupStillFresh } from "@/lib/db";
import { searchImage, searchWeb } from "@/lib/brightdata";
import { askJson } from "@/lib/claude";
import * as db from "@/lib/db";

const QUERY = "Kirkland Signature Sparkling Energy Drink Orange 12 oz nutrition facts caffeine sugar price";
const BRAND = "Kirkland Signature";
const KIRKLAND_IMG = "https://img.example/kirkland-orange.jpg";
const SERP = {
  results: [
    {
      title: "Kirkland Signature Sparkling Energy Drink, Orange, 12 fl oz, 24-count | Costco",
      url: "https://www.costco.com/kirkland-signature-sparkling-energy-drink-orange.html",
      snippet: "Orange flavor, 200 mg caffeine per can.",
    },
  ],
};
const later = <T,>(ms: number, v: T) => new Promise<T>((r) => setTimeout(() => r(v), ms));

describe("web lookup picture", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.clearAllMocks();
    vi.mocked(searchWeb).mockResolvedValue(SERP);
    vi.mocked(askJson).mockResolvedValue({ spokenText: "From the web: 200 milligrams of caffeine.", sections: [], sources: [1] });
  });

  it("gives the image search about 1.5 s after the summary", () => {
    expect(IMAGE_GRACE_MS).toBeGreaterThanOrEqual(1_200);
    expect(IMAGE_GRACE_MS).toBeLessThanOrEqual(2_000);
  });

  it("an image that lands 0.8 s after the summary is used", async () => {
    vi.mocked(searchImage).mockImplementation(() =>
      later(800, [{ url: KIRKLAND_IMG, text: "Kirkland Signature Sparkling Energy Drink Orange" }]),
    );
    const { body } = await webLookup({ query: QUERY, itemKind: "food_drink", brand: BRAND }, { persist: "await" });
    expect(body.image).toBe(KIRKLAND_IMG);
  });

  it("keeps the brand rule: a late picture of another brand isn't used", async () => {
    vi.mocked(searchImage).mockImplementation(() =>
      later(100, [{ url: "https://img.example/celsius.jpg", text: "Celsius Sparkling Orange" }]),
    );
    const { body } = await webLookup({ query: QUERY, itemKind: "food_drink", brand: BRAND }, { persist: "await" });
    expect(body.image).toBeUndefined();
  });

  it("a hung image search delays the answer by the grace period at most", async () => {
    vi.mocked(searchImage).mockImplementation(() => new Promise(() => {}));
    const t = Date.now();
    const { body } = await webLookup({ query: QUERY, itemKind: "food_drink", brand: BRAND }, { persist: "await" });
    expect(Date.now() - t).toBeLessThan(IMAGE_GRACE_MS + 700);
    expect(body.spokenText).toMatch(/caffeine/);
    expect(body.image).toBeUndefined();
  });

  it("a picture that lands after the answer is saved to the cache for the next lookup", async () => {
    vi.mocked(searchImage).mockImplementation(() =>
      later(IMAGE_GRACE_MS + 400, [{ url: KIRKLAND_IMG, text: "Kirkland Sparkling Energy Orange" }]),
    );
    const { body } = await webLookup({ query: QUERY, itemKind: "food_drink", brand: BRAND });
    expect(body.image).toBeUndefined(); // the spoken answer didn't wait for it
    await later(600, null);
    const saved = vi.mocked(db.putCachedLookup).mock.calls.map(([, r]) => r.image);
    expect(saved).toEqual([undefined, KIRKLAND_IMG]);
  });

  it("asks the cache to expire an imageless answer early only when a picture is allowed", async () => {
    vi.mocked(searchImage).mockResolvedValue([]);
    await webLookup({ query: QUERY, itemKind: "food_drink", brand: BRAND }, { persist: "await" });
    await webLookup({ query: QUERY, itemKind: "food_drink" }, { persist: "await" }); // brandless: no picture ever
    const calls = vi.mocked(db.getCachedLookup).mock.calls;
    expect(calls[0][1]).toEqual({ imageExpected: true });
    expect(calls[1][1]).toEqual({ imageExpected: false });
  });
});

describe("lookupStillFresh", () => {
  const withImage = { spokenText: "x", details: "", query: "q", sources: [], image: KIRKLAND_IMG };
  const noImage = { spokenText: "x", details: "", query: "q", sources: [] };

  it("keeps a lookup with a picture for 24 hours", () => {
    expect(lookupStillFresh(withImage, 23 * 3600, true)).toBe(true);
    expect(lookupStillFresh(withImage, 25 * 3600, true)).toBe(false);
  });

  it("keeps one without its picture for 10 minutes when a picture was expected", () => {
    expect(lookupStillFresh(noImage, 9 * 60, true)).toBe(true);
    expect(lookupStillFresh(noImage, 11 * 60, true)).toBe(false);
  });

  it("keeps one that could never have a picture for 24 hours", () => {
    expect(lookupStillFresh(noImage, 23 * 3600, false)).toBe(true);
  });
});
