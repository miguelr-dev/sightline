import { describe, expect, it } from "vitest";
import {
  applyMenuFilter,
  filterAnnouncement,
  itemLabel,
  itemSpeech,
  menuCurrency,
  menuFilters,
  parseMenu,
  parsePrice,
  sectionReadQueue,
} from "./menu";
import { speakable } from "./speechText";
import type { Menu } from "../modes";

const MENU: Menu = {
  name: "Retro Family Restaurant",
  sections: [
    {
      title: "Main Course",
      items: [
        { name: "Grilled Chicken Plate", price: "$12.79", priceValue: 12.79, description: "Tender grilled chicken served with vegetables and garlic rice." },
        { name: "Fish Tacos", price: "$9.50", priceValue: 9.5, tags: ["spicy"] },
      ],
    },
    {
      title: "Salads & Soups",
      items: [
        { name: "Garden Fresh Salad", price: "$7.49", priceValue: 7.49, tags: ["vegan", "gluten_free"] },
        { name: "Tomato Basil Soup", price: "$4.99", priceValue: 4.99, tags: ["vegetarian"] },
        { name: "Soup of the Day", price: "MP" },
      ],
    },
  ],
};

describe("parsePrice", () => {
  it.each([
    ["$12.79", 12.79],
    ["12", 12],
    ["€8,50", 8.5],
    ["1,200", 1200],
  ])("%s → %s", (raw, v) => expect(parsePrice(raw)).toBe(v));

  it.each(["MP", "Market price", ""])("%j → no value", (raw) => expect(parsePrice(raw)).toBeUndefined());
});

describe("parseMenu (the app's own check of the server's menu)", () => {
  it("keeps valid items, drops unnamed ones and empty sections, and fills priceValue", () => {
    const m = parseMenu({
      name: "Diner",
      sections: [
        { title: "Mains", items: [{ name: "Burger", price: "$15" }, { name: "" }, { price: "$3" }, "junk"] },
        { title: "Empty", items: [] },
        { title: "Drinks", items: [{ name: "Tea", price: "MP", tags: ["spicy", "nope"] }] },
      ],
    });
    expect(m).toEqual({
      name: "Diner",
      sections: [
        { title: "Mains", items: [{ name: "Burger", price: "$15", priceValue: 15 }] },
        { title: "Drinks", items: [{ name: "Tea", price: "MP", tags: ["spicy"] }] },
      ],
    });
  });

  it("is undefined for anything that isn't a menu", () => {
    for (const v of [undefined, null, "menu", { sections: [] }, { sections: [{ title: "A", items: [{ name: " " }] }] }]) {
      expect(parseMenu(v)).toBeUndefined();
    }
  });
});

describe("quick filters", () => {
  it("offers only what the menu supports", () => {
    expect(menuFilters(MENU).map((f) => f.label)).toEqual(["Under $10", "Vegetarian", "Gluten free", "Spicy"]);
    const plain: Menu = { sections: [{ title: "A", items: [{ name: "Tea", price: "$2", priceValue: 2 }] }] };
    expect(menuFilters(plain).map((f) => f.id)).toEqual(["under10"]);
    expect(menuFilters({ sections: [{ title: "A", items: [{ name: "Tea" }] }] })).toEqual([]);
  });

  it("filters the list and keeps where each dish came from", () => {
    const under = applyMenuFilter(MENU, "under10");
    expect(under.map((s) => [s.title, s.items.map((i) => i.item.name)])).toEqual([
      ["Main Course", ["Fish Tacos"]],
      ["Salads & Soups", ["Garden Fresh Salad", "Tomato Basil Soup"]],
    ]);
    expect(under[1].index).toBe(1);
    expect(under[1].items[1].index).toBe(1);
    // Vegan dishes are vegetarian too.
    expect(applyMenuFilter(MENU, "vegetarian").flatMap((s) => s.items.map((i) => i.item.name))).toEqual(["Garden Fresh Salad", "Tomato Basil Soup"]);
    expect(applyMenuFilter(MENU, null).flatMap((s) => s.items)).toHaveLength(5);
  });

  it("announces the count for VoiceOver", () => {
    expect(filterAnnouncement(4, "under10", "$")).toBe("4 dishes under 10 dollars");
    expect(filterAnnouncement(1, "vegetarian", "$")).toBe("1 vegetarian dish");
    expect(filterAnnouncement(2, "gluten_free", "$")).toBe("2 gluten free dishes");
    expect(filterAnnouncement(0, "spicy", "$")).toBe("No spicy dishes");
    expect(filterAnnouncement(5, null, "$")).toBe("All 5 dishes");
    expect(filterAnnouncement(3, "under10", "€")).toBe("3 dishes under 10 euros");
  });

  it("finds the menu's currency", () => {
    expect(menuCurrency(MENU)).toBe("$");
    expect(menuCurrency({ sections: [{ title: "A", items: [{ name: "x", price: "€8,50" }] }] })).toBe("€");
    expect(menuCurrency({ sections: [{ title: "A", items: [{ name: "x", price: "12" }] }] })).toBe("$");
  });
});

describe("row speech", () => {
  const chicken = MENU.sections[0].items[0];

  it("reads one dish: name, price, then description, with spoken numbers", () => {
    expect(itemSpeech(chicken, "$")).toBe("Grilled Chicken Plate, $12.79. Tender grilled chicken served with vegetables and garlic rice.");
    expect(speakable(itemSpeech(chicken, "$"))).toBe(
      "Grilled Chicken Plate, twelve dollars and seventy-nine cents. Tender grilled chicken served with vegetables and garlic rice.",
    );
  });

  it("says a bare price in the menu's currency, tags in words, and 'market price' for MP", () => {
    expect(speakable(itemSpeech({ name: "Burger", price: "15", priceValue: 15 }, "$"))).toBe("Burger, fifteen dollars.");
    expect(itemSpeech(MENU.sections[1].items[0], "$")).toBe("Garden Fresh Salad, $7.49, vegan, gluten free.");
    expect(itemSpeech(MENU.sections[1].items[2], "$")).toBe("Soup of the Day, market price.");
    expect(itemSpeech({ name: "Tea" }, "$")).toBe("Tea.");
  });

  it("labels each row for VoiceOver with name, price and section", () => {
    expect(itemLabel(chicken, "Main Course")).toBe("Grilled Chicken Plate, $12.79, Main Course");
    expect(itemLabel(MENU.sections[0].items[1], "Main Course")).toBe("Fish Tacos, $9.50, Main Course, spicy");
  });
});

describe("Read this section", () => {
  it("reads the title, then each dish's name and price in order, descriptions skipped", () => {
    const shown = applyMenuFilter(MENU, null)[0];
    expect(sectionReadQueue(shown, "m-3", "$")).toEqual([
      { owner: "m-3-0-title", text: "Main Course." },
      { owner: "m-3-0-0", text: "Grilled Chicken Plate, $12.79." },
      { owner: "m-3-0-1", text: "Fish Tacos, $9.50." },
    ]);
  });

  it("reads only the dishes the filter shows, with their own row owners", () => {
    const shown = applyMenuFilter(MENU, "vegetarian")[0];
    expect(sectionReadQueue(shown, "m-3", "$").map((x) => x.owner)).toEqual(["m-3-1-title", "m-3-1-0", "m-3-1-1"]);
  });
});
