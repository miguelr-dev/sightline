// Shared between the client and the /api/analyze route.

export const MODES = ["read", "describe", "menu", "translate"] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABELS: Record<Mode, string> = {
  read: "Read",
  describe: "Describe",
  menu: "Menu / Label",
  translate: "Translate",
};

export const MODE_HINTS: Record<Mode, string> = {
  read: "Reads all visible text aloud.",
  describe: "Describes the scene in front of you.",
  menu: "Summarizes a menu, product, or medicine label.",
  translate: "Reads the text and translates it.",
};

export type Language = { name: string; code: string };

// `code` is a BCP-47 tag used to pick a text-to-speech voice.
export const LANGUAGES: Language[] = [
  { name: "English", code: "en-US" },
  { name: "Spanish", code: "es-ES" },
  { name: "French", code: "fr-FR" },
  { name: "German", code: "de-DE" },
  { name: "Italian", code: "it-IT" },
  { name: "Portuguese", code: "pt-BR" },
  { name: "Chinese", code: "zh-CN" },
  { name: "Japanese", code: "ja-JP" },
  { name: "Korean", code: "ko-KR" },
  { name: "Arabic", code: "ar-SA" },
  { name: "Hindi", code: "hi-IN" },
  { name: "Vietnamese", code: "vi-VN" },
  { name: "Tagalog", code: "fil-PH" },
];

export function findLanguage(name: string | undefined): Language | undefined {
  if (!name) return undefined;
  const n = name.trim().toLowerCase();
  return LANGUAGES.find((l) => l.name.toLowerCase() === n);
}

export type AnalyzeRequest = {
  image: string; // base64 JPEG, no data: prefix
  mode: Mode;
  language?: string; // language name, used by Translate
  question?: string; // follow-up question about the same image
  key?: string; // optional target id from /api/frame-check, stored with the scan
};

// What kind of thing the photo shows, which decides what a web lookup looks for.
export const ITEM_KINDS = [
  "none",
  "food_drink",
  "product",
  "medicine",
  "restaurant",
  "book",
  "place",
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** A titled block of extra information, shown on screen and read on request. */
export type Section = { title: string; body: string };

export type AnalyzeResponse = {
  spokenText: string; // the gist, about 30 words; recalls, warnings and allergens always kept
  sections?: Section[]; // item-dependent detail, 0 to 6 sections
  details: string; // flat fallback: the sections joined as plain text
  webQuery?: string; // short search query for a web lookup, empty when nothing is identifiable
  itemKind?: ItemKind;
  scanId?: string; // history entry for this scan (only with an x-sightline-device header)
  cached?: boolean; // true when this exact photo and request were answered before
  error?: boolean;
};

export type LookupRequest = {
  query?: string; // search query; when empty the server proposes one from `context`
  itemKind?: ItemKind;
  language?: string; // language name from LANGUAGES; the summary is written in it (default English)
  scanId?: string; // from AnalyzeResponse; the lookup result is saved to that scan
  context?: { mode?: Mode; spokenText?: string; details?: string };
};

export type LookupSource = {
  title: string;
  url: string;
  thumbnail?: string; // https image URL, or a small data: URI
};

export type LookupResponse = {
  spokenText: string;
  sections?: Section[]; // for example "Nutrition" or "Reviews" from the web
  details: string;
  query: string;
  itemKind?: ItemKind;
  image?: string; // one hero image of the item (https URL, or a small data: URI)
  sources: LookupSource[];
  skipped?: boolean; // web lookup isn't configured or there was nothing to search for
  cached?: boolean; // true when served from the lookup cache
  error?: boolean;
};

export type HistoryScan = {
  id: string;
  createdAt: string; // ISO timestamp
  mode: Mode;
  itemKind: string | null;
  key: string | null;
  title: string | null;
  spokenText: string;
  sections: Section[];
  lookup: LookupResponse | null;
  imageUrl: string | null;
};
export type HistoryResponse = { scans: HistoryScan[] };

export type FrameCheckRequest = {
  image: string; // base64 JPEG, about 512 px, no data: prefix
  mode: Mode;
  language?: string;
};

export type FrameCheckResponse = {
  ready: boolean; // a readable target is fully in frame and sharp enough
  key?: string; // short stable identity of the target, e.g. "harbor-table-menu"
  hint?: string; // one short spoken framing tip when not ready; empty when nothing relevant is in view
};

export type Voice = { id: string; name: string; description?: string; previewUrl?: string };
export type VoicesResponse = { voices: Voice[] };

export type Features = {
  elevenlabs: boolean; // ElevenLabs text-to-speech is configured
  transcribe: boolean; // ElevenLabs speech-to-text is configured
  lookup: boolean; // Bright Data web lookup is configured
  history: boolean; // Neon Postgres is configured (scan history and caches)
};
