// Server-only: ElevenLabs settings shared by /api/speak, /api/transcribe and /api/features.

export const ELEVENLABS_API = "https://api.elevenlabs.io/v1";

// Flash v2.5: about 100 ms model latency and supports every language in lib/modes.ts.
export const DEFAULT_TTS_MODEL = "eleven_flash_v2_5";
// "George" (warm, clear narrator), one of ElevenLabs' default voices.
export const DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb";
export const DEFAULT_STT_MODEL = "scribe_v3";
export const FALLBACK_STT_MODEL = "scribe_v2";

export function elevenKey(): string | undefined {
  return process.env.ELEVENLABS_API_KEY || undefined;
}

export function ttsModel(): string {
  return process.env.ELEVENLABS_MODEL_ID || DEFAULT_TTS_MODEL;
}

export function voiceId(): string {
  return process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
}

export function sttModel(): string {
  return process.env.ELEVENLABS_STT_MODEL_ID || DEFAULT_STT_MODEL;
}
