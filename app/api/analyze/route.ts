import Anthropic from "@anthropic-ai/sdk";
import { MODES, LANGUAGES, type AnalyzeResponse, type Mode } from "@/lib/modes";
import { systemPrompt, userPrompt } from "@/lib/prompts";

export const maxDuration = 60;

const DEFAULT_MODEL = "claude-opus-5-5";
// Models that accept the server-side refusal fallback parameter.
const FALLBACK_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-fable-5-1",
  "claude-fable-5-2",
]);
const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of JPEG once decoded

const OUTPUT_SCHEMA = {
  type: "object",
  properties: {
    spokenText: { type: "string" },
    details: { type: "string" },
  },
  required: ["spokenText", "details"],
  additionalProperties: false,
} as const;

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

  const { image, mode, language, question } = (body ?? {}) as Record<string, unknown>;

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

  const model = process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
  const data = image.replace(/^data:image\/\w+;base64,/, "");
  const client = new Anthropic();

  try {
    const response = await client.beta.messages.create({
      model,
      max_tokens: 4000,
      output_config: {
        effort: "low", // spoken answers need to be fast more than deep
        format: { type: "json_schema", schema: OUTPUT_SCHEMA },
      },
      ...(FALLBACK_MODELS.has(model)
        ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
        : {}),
      system: systemPrompt(mode as Mode, targetLanguage),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
            { type: "text", text: userPrompt(mode as Mode, targetLanguage, followUp) },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return fail("Sorry, I can't help with that photo. Please try something else.", 200);
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    let parsed: { spokenText?: unknown; details?: unknown };
    try {
      parsed = JSON.parse(text);
    } catch {
      // Fall back to reading whatever text came back.
      parsed = { spokenText: text, details: "" };
    }

    const spokenText =
      typeof parsed.spokenText === "string" && parsed.spokenText.trim()
        ? parsed.spokenText.trim()
        : "I couldn't make out anything in that photo. Please try again.";
    const details = typeof parsed.details === "string" ? parsed.details.trim() : "";

    return reply({ spokenText, details });
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
