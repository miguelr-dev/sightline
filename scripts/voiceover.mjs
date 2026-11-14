// Generates the demo video's narration with ElevenLabs from video/NARRATION.md.
//
//   npm run voiceover                     all clips, plus full.mp3 with short gaps
//   npm run voiceover -- 03 07            only these clips
//   npm run voiceover -- --voice <id>     another narrator voice
//   npm run voiceover -- --model <id>     another model (default eleven_v4)
//   npm run voiceover -- --samples        the hook line in each candidate voice
//
// Needs ELEVENLABS_API_KEY in .env.local. Writes to video/voiceover/.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "video/NARRATION.md");
const OUT = path.join(ROOT, "video/voiceover");
const API = "https://api.elevenlabs.io/v1";

// Narrator candidates. George is the app's own voice, so the narrator is someone else.
const VOICES = {
  brian: "nPczCjzI2devNBz1zQrb", // deep, resonant, American
  matilda: "XrExE9yKIg1WjnnlVkGX", // knowledgeable, professional, American
  sarah: "EXAVITQu4vr4xnSDxMaL", // mature, reassuring, American
  daniel: "onwK4e9ZLuTAKqWW03F9", // steady broadcaster, British
};
const DEFAULT_VOICE = "matilda";

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  console.error("Set ELEVENLABS_API_KEY in .env.local first.");
  process.exit(1);
}

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args.splice(i, 2)[1];
};
const samples = args.includes("--samples");
const voiceArg = flag("--voice") || process.env.NARRATOR_VOICE_ID || DEFAULT_VOICE;
const voice = VOICES[voiceArg.toLowerCase()] || voiceArg;
// Eleven v4: ElevenLabs' most expressive model (the app itself uses Flash v2.5 for speed).
// eleven_multilingual_v2 is the steadier fallback.
const MODEL = flag("--model") || process.env.NARRATION_MODEL_ID || "eleven_v4";
const only = args.filter((a) => /^\d+$/.test(a)).map((a) => a.padStart(2, "0"));

// "### 01 hook (…)" starts a clip; its "> " lines are what gets spoken.
function parseClips(md) {
  const clips = [];
  for (const line of md.split("\n")) {
    const head = line.match(/^###\s+(\d+)\s+([\w-]+)/);
    if (head) clips.push({ id: head[1].padStart(2, "0"), name: head[2], lines: [] });
    else if (line.startsWith("> ") && clips.length) clips.at(-1).lines.push(line.slice(2).trim());
  }
  return clips.map((c) => ({ ...c, text: c.lines.join(" ") })).filter((c) => c.text);
}

async function tts(text, voiceId, context = {}, model = MODEL) {
  const request = (extra) =>
    fetch(`${API}/text-to-speech/${voiceId}?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text, model_id: model, ...extra }),
      signal: AbortSignal.timeout(60_000),
    });
  // Steady but not flat, with a little style for a product-video read; neighbouring lines
  // keep the intonation continuous across clips.
  let res = await request({
    voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.25, use_speaker_boost: true },
    ...(context.previous ? { previous_text: context.previous } : {}),
    ...(context.next ? { next_text: context.next } : {}),
  });
  // Newer models reject some of these settings; fall back to the model's defaults.
  if (res.status === 400 || res.status === 422) res = await request({});
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return Buffer.from(await res.arrayBuffer());
}

function seconds(file) {
  try {
    const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
    return Number(out.toString().trim());
  } catch {
    return NaN;
  }
}

await mkdir(OUT, { recursive: true });
const clips = parseClips(await readFile(SCRIPT, "utf8"));

if (samples) {
  // Every voice on the chosen model, plus the default voice on the steadier v2 model.
  const hook = clips[0].text;
  const runs = Object.entries(VOICES).map(([name, id]) => [name, id, MODEL]);
  runs.push([DEFAULT_VOICE, VOICES[DEFAULT_VOICE], "eleven_multilingual_v2"]);
  for (const [name, id, model] of runs) {
    const file = path.join(OUT, `sample-${name}-${model.replace(/^eleven_/, "")}.mp3`);
    await writeFile(file, await tts(hook, id, {}, model));
    console.log(`${path.basename(file)}  ${seconds(file).toFixed(1)} s`);
  }
  process.exit(0);
}

const chosen = only.length ? clips.filter((c) => only.includes(c.id)) : clips;
let total = 0;
for (const clip of chosen) {
  const i = clips.indexOf(clip);
  const file = path.join(OUT, `${clip.id}-${clip.name}.mp3`);
  await writeFile(
    file,
    await tts(clip.text, voice, { previous: clips[i - 1]?.text, next: clips[i + 1]?.text }),
  );
  const s = seconds(file);
  total += s;
  console.log(`${path.basename(file)}  ${s.toFixed(1)} s  ${clip.text.split(/\s+/).length} words`);
}
console.log(`${chosen.length} clips, ${total.toFixed(1)} s of narration (voice ${voiceArg}, ${MODEL})`);

// A single file with a short pause between clips, for listening straight through.
if (!only.length) {
  const list = path.join(OUT, "concat.txt");
  const silence = path.join(OUT, ".gap.mp3");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=mono", "-t", "0.8", "-q:a", "2", silence]);
  const files = clips.map((c) => path.join(OUT, `${c.id}-${c.name}.mp3`));
  await writeFile(list, files.flatMap((f) => [`file '${f}'`, `file '${silence}'`]).join("\n"));
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-ac", "1", "-q:a", "2", path.join(OUT, "full.mp3")]);
  console.log(`full.mp3  ${seconds(path.join(OUT, "full.mp3")).toFixed(1)} s`);
}
