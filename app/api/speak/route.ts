import { ELEVENLABS_API, elevenKey, ttsModel, voiceId } from "@/lib/elevenlabs";
import { speakableUnits } from "@/lib/speechText";
import { readJson } from "@/lib/http";

// ElevenLabs text-to-speech. The client sends one sentence-sized chunk at a time
// and falls back to the browser's own voice if this route fails.

export const maxDuration = 30;

const MAX_TEXT = 1000; // the client sends ~300-character chunks; this is a hard cap
const MAX_CONTEXT = 300;
const UPSTREAM_TIMEOUT_MS = 12_000;

function fail(reason: string, status: number) {
  return Response.json({ error: reason }, { status, headers: { "Cache-Control": "no-store" } });
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

// BCP-47 tag from lib/modes.ts -> ISO 639-1 code. Flash v2.5 uses it to lock the language,
// which matters for short translated phrases. Tagalog (fil) is left to auto-detect.
function languageCode(lang: string): string | undefined {
  const primary = lang.split("-")[0]?.toLowerCase();
  return primary && primary.length === 2 ? primary : undefined;
}

// A plain ElevenLabs voice ID: letters and digits only.
const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;

async function synthesize(body: Record<string, unknown>, key: string, voice: string) {
  const url = `${ELEVENLABS_API}/text-to-speech/${encodeURIComponent(voice)}/stream?output_format=mp3_44100_128`;
  return fetch(url, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

export async function POST(request: Request) {
  const key = elevenKey();
  if (!key) return fail("not-configured", 503);

  const parsed = await readJson(request, 16_000);
  if (!parsed.ok)
    return fail(
      parsed.reason === "too-large" ? "too-large" : "bad-request",
      parsed.reason === "too-large" ? 413 : 400,
    );
  const input = parsed.body;

  const lang = str(input.lang, 20) || "en-US";
  // Spell out "0g" / "80mg" / "fl oz" so the voice doesn't say "zero gee".
  const text = speakableUnits(str(input.text, MAX_TEXT), lang);
  if (!text) return fail("no-text", 400);
  const previousText = speakableUnits(str(input.previousText, MAX_CONTEXT), lang);
  const nextText = speakableUnits(str(input.nextText, MAX_CONTEXT), lang);
  const requested = typeof input.voiceId === "string" ? input.voiceId.trim() : "";
  const voice = VOICE_ID.test(requested) ? requested : voiceId();

  const body: Record<string, unknown> = {
    text,
    model_id: ttsModel(),
    ...(previousText ? { previous_text: previousText } : {}),
    ...(nextText ? { next_text: nextText } : {}),
  };
  const code = languageCode(lang);

  try {
    let upstream = await synthesize(code ? { ...body, language_code: code } : body, key, voice);
    // Some models reject language_code; try once more without it.
    if (code && (upstream.status === 400 || upstream.status === 422)) {
      upstream = await synthesize(body, key, voice);
    }
    // An unknown or unavailable voice: fall back to the default voice.
    if (voice !== voiceId() && (upstream.status === 400 || upstream.status === 404)) {
      upstream = await synthesize(code ? { ...body, language_code: code } : body, key, voiceId());
    }
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      console.error(`ElevenLabs TTS error ${upstream.status}:`, detail.slice(0, 300));
      return fail("upstream", 502);
    }
    return new Response(upstream.body, {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("ElevenLabs TTS failed:", error);
    return fail("upstream", 502);
  }
}
