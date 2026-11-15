// Splits text into sentence-sized pieces for speech. Pure, so it's unit-tested (chunk.test.ts).

const TERMINATOR = /[.!?。！？]/;
const CLOSER = /[.!?。！？"'”’)\]]/;
// Words that end in a "." without ending the sentence: "Dr.", "St.", "12 fl oz.", "9 a.m.",
// "e.g.", and single capital initials ("J. K. Rowling").
const ABBREVIATION =
  /(?:^|[\s(])(?:Dr|Mr|Mrs|Ms|Prof|St|Mt|Ft|Jr|Sr|Ave|Blvd|Rd|Hwy|Apt|Ste|No|vs|etc|approx|dept|est|fl|oz|lb|lbs|pt|qt|gal|tbsp|tsp|pkg|min|max|[ap]\.m|e\.g|i\.e|U\.S|[A-Z])\.$/i;

/** Sentences with their trailing spaces. A "." between digits ("6.50") or after a common
 *  abbreviation never ends a sentence, and "." "!" "?" end one only before a space or the end. */
export function splitSentences(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (!TERMINATOR.test(ch)) continue;
    let j = i + 1;
    while (j < text.length && CLOSER.test(text[j])) j++;
    const cjk = /[。！？]/.test(ch);
    if (!cjk) {
      if (j < text.length && !/\s/.test(text[j])) continue; // "6.50", "U.S.A", "example.com"
      if (ch === "." && j === i + 1 && ABBREVIATION.test(text.slice(start, i + 1))) continue;
    }
    while (j < text.length && /\s/.test(text[j])) j++;
    out.push(text.slice(start, j));
    start = j;
    i = j - 1;
  }
  if (start < text.length) out.push(text.slice(start));
  return out;
}

/** Speech chunks of at most `max` characters (`firstMax` for the first, so it comes back from
 *  the server sooner), split between sentences, or between words inside a very long sentence. */
export function chunk(text: string, max: number, firstMax = max): string[] {
  const sentences = splitSentences(text.replace(/\s+/g, " "));
  const out: string[] = [];
  let cur = "";
  for (const s of sentences.length ? sentences : [text]) {
    const limit = out.length ? max : firstMax;
    if ((cur + s).length > limit && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (const w of s.split(/\s+/)) {
        if ((cur + " " + w).length > max && cur) {
          out.push(cur.trim());
          cur = "";
        }
        cur += (cur ? " " : "") + w;
      }
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [text];
}
