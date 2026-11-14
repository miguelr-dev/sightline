// Shared between the client and the /api/analyze route.

export const MODES = ["read", "describe", "menu", "translate"] as const;
export type Mode = (typeof MODES)[number];

/** What a request may ask for: a mode, or "auto" to let the server choose per photo. */
export const REQUEST_MODES = ["auto", ...MODES] as const;
export type RequestMode = (typeof REQUEST_MODES)[number];

export function isRequestMode(v: unknown): v is RequestMode {
  return typeof v === "string" && (REQUEST_MODES as readonly string[]).includes(v);
}

export const MODE_LABELS: Record<Mode, string> = {
  read: "Read",
  describe: "Describe",
  menu: "Menu / Label",
  translate: "Translate",
};

export const MODE_HINTS: Record<Mode, string> = {
  read: "Reads the text on the item you are showing, or all visible text if there is no single item.",
  describe: "Describes the item you are showing, or the scene if there is no single item.",
  menu: "Summarizes the menu, product, or medicine label you are showing.",
  translate: "Translates the sign, menu, or label you are showing into your language.",
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
  utterance?: string; // "ask while looking": what the user said with this fresh photo (max 300 chars)
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
  mode?: Mode; // the mode the answer was made in (what "auto" chose)
  scanId?: string; // history entry for this scan (only with an x-sightline-device header)
  cached?: boolean; // true when this exact photo and request were answered before
  utterance?: string; // the request's utterance, echoed back (trimmed, max 300 chars)
  interpreted?: { mode: Mode; question?: string; language?: string }; // what it was taken to mean
  autoLookup?: boolean; // "search for this": run /api/lookup now and speak its summary next
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

export type AskRequest = {
  question: string; // e.g. "What were the allergens on the cookies I scanned earlier?"
  language?: string; // language name from LANGUAGES for the answer (default English)
  timeZone?: string; // IANA zone for "today" and "yesterday" (default America/Los_Angeles)
};

export type AskResponse = {
  spokenText: string; // short spoken answer
  sections?: Section[]; // optional supporting detail
  scans?: { id: string; title: string | null; createdAt: string }[]; // scans the answer is based on
  error?: boolean;
};

/** A spoken command for the hat camera, sent by the paired phone to /api/device/command. */
export type HatCommandType =
  | "auto"
  | "read"
  | "describe"
  | "menu"
  | "translate"
  | "question"
  | "lookup";
export type HatCommand = { type: HatCommandType; question?: string; language?: string };

export type DeviceCommandRequest = {
  device: string; // hat id
  pair: string; // the hat's pair code
  text?: string; // what the user said; parsed with parseCommand when `command` is absent
  command?: HatCommand;
};

export type DeviceCommandResponse =
  | { accepted: true; commandId: string }
  | { accepted: false; reason: "no-frame" | "unpaired" | "bad-command" };

/** GET /api/barcode?code=<digits>&language=<name> */
export type BarcodeResponse = {
  code: string;
  found: boolean;
  source?: "openfoodfacts" | "web" | "openfda"; // absent when nothing was found
  spokenText: string;
  sections: Section[];
  itemKind: ItemKind;
  image?: string;
  title?: string;
  scanId?: string; // with an x-sightline-device header
  cached?: boolean;
  error?: string; // "bad-code" with HTTP 400
};

export type FrameCheckRequest = {
  image: string; // base64 JPEG, about 512 px, no data: prefix
  mode: Mode;
  language?: string;
  lastKey?: string; // the key from the previous frame, so the same item keeps its key
  lastLabel?: string;
};

export type FrameCheckResponse = {
  ready: boolean; // the target's main text can be read now (edges cut, angle or glare are fine)
  detected: boolean; // a readable target (product, package, menu, sign, label, document) is in view at all
  key?: string; // short stable identity of the target, e.g. "harbor-table-menu"
  label?: string; // short spoken name, e.g. "Nutter Butter cookies", "Lunch menu"
  suggestedMode?: Mode; // best mode for the target
  confidence?: number; // 0 to 1, how sure the model is about `ready`
  hint?: string; // one short spoken framing tip when detected but not ready; otherwise empty
};

export type Voice = { id: string; name: string; description?: string; previewUrl?: string };
export type VoicesResponse = { voices: Voice[] };

export type Features = {
  elevenlabs: boolean; // ElevenLabs text-to-speech is configured
  transcribe: boolean; // ElevenLabs speech-to-text is configured
  lookup: boolean; // Bright Data web lookup is configured
  history: boolean; // Neon Postgres is configured (scan history and caches)
  ask: boolean; // "Ask your history" agent is available (/api/ask)
  hat: boolean; // hat camera routes are set up (DEVICE_SHARED_KEY and DATABASE_URL)
  hatCommands: boolean; // the hat camera takes voice commands (/api/device/command)
  barcode: boolean; // barcode lookup (/api/barcode)
};
