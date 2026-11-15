import { beforeEach, describe, expect, it, vi } from "vitest";

// Structured menus: dishes with prices exactly as printed, a parsed price for filters, tags only
// when printed, and the flat sections kept as the fallback for older clients.

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

import { cleanMenu, MENU_LIMITS, menuToSections, parsePrice } from "@/lib/menu";
import { MENU_TAGS } from "@/lib/modes";
import { PROMPT_VERSION, systemPrompt } from "@/lib/prompts";
import { analyzePhoto } from "@/lib/analyze";
import { askJson } from "@/lib/claude";

const IMAGE = "/9j/" + "A".repeat(200);

describe("parsePrice", () => {
  it.each([
    ["$12.79", 12.79],
    ["12", 12],
    ["12.5", 12.5],
    ["$7 / $12", 7],
    ["€8,50", 8.5],
    ["1,200", 1200],
    ["¥1,200", 1200],
    ["  $ 9.00 ", 9],
  ])("%s → %s", (raw, value) => {
    expect(parsePrice(raw)).toBe(value);
  });

  it.each(["MP", "Market price", "market", "", "free?"])("%j → no value", (raw) => {
    expect(parsePrice(raw)).toBeUndefined();
  });
});

describe("cleanMenu", () => {
  const raw = {
    name: " Retro Family Restaurant ",
    sections: [
      {
        title: "Main Course",
        items: [
          { name: "Grilled Chicken Plate", price: "$12.79", description: "Tender grilled chicken with garlic rice.", tags: ["spicy", "made-up"] },
          { name: "  ", price: "$3" },
          { name: "Fish of the Day", price: "MP", description: "", tags: [] },
        ],
      },
      { title: "Empty", items: [{ name: "" }] },
      { title: "", items: [{ name: "Orphan", price: "4" }] },
    ],
  };

  it("keeps named items, prices as printed, a parsed priceValue and only known tags", () => {
    const m = cleanMenu(raw)!;
    expect(m.name).toBe("Retro Family Restaurant");
    expect(m.sections.map((s) => s.title)).toEqual(["Main Course", "Menu"]);
    expect(m.sections[0].items).toEqual([
      { name: "Grilled Chicken Plate", price: "$12.79", priceValue: 12.79, description: "Tender grilled chicken with garlic rice.", tags: ["spicy"] },
      { name: "Fish of the Day", price: "MP" },
    ]);
    expect(m.sections[1].items).toEqual([{ name: "Orphan", price: "4", priceValue: 4 }]);
  });

  it("ignores a priceValue sent by the model and computes its own", () => {
    const m = cleanMenu({ sections: [{ title: "A", items: [{ name: "Tea", price: "$2.50", priceValue: 99 }] }] })!;
    expect(m.sections[0].items[0].priceValue).toBe(2.5);
  });

  it("is undefined when there's nothing to show", () => {
    expect(cleanMenu(undefined)).toBeUndefined();
    expect(cleanMenu({ name: "X", sections: [] })).toBeUndefined();
    expect(cleanMenu({ sections: [{ title: "A", items: [{ name: "" }] }] })).toBeUndefined();
    expect(cleanMenu("menu")).toBeUndefined();
  });

  it("caps the size", () => {
    const many = {
      sections: Array.from({ length: 30 }, (_, i) => ({
        title: `S${i}`,
        items: Array.from({ length: 80 }, (_, j) => ({ name: `Dish ${i}-${j}`, price: "5", description: "x".repeat(900) })),
      })),
    };
    const m = cleanMenu(many)!;
    expect(m.sections.length).toBeLessThanOrEqual(MENU_LIMITS.sections);
    for (const s of m.sections) expect(s.items.length).toBeLessThanOrEqual(MENU_LIMITS.itemsPerSection);
    expect(m.sections.reduce((n, s) => n + s.items.length, 0)).toBeLessThanOrEqual(MENU_LIMITS.items);
    expect(m.sections[0].items[0].description!.length).toBeLessThanOrEqual(MENU_LIMITS.description);
  });

  it("tags are the five known ones", () => {
    expect(MENU_TAGS).toEqual(["vegetarian", "vegan", "gluten_free", "spicy", "contains_nuts"]);
  });
});

