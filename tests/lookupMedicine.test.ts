import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/brightdata", () => ({
  brightDataConfigured: () => true,
  searchWeb: vi.fn(),
  searchImage: vi.fn(async () => undefined),
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

import { webLookup } from "@/lib/lookup";
import { searchWeb } from "@/lib/brightdata";
import { askJson } from "@/lib/claude";

const WEB = {
  results: [
    { title: "Tylenol Extra Strength - Drugs.com", url: "https://www.drugs.com/tylenol.html", snippet: "Uses" },
  ],
};
const FDA = {
  results: [
    {
      title: "Johnson & Johnson recalls Tylenol Extra Strength caplets",
      url: "https://www.fda.gov/safety/recalls/tylenol",
      snippet: "Voluntary recall of specific lots",
    },
  ],
};

describe("web lookup for medicine runs an FDA recall search too", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.clearAllMocks();
    vi.mocked(searchWeb).mockImplementation(async (q: string) => (q.includes("site:fda.gov") ? FDA : WEB));
    vi.mocked(askJson).mockResolvedValue({
      spokenText: "From the web: Tylenol Extra Strength was recalled.",
      sections: [],
      sources: [1],
    });
  });

  it("searches fda.gov for recalls of the medicine by name, alongside the normal search", async () => {
    await webLookup(
      { query: "Tylenol Extra Strength 500 mg uses recall FDA warning", itemKind: "medicine" },
      { persist: "await" },
    );
    const queries = vi.mocked(searchWeb).mock.calls.map(([q]) => q);
    expect(queries).toHaveLength(2);
    expect(queries).toContain("Tylenol Extra Strength 500 mg uses recall FDA warning");
    expect(queries).toContainEqual(
      'site:fda.gov OR site:accessdata.fda.gov "Tylenol Extra Strength" recall',
    );
  });

  it("puts the FDA recall results first for the summary", async () => {
    await webLookup(
      { query: "Tylenol Extra Strength 500 mg uses recall FDA warning", itemKind: "medicine" },
      { persist: "await" },
    );
    const content = String(vi.mocked(askJson).mock.calls[0][1].content);
    expect(content.indexOf("fda.gov/safety/recalls/tylenol")).toBeGreaterThan(-1);
    expect(content.indexOf("fda.gov/safety/recalls/tylenol")).toBeLessThan(
      content.indexOf("drugs.com"),
    );
  });

  it("still answers when the recall search fails", async () => {
    vi.mocked(searchWeb).mockImplementation(async (q: string) => {
      if (q.includes("site:fda.gov")) throw new Error("Bright Data error 502");
      return WEB;
    });
    const { body } = await webLookup(
      { query: "Tylenol Extra Strength 500 mg uses recall FDA warning", itemKind: "medicine" },
      { persist: "await" },
    );
    expect(body.error).toBeUndefined();
    expect(body.spokenText).toContain("From the web");
  });

  it("doesn't run the recall search for food and drinks", async () => {
    await webLookup(
      { query: "Red Bull 8.4 oz nutrition facts caffeine sugar price", itemKind: "food_drink" },
      { persist: "await" },
    );
    expect(searchWeb).toHaveBeenCalledTimes(1);
  });
});
