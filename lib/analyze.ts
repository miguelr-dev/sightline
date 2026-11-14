import Anthropic from "@anthropic-ai/sdk";
import {
  ITEM_KINDS,
  MODES,
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

// Server-only: read a photo with Claude, with the Neon analysis cache and scan history.
// Used by /api/analyze and by the hat camera's /api/device/frame.

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    spokenText: { type: "string" },
    sections: SECTIONS_SCHEMA,
    itemKind: { type: "string", enum: [...ITEM_KINDS] },
    webQuery: { type: "string" },
  },
  required: ["spokenText", "sections", "itemKind", "webQuery"],
  additionalProperties: false,
} as const;

// Auto mode: the model also says which mode it chose for this photo, in the same call.
const AUTO_SCHEMA = {
  ...OUTPUT_SCHEMA,
  properties: { chosenMode: { type: "string", enum: [...MODES] }, ...OUTPUT_SCHEMA.properties },
  required: ["chosenMode", ...OUTPUT_SCHEMA.required],
} as const;

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
  const fromQuery = (r.webQuery ?? "").replace(ANGLE_WORDS, " ").replace(/\s+/g, " ").trim();
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

/** Label-read sections are tagged as coming from the photo. */
function fromLabel(sections: { title: string; body: string }[]): Section[] {
  return sections.map((s) => ({ ...s, provenance: "label" as const }));
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

    const parsed = await askJson<Parsed>(client, {
      model,
      maxTokens: 3000, // a full page of text fits; spoken answers stay short
      system: systemPrompt(mode, targetLanguage),
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
      schema: mode === "auto" ? AUTO_SCHEMA : OUTPUT_SCHEMA,
    });

    if (!parsed) {
      return fail("Sorry, I can't help with that photo. Please try something else.", 200);
    }

    const spokenText =
      typeof parsed.spokenText === "string" && parsed.spokenText.trim()
        ? parsed.spokenText.trim()
        : "I couldn't make out anything in that photo. Please try again.";
    const sections = fromLabel(cleanSections(parsed.sections));
    const itemKind: ItemKind = ITEM_KINDS.includes(parsed.itemKind as ItemKind)
      ? (parsed.itemKind as ItemKind)
      : "none";
    const webQuery =
      itemKind !== "none" && typeof parsed.webQuery === "string"
        ? parsed.webQuery.trim().slice(0, 200)
        : "";

    // Auto: the mode the model chose, checked here; anything unexpected becomes describe.
    const chosen: Mode =
      mode !== "auto"
        ? mode
        : MODES.includes(parsed.chosenMode as Mode)
          ? (parsed.chosenMode as Mode)
          : "describe";

    return finish(
      {
        spokenText,
        sections,
        details: sectionsToText(sections),
        webQuery,
        itemKind,
        mode: chosen,
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
