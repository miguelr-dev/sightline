import { connection } from "next/server";
import type { Voice, VoicesResponse } from "@/lib/modes";
import { DEFAULT_VOICE_ID, ELEVENLABS_API, elevenKey } from "@/lib/elevenlabs";

// A short, curated list of clear ElevenLabs voices for the voice picker.

const CACHE_MS = 60 * 60 * 1000;

// Clear, calm voices that suit reading labels and menus, default voice first.
const CURATED: { id: string; name: string; description: string }[] = [
  { id: DEFAULT_VOICE_ID, name: "Matilda", description: "Knowledgeable, professional. American, female." },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Warm, clear storyteller. British, male." },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Clear, engaging educator. British, female." },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Steady broadcaster. British, male." },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Mature, reassuring. American, female." },
  { id: "SAz9YHcvj6GT2YYXdXww", name: "River", description: "Relaxed, neutral, informative. American." },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Deep, resonant, comforting. American, male." },
  { id: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", description: "Professional, bright, warm. American, female." },
];

let cache: { at: number; voices: Voice[] } | null = null;

type ElevenVoice = {
  voice_id?: string;
  name?: string;
  preview_url?: string;
  labels?: Record<string, string>;
};

function titleCase(s: string): string {
  return s.replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}

async function loadVoices(key: string): Promise<Voice[]> {
  const res = await fetch(`${ELEVENLABS_API}/voices`, {
    headers: { "xi-api-key": key },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`ElevenLabs voices error ${res.status}`);
  const data = (await res.json()) as { voices?: ElevenVoice[] };
  const byId = new Map((data.voices ?? []).filter((v) => v.voice_id).map((v) => [v.voice_id!, v]));

  const voices: Voice[] = [];
  for (const c of CURATED) {
    const v = byId.get(c.id);
    if (!v) continue; // not available on this account
    voices.push({
      id: c.id,
      name: c.name,
      description: c.description,
      ...(v.preview_url ? { previewUrl: v.preview_url } : {}),
    });
  }
  // If the account lacks some of them, fill up with other voices meant for narration or teaching.
  for (const v of data.voices ?? []) {
    if (voices.length >= 8) break;
    const use = v.labels?.use_case ?? "";
    if (!v.voice_id || voices.some((x) => x.id === v.voice_id)) continue;
    if (!/informative|narrat|conversational/.test(use)) continue;
    const [name, ...rest] = (v.name ?? "Voice").split(" - ");
    const accent = v.labels?.accent ? titleCase(v.labels.accent) : "";
    voices.push({
      id: v.voice_id,
      name: name.trim(),
      description: [rest.join(" - ").trim(), accent].filter(Boolean).join(". ") || undefined,
      ...(v.preview_url ? { previewUrl: v.preview_url } : {}),
    });
  }
  return voices;
}

export async function GET() {
  await connection();
  const key = elevenKey();
  if (cache && Date.now() - cache.at < CACHE_MS) {
    return Response.json({ voices: cache.voices } satisfies VoicesResponse);
  }
  if (key) {
    try {
      const voices = await loadVoices(key);
      if (voices.length) {
        cache = { at: Date.now(), voices };
        return Response.json({ voices } satisfies VoicesResponse);
      }
    } catch (error) {
      console.error("Loading ElevenLabs voices failed:", error);
    }
  }
  // No key or ElevenLabs unreachable: the curated list without previews.
  const fallback = CURATED.map(({ id, name, description }) => ({ id, name, description }));
  return Response.json({ voices: fallback } satisfies VoicesResponse);
}