describe("menuToSections (fallback for older clients)", () => {
  it("one section per menu heading, one line per dish", () => {
    const m = cleanMenu({
      sections: [
        {
          title: "Desserts",
          items: [
            { name: "Lemon Sorbet", price: "$6.50", description: "", tags: ["vegan", "gluten_free"] },
            { name: "Lava Cake", price: "", description: "Warm chocolate.", tags: [] },
          ],
        },
      ],
    })!;
    expect(menuToSections(m)).toEqual([
      { title: "Desserts", body: "Lemon Sorbet, $6.50 (vegan, gluten free)\nLava Cake. Warm chocolate.", provenance: "label" },
    ]);
  });
});

describe("analyzePhoto with a menu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  const reply = {
    chosenMode: "menu",
    spokenText: "Harbor Table lunch menu: three sections, 6.50 to 24 dollars.",
    sections: [{ title: "Dietary notes", body: "V vegetarian, GF gluten free. Ask about allergens." }],
    itemKind: "restaurant",
    webQuery: "Harbor Table menu hours reviews allergens",
    brand: "",
    barcode: "",
    spokenLanguage: "en",
    menu: {
      name: "Harbor Table",
      sections: [
        { title: "Starters", items: [{ name: "Tomato Basil Soup", price: "$7.50", description: "", tags: ["vegetarian"] }] },
        { title: "Desserts", items: [{ name: "Lemon Sorbet", price: "$6.50", description: "", tags: ["vegan"] }] },
      ],
    },
  };

  it("asks for the menu in Menu and Auto modes, and returns it with the flat sections too", async () => {
    vi.mocked(askJson).mockResolvedValue(reply);
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    const call = vi.mocked(askJson).mock.calls[0][1];
    const schema = call.schema as { properties: Record<string, unknown>; required: string[] };
    expect(schema.properties.menu).toBeDefined();
    expect(schema.required).toContain("menu");
    expect(call.system).toMatch(/exactly as printed/);
    expect(r.body.menu?.name).toBe("Harbor Table");
    expect(r.body.menu?.sections[0].items[0]).toMatchObject({ price: "$7.50", priceValue: 7.5, tags: ["vegetarian"] });
    expect(r.body.sections?.map((s) => s.title)).toEqual(["Starters", "Desserts", "Dietary notes"]);
    expect(r.body.spokenText).toBe(reply.spokenText);

    vi.mocked(askJson).mockResolvedValue({ ...reply, chosenMode: undefined });
    await analyzePhoto({ image: IMAGE + "B", mode: "menu", language: "English" });
    expect((vi.mocked(askJson).mock.calls[1][1].schema as { properties: Record<string, unknown> }).properties.menu).toBeDefined();
  });

  it("no menu when the photo isn't a menu, or for other modes", async () => {
    vi.mocked(askJson).mockResolvedValue({ ...reply, chosenMode: "read" });
    const r = await analyzePhoto({ image: IMAGE, mode: "auto", language: "English" });
    expect(r.body.menu).toBeUndefined();
    vi.mocked(askJson).mockResolvedValue({ ...reply, chosenMode: undefined });
    await analyzePhoto({ image: IMAGE + "C", mode: "read", language: "English" });
    expect((vi.mocked(askJson).mock.calls[1][1].schema as { properties: Record<string, unknown> }).properties.menu).toBeUndefined();
  });

  it("follow-up questions and conversations still work, without re-sending the whole menu", async () => {
    vi.mocked(askJson).mockResolvedValue({ spokenText: "The Lemon Sorbet, 6.50 dollars.", sections: [], itemKind: "restaurant", webQuery: "", brand: "", barcode: "", spokenLanguage: "en" });
    const r = await analyzePhoto({
      image: IMAGE,
      mode: "menu",
      language: "English",
      question: "which is cheapest",
      conversation: [{ question: "what's vegetarian", answer: "The soup and the sorbet." }],
    });
    const call = vi.mocked(askJson).mock.calls[0][1];
    expect((call.schema as { properties: Record<string, unknown> }).properties.menu).toBeUndefined();
    expect(String(call.content[1] && (call.content[1] as { text: string }).text)).toMatch(/what's vegetarian/);
    expect(r.body.spokenText).toMatch(/Sorbet/);
    expect(r.body.menu).toBeUndefined();
  });

  it("the menu prompt: tags only when printed, prices as printed", () => {
    const p = systemPrompt("menu", "English", { menu: true });
    expect(p).toMatch(/never guess/i);
    expect(p).toMatch(/exactly as printed/);
    expect(systemPrompt("menu", "English")).not.toMatch(/contains_nuts/);
    expect(PROMPT_VERSION).not.toBe("2026-11-14.12"); // before structured menus
  });
});
