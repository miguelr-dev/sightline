// Spell out unit abbreviations so the voice says "0 grams", not "zero gee".
// Display text keeps the compact form; only the text sent to text-to-speech goes through this.
// A copy lives in mobile/src/logic/speechText.ts for the phone's own fallback voice.

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

// ---- numbers → words (ElevenLabs' fast model mispronounces bare digits: "10" as "tee ten") ----

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ORDINAL_FIX: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };

function under100(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "");
}

function under1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} hundred` : "", r || !h ? under100(r) : ""].filter(Boolean).join(" ");
}

/** Whole numbers up to the billions, as words. */
export function cardinal(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (n >= size) {
      parts.push(`${under1000(Math.floor(n / size))} ${name}`);
      n %= size;
    }
  }
  if (n) parts.push(under1000(n));
  return parts.join(" ");
}

function ordinal(n: number): string {
  const words = cardinal(n);
  const m = words.match(/(\w+)$/);
  if (!m) return words;
  const last = m[1];
  const fixed = ORDINAL_FIX[last] ?? (last.endsWith("y") ? `${last.slice(0, -1)}ieth` : `${last}th`);
  return words.slice(0, -last.length) + fixed;
}

function year(n: number): string {
  const hi = Math.floor(n / 100);
  const lo = n % 100;
  if (lo === 0) return `${under100(hi)} hundred`;
  return `${under100(hi)} ${lo < 10 ? `oh ${ONES[lo]}` : under100(lo)}`;
}

const digits = (s: string) => s.split("").map((d) => ONES[Number(d)]).join(" ");
const int = (s: string) => Number(s.replace(/,/g, ""));
const B = "(?<![A-Za-z0-9.,/$:])"; // not glued to a word, code or another number
const E = "(?![A-Za-z0-9])";

function money(whole: string, cents?: string): string {
  const d = int(whole);
  const c = cents ? Number(cents) : 0;
  const dollars = `${cardinal(d)} ${d === 1 ? "dollar" : "dollars"}`;
  return c ? `${dollars} and ${cardinal(c)} ${c === 1 ? "cent" : "cents"}` : dollars;
}

export function speakNumbers(text: string, lang = "en-US"): string {
  if (!lang.toLowerCase().startsWith("en")) return text;
  let out = text;
  // Ordinals: 1st, 22nd.
  out = out.replace(new RegExp(`${B}(\\d{1,3})(st|nd|rd|th)${E}`, "g"), (_m, n: string) => ordinal(Number(n)));
  // Money: $12.76, $5, "7.50 dollars".
  out = out.replace(/\$(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?(?![\d])/g, (_m, w: string, c?: string) => money(w, c));
  out = out.replace(new RegExp(`${B}(\\d+)\\.(\\d{2}) dollars${E}`, "g"), (_m, w: string, c: string) => money(w, c));
  // Month/year: 08/2027.
  out = out.replace(new RegExp(`${B}(0?[1-9]|1[0-2])/((?:19|20)\\d{2})${E}`, "g"), (_m, m: string, y: string) => `${MONTHS[Number(m) - 1]} ${year(Number(y))}`);
  // Clock times: 11:30, 9:05, 11:00.
  out = out.replace(new RegExp(`${B}([01]?\\d|2[0-3]):([0-5]\\d)${E}`, "g"), (_m, h: string, mm: string) => {
    const mins = Number(mm);
    return `${cardinal(Number(h))} ${mins === 0 ? "o'clock" : mins < 10 ? `oh ${ONES[mins]}` : under100(mins)}`;
  });
  // Long codes (barcodes, phone numbers): digit by digit.
  out = out.replace(new RegExp(`${B}(\\d{7,})${E}`, "g"), (_m, d: string) => digits(d));
  // Decimals: 8.4 → eight point four.
  out = out.replace(new RegExp(`${B}(\\d+)\\.(\\d+)${E}`, "g"), (_m, w: string, f: string) => `${cardinal(Number(w))} point ${digits(f)}`);
  // Years on their own: 2026 → twenty twenty-six.
  out = out.replace(new RegExp(`${B}((?:19|20)\\d{2})${E}(?!\\s?(?:grams|gram|milligrams|calories|ounces|fluid|milliliters|people|mg|g\\b))`, "g"), (_m, y: string) => year(Number(y)));
  // Everything else: whole numbers, with or without thousands commas.
  out = out.replace(new RegExp(`${B}(\\d{1,3}(?:,\\d{3})+|\\d+)${E}`, "g"), (_m, n: string) => cardinal(int(n)));
  return out;
}

/** Everything the voice needs: units spelled out, then numbers as words. */
export function speakable(text: string, lang = "en-US"): string {
  return speakNumbers(speakableUnits(text, lang), lang);
}

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
