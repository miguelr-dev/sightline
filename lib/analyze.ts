import Anthropic from "@anthropic-ai/sdk";
import {
  ITEM_KINDS,
  MODES,
  SPEECH_LANGUAGES,
  spokenLanguageCode,
  type AnalyzeResponse,
  type ItemKind,
  type ConversationTurn,
  type Mode,
  type RequestMode,
  type Section,
} from "@/lib/modes";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { PROMPT_VERSION, systemPrompt, userPrompt } from "@/lib/prompts";
import { BOOK_SCHEMA, bookSystemPrompt, buildPage, type BookReply } from "@/lib/book";
import { imageMediaType } from "@/lib/http";
import {
  analysisKey,
  dbConfigured,
  getCachedAnalysis,
  insertScan,
  putCachedAnalysis,
  recentScanId,
} from "@/lib/db";
import {
  SECTIONS_SCHEMA,
  analyzeModel,
  askJson,
  bookModel,
  cleanSections,
  sectionsToText,
} from "@/lib/claude";
import { lookupPhotoBarcode, productIdentity, type BarcodeResult } from "@/lib/barcode";
import { GENERIC_WORDS } from "@/lib/hat";
import { cleanMenu, MENU_SCHEMA, menuToSections } from "@/lib/menu";

// Server-only: read a photo with Claude, with the Neon analysis cache and scan history.
// Used by /api/analyze and by the hat camera's /api/device/frame.

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    spokenText: { type: "string" },
    sections: SECTIONS_SCHEMA,
    itemKind: { type: "string", enum: [...ITEM_KINDS] },
    webQuery: { type: "string" },
    brand: { type: "string" }, // as printed, or empty
    barcode: { type: "string" }, // digits printed under a UPC/EAN barcode, or empty
    spokenLanguage: { type: "string", enum: SPEECH_LANGUAGES }, // the language of spokenText
  },
  required: ["spokenText", "sections", "itemKind", "webQuery", "brand", "barcode", "spokenLanguage"],
  additionalProperties: false,
} as const;

// Auto mode: the model also says which mode it chose for this photo, in the same call.
const AUTO_SCHEMA = {
  ...OUTPUT_SCHEMA,
  properties: { chosenMode: { type: "string", enum: [...MODES] }, ...OUTPUT_SCHEMA.properties },
  required: ["chosenMode", ...OUTPUT_SCHEMA.required],
} as const;

// Menu and Auto without a question: the model also returns the structured menu (lib/menu.ts).
const withMenu = <T extends { properties: object; required: readonly string[] }>(schema: T) => ({
  ...schema,
  properties: { ...schema.properties, menu: MENU_SCHEMA },
  required: [...schema.required, "menu"],
});
const MENU_OUTPUT_SCHEMA = withMenu(OUTPUT_SCHEMA);
const MENU_AUTO_SCHEMA = withMenu(AUTO_SCHEMA);

// Search angle words, dropped when turning a web query into a short history title.
const ANGLE_WORDS =
  /\b(nutrition|facts|caffeine|sugar|price|uses|recalls?|fda|warnings?|reviews?|menu|hours|allergens?|summary)\b/gi;

function scanTitle(r: AnalyzeResponse): string {
  if (r.page) {
    const start = r.page.text
      .split(/\s+/)
      .slice(0, 6)
      .join(" ")
      .replace(/[.,;:]+$/, "");
    return `${r.page.pageNumber ? `Page ${r.page.pageNumber}: ` : ""}${start}`.slice(0, 80);
  }
  const fromQuery = (r.webQuery ?? "")
    .replace(ANGLE_WORDS, " ")
    .replace(/\b\d{8,14}\b/g, " ") // a UPC from a barcode in the photo
    .replace(/\s+/g, " ")
    .trim();
  if (fromQuery) return fromQuery.slice(0, 80);
  const words = r.spokenText.split(/\s+/).slice(0, 8).join(" ");
  return words.replace(/[.,;:]+$/, "").slice(0, 80);
}

