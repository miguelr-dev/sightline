import { LANGUAGES, isRequestMode } from "@/lib/modes";
import { deviceId } from "@/lib/db";
import { analyzePhoto } from "@/lib/analyze";
import { readJson } from "@/lib/http";
import { interpretUtterance } from "@/lib/utterance";

export const maxDuration = 60;

const MAX_IMAGE_CHARS = 6_000_000; // ~4.5 MB of JPEG once decoded

function fail(spokenText: string, status: number) {
  return Response.json({ spokenText, details: "", error: true }, { status });
}

export async function POST(request: Request) {
  const parsed = await readJson(request, MAX_IMAGE_CHARS + 20_000);
  if (!parsed.ok) {
    return parsed.reason === "too-large"
      ? fail("That photo is too large. Please try again.", 413)
      : fail("Sorry, that request didn't come through. Please try again.", 400);
  }

  const { image, mode, language, question, key, utterance } = parsed.body;

  if (typeof image !== "string" || image.length < 100) {
    return fail("I didn't get a photo. Please try capturing again.", 400);
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return fail("That photo is too large. Please try again.", 413);
  }
  if (!isRequestMode(mode)) {
    return fail("Please choose a mode and try again.", 400);
  }
  const targetLanguage =
    typeof language === "string" && LANGUAGES.some((l) => l.name === language)
      ? language
      : "English";
  const followUp =
    typeof question === "string" && question.trim() ? question.trim().slice(0, 500) : undefined;

  // "Ask while looking": what the user said with this fresh photo can change the mode and
  // language, ask a question about this photo, or ask for a web lookup.
  const said = interpretUtterance(utterance, { mode, language: targetLanguage });

  const result = await analyzePhoto({
    image,
    mode: said?.mode ?? mode,
    language: said?.language ?? targetLanguage,
    question: said ? said.question : followUp,
    ...(said?.question ? { isFollowUp: false } : {}),
    key: typeof key === "string" ? key : undefined,
    device: deviceId(request),
  });
  // Auto mode: tell the app which mode was chosen ("Reading the sign…").
  const resolved = result.mode ?? (said?.mode !== "auto" ? said?.mode : undefined);
  if (!said) {
    if (mode !== "auto" || !resolved) return Response.json(result.body, { status: result.status });
    return Response.json(
      { ...result.body, interpreted: { mode: resolved } },
      { status: result.status },
    );
  }
  const shownMode = said.mode === "auto" ? (resolved ?? "describe") : said.mode;
  return Response.json(
    {
      ...result.body,
      utterance: said.utterance,
      interpreted: {
        mode: shownMode,
        ...(said.question ? { question: said.question } : {}),
        ...(shownMode === "translate" ? { language: said.language } : {}),
      },
      ...(said.autoLookup && !result.body.error ? { autoLookup: true } : {}),
    },
    { status: result.status },
  );
}
