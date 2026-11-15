import { MENU_TAGS, type Menu, type MenuItem, type MenuTag } from "../modes";

// The menu view's logic (tested in menu.test.ts): checking the server's menu, quick filters,
// and what each row and "Read this section" say.

const LIMITS = { sections: 12, itemsPerSection: 40, items: 150 };

/** The first amount in a printed price: "$12.79" → 12.79, "12" → 12, "€8,50" → 8.5. "MP" → none.
 *  Same rule as the server's lib/menu.ts. */
export function parsePrice(raw: string): number | undefined {
  const m = /(\d{1,3}(?:,\d{3})+|\d+)(?:([.,])(\d{1,2}))?(?!\d)/.exec(raw ?? "");
  if (!m) return undefined;
  const whole = Number(m[1].replace(/,/g, ""));
  const value = m[3] ? Number(`${whole}.${m[3]}`) : whole;
  return Number.isFinite(value) ? value : undefined;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The server's menu, checked: named items only, non-empty sections, known tags, capped. */
export function parseMenu(v: unknown): Menu | undefined {
  if (!v || typeof v !== "object" || !Array.isArray((v as { sections?: unknown }).sections)) return undefined;
  let total = 0;
  const sections: Menu["sections"] = [];
  for (const s of (v as { sections: unknown[] }).sections) {
    if (sections.length >= LIMITS.sections || total >= LIMITS.items) break;
    const rawItems = s && typeof s === "object" ? (s as { items?: unknown }).items : undefined;
    if (!Array.isArray(rawItems)) continue;
    const items: MenuItem[] = [];
    for (const it of rawItems) {
      if (items.length >= LIMITS.itemsPerSection || total >= LIMITS.items) break;
      if (!it || typeof it !== "object") continue;
      const r = it as Record<string, unknown>;
      const name = str(r.name, 80);
      if (!name) continue;
      const price = str(r.price, 24);
      const priceValue =
        typeof r.priceValue === "number" && Number.isFinite(r.priceValue) ? r.priceValue : price ? parsePrice(price) : undefined;
      const description = str(r.description, 200);
      const tags = Array.isArray(r.tags) ? [...new Set(r.tags.filter((t): t is MenuTag => MENU_TAGS.includes(t as MenuTag)))] : [];
      items.push({
        name,
        ...(price ? { price } : {}),
        ...(priceValue !== undefined ? { priceValue } : {}),
        ...(description ? { description } : {}),
        ...(tags.length ? { tags } : {}),
      });
      total++;
    }
    if (items.length) sections.push({ title: str((s as { title?: unknown }).title, 60) || "Menu", items });
  }
  if (!sections.length) return undefined;
  const name = str((v as { name?: unknown }).name, 80);
  return { ...(name ? { name } : {}), sections };
}

export const TAG_LABELS: Record<MenuTag, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  gluten_free: "Gluten free",
  spicy: "Spicy",
  contains_nuts: "Contains nuts",
};
const tagWords = (tags: MenuTag[] | undefined) => (tags ?? []).map((t) => TAG_LABELS[t].toLowerCase());

const CURRENCY_WORDS: Record<string, string> = { $: "dollars", "€": "euros", "£": "pounds", "¥": "yen" };

/** The currency sign the menu prints ("$" when none is printed). */
export function menuCurrency(menu: Menu): string {
  for (const s of menu.sections) {
    for (const i of s.items) {
      const m = /[$€£¥]/.exec(i.price ?? "");
      if (m) return m[0];
    }
  }
  return "$";
}

export type MenuFilter = "under10" | "vegetarian" | "gluten_free" | "spicy";

const matches = (i: MenuItem, f: MenuFilter): boolean => {
  if (f === "under10") return i.priceValue !== undefined && i.priceValue < 10;
  if (f === "vegetarian") return !!i.tags?.some((t) => t === "vegetarian" || t === "vegan");
  return !!i.tags?.includes(f);
};

/** Only the filters this menu can answer: prices printed, or tags that appear on it. */
export function menuFilters(menu: Menu): { id: MenuFilter; label: string }[] {
  const items = menu.sections.flatMap((s) => s.items);
  const out: { id: MenuFilter; label: string }[] = [];
  if (items.some((i) => i.priceValue !== undefined)) out.push({ id: "under10", label: `Under ${menuCurrency(menu)}10` });
  const tagFilters: [MenuFilter, string][] = [
    ["vegetarian", "Vegetarian"],
    ["gluten_free", "Gluten free"],
    ["spicy", "Spicy"],
  ];
  for (const [id, label] of tagFilters) {
    if (items.some((i) => matches(i, id))) out.push({ id, label });
  }
  return out;
}

export type ShownSection = { title: string; index: number; items: { item: MenuItem; index: number }[] };

/** The sections and dishes to show for a filter (null = all), keeping their original indexes. */
export function applyMenuFilter(menu: Menu, filter: MenuFilter | null): ShownSection[] {
  return menu.sections
    .map((s, index) => ({
      title: s.title,
      index,
      items: s.items.map((item, i) => ({ item, index: i })).filter(({ item }) => !filter || matches(item, filter)),
    }))
    .filter((s) => s.items.length);
}

/** "4 dishes under 10 dollars", for VoiceOver when a filter changes. */
export function filterAnnouncement(count: number, filter: MenuFilter | null, currency: string): string {
  const dishes = count === 1 ? "dish" : "dishes";
  if (!filter) return `All ${count} ${dishes}`;
  if (filter === "under10") return `${count || "No"} ${dishes} under 10 ${CURRENCY_WORDS[currency] ?? "dollars"}`;
  const word = TAG_LABELS[filter].toLowerCase();
  return count ? `${count} ${word} ${dishes}` : `No ${word} dishes`;
}

/** The price to say: as printed, with the menu's "$" added to a bare number; "MP" is "market price". */
function spokenPrice(i: MenuItem, currency: string): string {
  const p = i.price ?? "";
  if (!p) return "";
  if (/^(mp|m\.p\.|market( price)?)$/i.test(p)) return "market price";
  return currency === "$" && /^\d/.test(p) ? `$${p}` : p;
}

/** One dish, read when its row is tapped: name, price, tags, then the description. */
export function itemSpeech(i: MenuItem, currency: string): string {
  const head = [i.name, spokenPrice(i, currency), ...tagWords(i.tags)].filter(Boolean).join(", ");
  if (!i.description) return `${head}.`;
  return `${head}. ${/[.!?]$/.test(i.description) ? i.description : `${i.description}.`}`;
}

/** The row's VoiceOver label: "Grilled Chicken Plate, $12.79, Main Course". */
export function itemLabel(i: MenuItem, section: string): string {
  return [i.name, i.price, section, ...tagWords(i.tags)].filter(Boolean).join(", ");
}

export const rowOwner = (prefix: string, section: number, item: number) => `${prefix}-${section}-${item}`;

/** "Read this section": the title, then each shown dish's name and price (no descriptions). */
export function sectionReadQueue(s: ShownSection, prefix: string, currency: string): { owner: string; text: string }[] {
  return [
    { owner: `${prefix}-${s.index}-title`, text: `${s.title}.` },
    ...s.items.map(({ item, index }) => ({
      owner: rowOwner(prefix, s.index, index),
      text: `${[item.name, spokenPrice(item, currency)].filter(Boolean).join(", ")}.`,
    })),
  ];
}
