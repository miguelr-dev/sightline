import { MODES, LANGUAGES, type Mode } from "@/lib/modes";
import { deviceId } from "@/lib/db";
import { analyzePhoto } from "@/lib/analyze";

export const maxDuration = 60;

const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of JPEG once decoded

function fail(spokenText: string, status: number) {
  return Response.json({ spokenText, details: "", error: true }, { status });
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

  const result = await analyzePhoto({
    image,
    mode: mode as Mode,
    language: targetLanguage,
    question: followUp,
    key: typeof key === "string" ? key : undefined,
    device: deviceId(request),
  });
  return Response.json(result.body, { status: result.status });
}
