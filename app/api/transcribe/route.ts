import {
  ELEVENLABS_API,
  FALLBACK_STT_MODEL,
  elevenKey,
  sttModel,
} from "@/lib/elevenlabs";

// ElevenLabs speech-to-text (Scribe). Used for voice commands on browsers without
// SpeechRecognition, such as iOS Safari in home-screen mode. The body is the raw recording.

export const maxDuration = 30;

const MAX_BYTES = 3_000_000; // ~10 seconds of compressed audio is far less than this
const UPSTREAM_TIMEOUT_MS = 15_000;

function fail(reason: string, status: number) {
  return Response.json({ error: reason, text: "" }, { status });
}

function extensionFor(type: string): string {
  if (type.includes("mp4") || type.includes("m4a") || type.includes("aac")) return "m4a";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("wav")) return "wav";
  if (type.includes("mpeg") || type.includes("mp3")) return "mp3";
  return "webm";
}

async function transcribe(audio: Blob, type: string, model: string, key: string) {
  const form = new FormData();
  form.append("file", audio, `command.${extensionFor(type)}`);
  form.append("model_id", model);
  return fetch(`${ELEVENLABS_API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": key },
    body: form,
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

export async function POST(request: Request) {
  const key = elevenKey();
  if (!key) return fail("not-configured", 503);

  const type = (request.headers.get("content-type") || "audio/webm").split(";")[0];
  let bytes: ArrayBuffer;
  try {
    bytes = await request.arrayBuffer();
  } catch {
    return fail("bad-request", 400);
  }
  if (bytes.byteLength < 500) return fail("too-short", 400);
  if (bytes.byteLength > MAX_BYTES) return fail("too-large", 413);
  const audio = new Blob([bytes], { type });

  try {
    const model = sttModel();
    let upstream = await transcribe(audio, type, model, key);
    if (!upstream.ok && model !== FALLBACK_STT_MODEL && (upstream.status === 400 || upstream.status === 422)) {
      upstream = await transcribe(audio, type, FALLBACK_STT_MODEL, key);
    }
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      console.error(`ElevenLabs STT error ${upstream.status}:`, detail.slice(0, 300));
      return fail("upstream", 502);
    }
    const data = (await upstream.json()) as { text?: unknown };
    // Drop audio-event tags such as "(laughter)" so they don't confuse command parsing.
    const text =
      typeof data.text === "string" ? data.text.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim() : "";
    return Response.json({ text });
  } catch (error) {
    console.error("ElevenLabs STT failed:", error);
    return fail("upstream", 502);
  }
}
