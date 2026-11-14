// Spell out unit abbreviations so the voice says "0 grams", not "zero gee".
// Display text keeps the compact form; only the text sent to text-to-speech goes through this.
// Copy of lib/speechText.ts (server), for the phone's own fallback voice.

type Unit = { re: string; one: string; many: string };

// Longest first, so "fl oz" wins over "oz" and "mg" over "g".
const UNITS: Unit[] = [
  { re: "fl\\.?\\s?oz\\.?", one: "fluid ounce", many: "fluid ounces" },
  { re: "kcal", one: "calorie", many: "calories" },
  { re: "mcg|µg", one: "microgram", many: "micrograms" },
  { re: "mg", one: "milligram", many: "milligrams" },
  { re: "kg", one: "kilogram", many: "kilograms" },
  { re: "mL|ml", one: "milliliter", many: "milliliters" },
  { re: "lbs?", one: "pound", many: "pounds" },
  { re: "oz\\.?", one: "ounce", many: "ounces" },
  { re: "g", one: "gram", many: "grams" },
  { re: "L", one: "liter", many: "liters" },
];

const NUM = "(\\d+(?:[.,]\\d+)?)";

export function speakableUnits(text: string, lang = "en-US"): string {
  if (!lang.toLowerCase().startsWith("en")) return text;
  let out = text;
  for (const u of UNITS) {
    // A number, optional space, the unit, then not followed by another letter or digit.
    out = out.replace(new RegExp(`${NUM}\\s?(?:${u.re})(?![A-Za-z0-9])`, "g"), (_m, n: string) =>
      `${n} ${Number(n.replace(",", ".")) === 1 ? u.one : u.many}`,
    );
  }
  out = out.replace(/(\d)\s?%\s?DV\b/g, "$1 percent daily value");
  out = out.replace(/(\d)\s?%/g, "$1 percent");
  out = out.replace(/\b(grams|milligrams|micrograms|ounces|milliliters|calories)\/(serving|can|bottle|day|package)\b/g, "$1 per $2");
  return out;
}
