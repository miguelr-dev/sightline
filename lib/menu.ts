import { MENU_TAGS, type Menu, type MenuItem, type MenuTag, type Section } from "@/lib/modes";

// Structured menus (Menu mode, or Auto choosing menu): the dishes by section, prices exactly as
// printed plus a parsed number for filters, and tags only where the menu marks them.

export const MENU_LIMITS = { sections: 12, itemsPerSection: 40, items: 150, name: 80, price: 24, description: 200 };

// Strict JSON schema: every field is required, with "" or [] for "not printed".
export const MENU_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: "string" },
                description: { type: "string" },
                tags: { type: "array", items: { type: "string", enum: [...MENU_TAGS] } },
              },
              required: ["name", "price", "description", "tags"],
              additionalProperties: false,
            },
          },
        },
        required: ["title", "items"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "sections"],
  additionalProperties: false,
} as const;

/** The first amount in a printed price: "$12.79" → 12.79, "12" → 12, "€8,50" → 8.5,
 *  "1,200" → 1200, "$7 / $12" → 7. "MP" or "Market price" → undefined. */
export function parsePrice(raw: string): number | undefined {
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:([.,])(\d{1,2}))?(?!\d)/.exec(raw ?? "");
  if (!m) return undefined;
  const whole = Number(m[1].replace(/,/g, ""));
  const value = m[3] ? Number(`${whole}.${m[3]}`) : whole;
  return Number.isFinite(value) ? value : undefined;
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Validates the model's menu: items need a name, sections need items, sizes are capped, and
 *  priceValue is always computed here. Undefined when nothing is left. */
export function cleanMenu(v: unknown): Menu | undefined {
  if (!v || typeof v !== "object") return undefined;
  const raw = v as { name?: unknown; sections?: unknown };
  if (!Array.isArray(raw.sections)) return undefined;
  let total = 0;
  const sections: Menu["sections"] = [];
  for (const s of raw.sections) {
    if (sections.length >= MENU_LIMITS.sections || total >= MENU_LIMITS.items) break;
    if (!s || typeof s !== "object" || !Array.isArray((s as { items?: unknown }).items)) continue;
    const items: MenuItem[] = [];
    for (const it of (s as { items: unknown[] }).items) {
      if (items.length >= MENU_LIMITS.itemsPerSection || total >= MENU_LIMITS.items) break;
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const name = text(r.name, MENU_LIMITS.name);
      if (!name) continue;
      const price = text(r.price, MENU_LIMITS.price);
      const priceValue = price ? parsePrice(price) : undefined;
      const description = text(r.description, MENU_LIMITS.description);
      const tags = Array.isArray(r.tags)
        ? [...new Set(r.tags.filter((t): t is MenuTag => MENU_TAGS.includes(t as MenuTag)))]
        : [];
      items.push({
        name,
        ...(price ? { price } : {}),
        ...(priceValue !== undefined ? { priceValue } : {}),
        ...(description ? { description } : {}),
        ...(tags.length ? { tags } : {}),
      });
      total++;
    }
    if (items.length) sections.push({ title: text((s as { title?: unknown }).title, 60) || "Menu", items });
  }
  if (!sections.length) return undefined;
  const name = text(raw.name, MENU_LIMITS.name);
  return { ...(name ? { name } : {}), sections };
}

const TAG_WORDS: Record<MenuTag, string> = {
  vegetarian: "vegetarian",
  vegan: "vegan",
  gluten_free: "gluten free",
  spicy: "spicy",
  contains_nuts: "contains nuts",
};

/** The flat sections older clients show: one per menu heading, one line per dish. */
export function menuToSections(menu: Menu): Section[] {
  return menu.sections.map((s) => ({
    title: s.title,
    body: s.items
      .map((i) => {
        const tags = i.tags?.length ? ` (${i.tags.map((t) => TAG_WORDS[t]).join(", ")})` : "";
        const head = `${i.name}${i.price ? `, ${i.price}` : ""}${tags}`;
        return i.description ? `${head}. ${i.description}` : head;
      })
      .join("\n"),
    provenance: "label" as const,
  }));
}
