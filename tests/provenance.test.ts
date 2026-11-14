import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/claude")>();
  return { ...actual, askJson: vi.fn() };
});
vi.mock("@/lib/brightdata", () => ({
  brightDataConfigured: () => true,
  searchWeb: vi.fn(async () => ({
    results: [{ title: "Tylenol recall", url: "https://www.fda.gov/r", snippet: "Recall" }],
  })),
  searchImage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    dbConfigured: () => false,
    getCachedAnalysis: vi.fn(async () => undefined),
    putCachedAnalysis: vi.fn(async () => {}),
    getCachedLookup: vi.fn(async () => undefined),
    putCachedLookup: vi.fn(async () => {}),
    attachLookup: vi.fn(async () => {}),
  };
});

import { analyzePhoto } from "@/lib/analyze";
import { webLookup } from "@/lib/lookup";
import { askJson } from "@/lib/claude";

describe("provenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("sections read from the photo are tagged label", async () => {
    vi.mocked(askJson).mockResolvedValue({
      spokenText: "Nutter Butter.",
      sections: [{ title: "Allergens", body: "Peanuts, wheat, soy" }],
      itemKind: "food_drink",
      webQuery: "",
    });
    const { body } = await analyzePhoto({ image: "/9j/AAAA", mode: "menu", language: "English" });
    expect(body.sections).toEqual([{ title: "Allergens", body: "Peanuts, wheat, soy", provenance: "label" }]);
  });

  it("web lookup sections are tagged web, and the summary prompt attributes and matches recalls", async () => {
    vi.mocked(askJson).mockResolvedValue({
      spokenText: "Online, the FDA lists a recall.",
      sections: [{ title: "Recalls", body: "The FDA lists a recall." }],
      sources: [1],
    });
    const { body } = await webLookup(
      { query: "Tylenol Extra Strength uses recall FDA warning", itemKind: "medicine" },
      { persist: "await" },
    );
    expect(body.sections?.[0]).toMatchObject({ provenance: "web" });
    const system = vi.mocked(askJson).mock.calls.map(([, c]) => c.system).join("\n");
    expect(system).toContain('"Online,');
    expect(system).toContain('"The FDA lists');
    expect(system).toMatch(/brand and product/);
    expect(system).toContain("A recall exists for a similar product; check the lot number.");
  });
});