function slug(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s || undefined;
}

export type AnalyzeInput = {
  image: string; // base64 JPEG, no data: prefix
  mode: RequestMode; // "auto": the model chooses the mode for this photo
  language: string; // a name from LANGUAGES
  question?: string;
  /** false: the question comes with a fresh photo ("ask while looking"), not a follow-up. */
  isFollowUp?: boolean;
  key?: string; // target id from a frame check, saved with the scan
  device?: string; // history owner (the phone's x-sightline-device ID)
  /** Book mode (with mode "read"): the exact full page, its sentences and signature. */
  book?: boolean;
  /** Earlier questions and answers about this same photo or page (at most MAX_TURNS). */
  conversation?: ConversationTurn[];
  /** "after" (default): write cache and history after the response is sent. "await": write now.
   *  "defer": start writing now and return the write as `saved`, for the caller to await later. */
  persist?: "after" | "await" | "defer";
};

export type AnalyzeResult = {
  body: AnalyzeResponse;
  status: number;
  saved?: Promise<void>;
  mode?: Mode; // the mode the answer was made in (what "auto" chose)
};

/** Cache the answer and save it to the device's history, then return it with its scan id. */
async function finish(
  result: AnalyzeResponse,
  ctx: {
    cacheKey: string;
    device?: string;
    mode: Mode;
    key?: string;
    cached: boolean;
    priorScan?: Promise<string | undefined>;
  },
  persist: "after" | "await" | "defer",
): Promise<AnalyzeResult> {
  let scanId: string | undefined;
  if (ctx.device && dbConfigured()) {
    // A replay or retry of the same photo reuses the history entry made a moment ago.
    scanId = (ctx.cached && (await ctx.priorScan)) || randomUUID();
  }
  const body: AnalyzeResponse = {
    ...result,
    ...(scanId ? { scanId } : {}),
    ...(ctx.cached ? { cached: true } : {}),
  };
  const save = async () => {
    if (!ctx.cached) await putCachedAnalysis(ctx.cacheKey, result);
    if (ctx.device && scanId) {
      await insertScan({
        id: scanId,
        device: ctx.device,
        mode: ctx.mode,
        itemKind: result.itemKind,
        key: ctx.key,
        title: scanTitle(result),
        spokenText: result.spokenText,
        sections: result.sections ?? [],
        analysisKey: ctx.cacheKey,
      });
    }
  };
  if (persist === "await") await save();
  else if (persist === "defer") return { body, status: 200, saved: save(), mode: ctx.mode };
  else after(save);
  return { body, status: 200, mode: ctx.mode };
}

type Parsed = {
  chosenMode?: unknown;
  spokenText?: unknown;
  sections?: unknown;
  webQuery?: unknown;
  itemKind?: unknown;
  brand?: unknown;
  barcode?: unknown;
  spokenLanguage?: unknown;
  menu?: unknown;
};

function fail(spokenText: string, status: number): AnalyzeResult {
  return { body: { spokenText, details: "", error: true }, status };
}

export function slugKey(v: unknown): string | undefined {
  return slug(v);
}

/** Read one photo: from the cache if this exact request was answered before, else with Claude. */
export const MAX_TURNS = 6;

/** The last MAX_TURNS well-formed turns, trimmed and capped in length. */
export function cleanConversation(v: unknown): ConversationTurn[] {
  if (!Array.isArray(v)) return [];
  const turns: ConversationTurn[] = [];
  for (const t of v) {
    if (!t || typeof t !== "object") continue;
    const { question, answer } = t as Record<string, unknown>;
    if (typeof question !== "string" || typeof answer !== "string") continue;
    const q = question.trim().slice(0, 300);
    const a = answer.trim().slice(0, 600);
    if (q && a) turns.push({ question: q, answer: a });
  }
  return turns.slice(-MAX_TURNS);
}

