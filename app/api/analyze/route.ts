import Anthropic from "@anthropic-ai/sdk";
import {
  ITEM_KINDS,
  MODES,
  LANGUAGES,
  type AnalyzeResponse,
  type ItemKind,
  type Mode,
} from "@/lib/modes";
import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { PROMPT_VERSION, systemPrompt, userPrompt } from "@/lib/prompts";
import {
  analysisKey,
  dbConfigured,
  deviceId,
  getCachedAnalysis,
  insertScan,
  putCachedAnalysis,
  recentScanId,
} from "@/lib/db";
import { SECTIONS_SCHEMA, analyzeModel, askJson, cleanSections, sectionsToText } from "@/lib/claude";

export const maxDuration = 60;

const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of JPEG once decoded

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

// Search angle words, dropped when turning a web query into a short history title.
const ANGLE_WORDS =
  /\b(nutrition|facts|caffeine|sugar|price|uses|recalls?|fda|warnings?|reviews?|menu|hours|allergens?|summary)\b/gi;

function scanTitle(r: AnalyzeResponse): string {
  const fromQuery = (r.webQuery ?? "").replace(ANGLE_WORDS, " ").replace(/\s+/g, " ").trim();
  if (fromQuery) return fromQuery.slice(0, 80);
  const words = r.spokenText.split(/\s+/).slice(0, 8).join(" ");
  return words.replace(/[.,;:]+$/, "").slice(0, 80);
}

function slug(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return s || undefined;
}

/**
 * Reply, and in the background (after the response is sent) cache it and save it to the
 * device's history. Returns the scan id the client can pass to /api/lookup.
 */
async function finish(
  result: AnalyzeResponse,
  ctx: { cacheKey: string; device?: string; mode: Mode; key?: string; cached: boolean },
) {
  let scanId: string | undefined;
  if (ctx.device && dbConfigured()) {
    // A replay or retry of the same photo reuses the history entry made a moment ago.
    scanId = (ctx.cached && (await recentScanId(ctx.device, ctx.cacheKey))) || randomUUID();
  }
  const body: AnalyzeResponse = {
    ...result,
    ...(scanId ? { scanId } : {}),
    ...(ctx.cached ? { cached: true } : {}),
  };
  after(async () => {
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
  });
  return reply(body);
}

type Parsed = { spokenText?: unknown; sections?: unknown; webQuery?: unknown; itemKind?: unknown };

function reply(body: AnalyzeResponse, status = 200) {
  return Response.json(body, { status });
}

function fail(spokenText: string, status: number) {
  return reply({ spokenText, details: "", error: true }, status);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Sorry, that request didn't come through. Please try again.", 400);
  }

  const { image, mode, language, question, key } = (body ?? {}) as Record<string, unknown>;

  if (typeof image !== "string" || image.length < 100) {
    return fail("I didn't get a photo. Please try capturing again.", 400);
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return fail("That photo is too large. Please try again.", 413);
  }
  if (typeof mode !== "string" || !MODES.includes(mode as Mode)) {
    return fail("Please choose a mode and try again.", 400);
  }
  const targetLanguage =
    typeof language === "string" && LANGUAGES.some((l) => l.name === language)
      ? language
      : "English";
  const followUp =
    typeof question === "string" && question.trim() ? question.trim().slice(0, 500) : undefined;

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    return fail("SightLine isn't set up yet. The server is missing its API key.", 500);
  }

  const data = image.replace(/^data:image\/\w+;base64,/, "");
  const model = analyzeModel();
  const ctx = {
    cacheKey: analysisKey({
      image: data,
      mode,
      language: targetLanguage,
      question: followUp,
      model,
      version: PROMPT_VERSION,
    }),
    device: deviceId(request),
    mode: mode as Mode,
    key: slug(key),
  };

  // The same photo and request again (Replay, Retry, a demo re-run): answer from the cache.
  const cached = await getCachedAnalysis(ctx.cacheKey);
  if (cached) return finish(cached, { ...ctx, cached: true });

  const client = new Anthropic();

  try {
    const parsed = await askJson<Parsed>(client, {
      model,
      maxTokens: 3000, // a full page of text fits; spoken answers stay short
      system: systemPrompt(mode as Mode, targetLanguage),
      content: [
        { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
        { type: "text", text: userPrompt(mode as Mode, targetLanguage, followUp) },
      ],
      schema: OUTPUT_SCHEMA,
    });

    if (!parsed) {
      return fail("Sorry, I can't help with that photo. Please try something else.", 200);
    }

    const spokenText =
      typeof parsed.spokenText === "string" && parsed.spokenText.trim()
        ? parsed.spokenText.trim()
        : "I couldn't make out anything in that photo. Please try again.";
    const sections = cleanSections(parsed.sections);
    const itemKind: ItemKind = ITEM_KINDS.includes(parsed.itemKind as ItemKind)
      ? (parsed.itemKind as ItemKind)
      : "none";
    const webQuery =
      itemKind !== "none" && typeof parsed.webQuery === "string"
        ? parsed.webQuery.trim().slice(0, 200)
        : "";

    return finish(
      { spokenText, sections, details: sectionsToText(sections), webQuery, itemKind },
      { ...ctx, cached: false },
    );
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return fail("I'm getting a lot of requests right now. Please wait a moment and try again.", 429);
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