/** Sections about what isn't there ("Not visible", "Missing information") say nothing useful. */
const EMPTY_SECTION = /not visible|missing|unknown|not shown/i;
// A clause that only says something isn't in the photo: "Not visible on this label", "cut off".
const NOT_THERE =
  /\b(?:not|isn't|aren't|is not|are not|can't be|cannot be)\s+(?:clearly\s+|fully\s+)?(?:visible|shown|readable|legible|in view|in (?:the|this) (?:photo|frame|image|picture))\b|\bcut off\b|\bunreadable\b|\billegible\b|\bout of (?:the )?frame\b|^on (?:the|another|the other) (?:back|side)\b/i;
// A retake tip that goes with such a note: "turn the can to read them".
const RETAKE_TIP = /^(?:turn|rotate|move|hold|tilt|flip|try|check)\b/i;
// Sections worth a one-line pointer when they had to be dropped.
const IMPORTANT = /ingredients?|nutrition|allergens?|warnings?|directions|expir|best by|use by|dosage/gi;

/** The body without its "isn't visible" clauses and their retake tips. A clause with a number in
 *  it ("10 calories, other values not visible") is real content and stays. */
function withoutNotes(body: string): string {
  return body
    .split("\n")
    .map((line) => {
      const pieces = line.split(/(?<=[.;!?])\s+/).filter(Boolean);
      const note = (p: string) => NOT_THERE.test(p) && !/\d/.test(p);
      if (!pieces.some(note)) return line;
      return pieces
        .filter((p) => !note(p) && !RETAKE_TIP.test(p))
        .join(" ")
        .replace(/[;,:]\s*$/, ".");
    })
    .filter((line) => line.trim())
    .join("\n")
    .trim();
}

/**
 * Label-read sections, tagged as coming from the photo. "Nothing here" sections are dropped,
 * whether the title says it ("Not visible") or only the body does ("Ingredients and nutrition:
 * Not visible on this label…"). `missing` lists the dropped titles, for foldMissing. Read and
 * Translate sections are verbatim text and only lose a not-visible title.
 */
export function labelSections(
  raw: { title: string; body: string }[],
  mode: Mode,
): { sections: Section[]; missing: string[] } {
  const verbatim = mode === "read" || mode === "translate";
  const missing: string[] = [];
  const sections: Section[] = [];
  for (const s of raw) {
    if (EMPTY_SECTION.test(s.title)) continue;
    const body = verbatim ? s.body : withoutNotes(s.body);
    if (!body) {
      missing.push(s.title);
      continue;
    }
    sections.push({ ...s, body, provenance: "label" });
  }
  return { sections, missing };
}

/** One short line in the first section for important dropped sections ("Ingredients and
 *  nutrition: not in this photo; try another side."), unless another section covers them. */
export function foldMissing(sections: Section[], missing: string[]): Section[] {
  if (!sections.length) return sections;
  const have = sections.map((s) => s.title).join(" ").toLowerCase();
  const titles = missing.filter((t) =>
    (t.match(IMPORTANT) ?? []).some((w) => !have.includes(w.toLowerCase().replace(/s$/, ""))),
  );
  if (!titles.length) return sections;
  const line = `${titles.join(", ")}: not in this photo; try another side.`;
  return [{ ...sections[0], body: `${sections[0].body}\n${line}` }, ...sections.slice(1)];
}

const MAX_SPOKEN_WORDS = 25;
const SAFETY = /warning|caution|recall|allerg|contains|may contain|not recommended|keep out|danger|do not|don't/i;
// Container words a brandless name adds ("energy drink can"), for spotting a redundant name.
const CONTAINER_WORDS = new Set(["can", "cans", "bottle", "box", "bag", "pack", "package", "jar"]);

function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

function sentences(s: string): string[] {
  return s.match(/[^.!?]+[.!?]+["')]*|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [];
}

/**
 * Spoken answer for a product identified by its printed barcode: the exact name and brand first,
 * then the barcode's key facts (a recall; sugar and caffeine) if the photo's answer lacks them,
 * then the model's own sentences. Unchanged if the model already named the brand. A first
 * sentence that is only a generic name ("Sparkling Tropical energy drink can.") is dropped as
 * redundant, and sentences are dropped from the end to stay within 25 words, never a safety line.
 */
export function withIdentity(spoken: string, b: BarcodeResult): string {
  const identity = productIdentity(b);
  if (!identity) return spoken;
  const brand = (b.brand ?? "").toLowerCase();
  if (brand && spoken.toLowerCase().includes(brand)) return spoken;
  const known = new Set(identity.toLowerCase().split(/[^a-z0-9]+/));
  let rest = sentences(spoken);
  const lead = rest[0]?.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) ?? [];
  if (lead.length && lead.every((w) => known.has(w) || GENERIC_WORDS.has(w) || CONTAINER_WORDS.has(w))) {
    rest = rest.slice(1);
  }
  const said = sentences(b.spokenText);
  // A recall is a safety line and always goes in, right after the name.
  const recall = /recall/i.test(spoken) ? [] : said.filter((x) => /\brecalled\b/i.test(x));
  // Sugar and caffeine, unless the photo's answer already gives numbers for them; shorter
  // versions are tried before leaving them out.
  const headline = /\d[^.]*\b(caffeine|sugar)/i.test(spoken)
    ? undefined
    : said.find((x) => /\bper (serving|100 grams)\.$/i.test(x));
  const per = headline?.match(/\bper (serving|100 grams)\.$/i)?.[0] ?? "";
  const part = (re: RegExp) => headline?.match(re)?.[0];
  const variants = [
    headline,
    ...[part(/\d+ milligrams of caffeine/i), part(/\d+(\.\d+)? grams? of sugar/i)].map((x) =>
      x ? `${x[0].toUpperCase()}${x.slice(1)} ${per}` : undefined,
    ),
  ].filter((x, i, all): x is string => Boolean(x) && all.indexOf(x) === i);

  let out: string[] = [];
  for (const fact of [...variants, undefined]) {
    out = [`${identity}.`, ...recall, ...(fact ? [fact] : []), ...rest];
    const fixed = 1 + recall.length + (fact ? 1 : 0); // never dropped
    for (let i = out.length - 1; i >= fixed && wordCount(out.join(" ")) > MAX_SPOKEN_WORDS; i--) {
      if (!SAFETY.test(out[i])) out.splice(i, 1);
    }
    if (wordCount(out.join(" ")) <= MAX_SPOKEN_WORDS) break;
  }
  return out.join(" ");
}

/** "Nutrition (per serving)" -> "Nutrition, per serving (from barcode)". */
function barcodeSections(b: BarcodeResult, have: Section[]): Section[] {
  const base = (t: string) => t.toLowerCase().split(/[\s(,]/)[0];
  const taken = new Set(have.map((s) => base(s.title)));
  return b.sections
    .filter((s) => s.title !== "Score" && !taken.has(base(s.title)))
    .map((s) => ({
      title: `${s.title.replace(/\s*\(([^)]*)\)/, ", $1")} (from barcode)`,
      body: s.body,
      provenance: "label" as const,
    }));
}

export async function analyzePhoto(input: AnalyzeInput): Promise<AnalyzeResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    return fail("SightLine isn't set up yet. The server is missing its API key.", 500);
  }

  const data = input.image.replace(/^data:image\/\w+;base64,/, "");
  const book = input.book === true;
  const mode: RequestMode = book ? "read" : input.mode;
  const followUp = input.question;
  const conversation = cleanConversation(input.conversation);
  const targetLanguage = input.language;
  const persist = input.persist ?? "after";
  // A book page itself (no question) is a transcription job with its own model.
  const transcribing = book && !followUp;
  const model = transcribing ? bookModel() : analyzeModel();
  const keyFor = (q?: string, turns?: ConversationTurn[]) =>
    analysisKey({
      image: data,
      mode: book ? "read:book" : mode,
      language: targetLanguage,
      // A fresh question gets different wording, so it mustn't reuse a follow-up's cached answer.
      question: q && input.isFollowUp === false ? `fresh:${q}` : q,
      conversation: turns,
      model: q ? analyzeModel() : model,
      version: PROMPT_VERSION,
    });
  const ctx = {
    cacheKey: keyFor(followUp, conversation),
    device: input.device,
    mode,
    key: slug(input.key),
  };

  // The same photo and request again (Replay, Retry, a demo re-run): answer from the cache.
  // The history lookup for a repeat runs alongside the cache read, so a hit costs one round trip.
  const priorScan =
    ctx.device && dbConfigured() ? recentScanId(ctx.device, ctx.cacheKey) : undefined;
  const cached = await getCachedAnalysis(ctx.cacheKey);
  if (cached) {
    const was: Mode = mode === "auto" ? (cached.mode ?? "describe") : mode;
    return finish(cached, { ...ctx, mode: was, cached: true, priorScan }, persist);
  }

  const client = new Anthropic();
  const image = {
    type: "image" as const,
    source: { type: "base64" as const, media_type: imageMediaType(data), data },
  };

  try {
    if (transcribing) {
      // Book mode: every word of the page, in reading order. Accuracy over speed.
      const reply = await askJson<BookReply>(client, {
        model,
        maxTokens: 12000, // a dense two-page spread is about 1,500 words
        system: bookSystemPrompt(targetLanguage),
        content: [image, { type: "text", text: "Transcribe this page." }],
        schema: BOOK_SCHEMA,
      });
      if (!reply) return fail("Sorry, I couldn't read that page. Please try again.", 200);
      const { page, spokenText } = buildPage({
        pageText: typeof reply.pageText === "string" ? reply.pageText : "",
        pageNumber: typeof reply.pageNumber === "string" ? reply.pageNumber : "",
        complete: reply.complete !== false,
        cutOff: typeof reply.cutOff === "string" ? reply.cutOff : "",
      });
      const sections: Section[] = page.text
        ? [
            {
              title: page.pageNumber ? `Page ${page.pageNumber}` : "Page",
              body: page.text,
              provenance: "label",
            },
          ]
        : [];
      return finish(
        {
          spokenText: page.text
            ? spokenText
            : "I couldn't find any text on this page. Try holding the book flat under good light.",
          sections,
          details: page.text,
          webQuery: "",
          itemKind: "book",
          mode: "read",
          page,
        },
        { ...ctx, mode: "read", cached: false },
        persist,
      );
    }

    // A question about a book page gets the page's exact text, if it was read before.
    const pageText = book
      ? (await getCachedAnalysis(keyFor(undefined, undefined)))?.page?.text
      : undefined;

    // A whole menu, dish by dish, only for a fresh photo: follow-ups answer from the photo.
    const wantsMenu = !followUp && (mode === "menu" || mode === "auto");
    const parsed = await askJson<Parsed>(client, {
      model,
      maxTokens: wantsMenu ? 8000 : 3000, // a full page of text fits; spoken answers stay short
      system: systemPrompt(mode, targetLanguage, { menu: wantsMenu }),
      content: [
        image,
        {
          type: "text",
          text: userPrompt(mode, targetLanguage, followUp, {
            isFollowUp: input.isFollowUp,
            conversation,
            pageText,
          }),
        },
      ],
      schema:
        mode === "auto"
          ? wantsMenu
            ? MENU_AUTO_SCHEMA
            : AUTO_SCHEMA
          : wantsMenu
            ? MENU_OUTPUT_SCHEMA
            : OUTPUT_SCHEMA,
    });

    if (!parsed) {
      return fail("Sorry, I can't help with that photo. Please try something else.", 200);
    }

    const spokenText =
      typeof parsed.spokenText === "string" && parsed.spokenText.trim()
        ? parsed.spokenText.trim()
        : "I couldn't make out anything in that photo. Please try again.";
    let itemKind: ItemKind = ITEM_KINDS.includes(parsed.itemKind as ItemKind)
      ? (parsed.itemKind as ItemKind)
      : "none";
    let webQuery =
      itemKind !== "none" && typeof parsed.webQuery === "string"
        ? parsed.webQuery.trim().slice(0, 200)
        : "";
    let brand = typeof parsed.brand === "string" ? parsed.brand.trim().slice(0, 80) : "";
    let spoken = spokenText;

    // Auto: the mode the model chose, checked here; anything unexpected becomes describe.
    const chosen: Mode =
      mode !== "auto"
        ? mode
        : MODES.includes(parsed.chosenMode as Mode)
          ? (parsed.chosenMode as Mode)
          : "describe";
    const label = labelSections(cleanSections(parsed.sections), chosen);
    // A restaurant menu: the dishes come structured; their flat copy leads the sections.
    const menu = wantsMenu && chosen === "menu" ? cleanMenu(parsed.menu) : undefined;
    let sections = menu ? [...menuToSections(menu), ...label.sections] : label.sections;

    // Barcode digits printed in the photo (not in Translate, not for questions): the product's
    // exact identity and facts from the barcode lookup, if it answers within 2.5 s.
    const found =
      chosen !== "translate" && !followUp ? await lookupPhotoBarcode(parsed.barcode) : undefined;
    if (found) {
      const identity = productIdentity(found);
      spoken = withIdentity(spoken, found);
      sections = [...sections, ...barcodeSections(found, sections)];
      brand = found.brand ?? brand;
      if (itemKind === "none") itemKind = found.itemKind === "none" ? "product" : found.itemKind;
      if (identity) {
        webQuery = `${identity.replace(/[^\p{L}\p{N}&'.]+/gu, " ").trim()} ${found.code}`;
      }
    }

    sections = foldMissing(sections, label.missing);

    return finish(
      {
        spokenText: spoken,
        sections,
        details: sectionsToText(sections),
        webQuery,
        itemKind,
        mode: chosen,
        ...(spokenLanguageCode(parsed.spokenLanguage)
          ? { spokenLanguage: spokenLanguageCode(parsed.spokenLanguage) }
          : {}),
        ...(brand ? { brand } : {}),
        ...(menu ? { menu } : {}),
        ...(found
          ? {
              barcode: {
                code: found.code,
                found: true,
                ...(found.source ? { source: found.source } : {}),
                spokenText: found.spokenText,
                sections: found.sections,
                itemKind: found.itemKind,
                ...(found.image ? { image: found.image } : {}),
                ...(found.title ? { title: found.title } : {}),
                ...(found.brand ? { brand: found.brand } : {}),
              },
            }
          : {}),
      },
      { ...ctx, mode: chosen, cached: false },
      persist,
    );
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return fail(
        "I'm getting a lot of requests right now. Please wait a moment and try again.",
        429,
      );
    }
    if (error instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic authentication failed: check ANTHROPIC_API_KEY");
      return fail("SightLine isn't set up correctly. The server's API key was rejected.", 500);
    }
    if (error instanceof Anthropic.BadRequestError) {
      console.error("Anthropic bad request:", error.message);
      return fail("Sorry, I couldn't read that photo. Please try again.", 400);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`Anthropic API error ${error.status}:`, error.message);
      return fail("Sorry, something went wrong on my end. Please try again.", 502);
    }
    console.error("Analyze failed:", error);
    return fail("Sorry, I couldn't reach the service. Check your connection and try again.", 502);
  }
}
