// Mirrors lib/modes.ts in the Next.js app (the API contract). Copied rather than imported so
// the mobile bundle never reaches outside mobile/.

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

export function languageCode(name: string): string {
  return LANGUAGES.find((l) => l.name === name)?.code ?? "en-US";
}

export type ItemKind = "none" | "food_drink" | "product" | "medicine" | "restaurant" | "book" | "place";

// Item-dependent groups chosen by the server (Nutrition, Ingredients, Warnings, Full text, ...).
export type Section = { title: string; body: string };

export type AnalyzeResponse = {
  spokenText: string;
  details: string;
  sections?: Section[];
  webQuery?: string;
  itemKind?: ItemKind;
  scanId?: string; // server-side history id; passed back to /api/lookup
  error?: boolean;
};

export type LookupSource = { title: string; url: string; thumbnail?: string };

export type LookupResponse = {
  spokenText: string;
  details: string;
  query: string;
  itemKind?: ItemKind;
  sources: LookupSource[];
  image?: string; // hero image of the item
  sections?: Section[];
  cached?: boolean;
  skipped?: boolean;
  error?: boolean;
};

// null for a field means "unknown" (the server has no /api/features route): try it and degrade.
export type Features = {
  elevenlabs: boolean | null;
  transcribe: boolean | null;
  lookup: boolean | null;
  history: boolean | null;
  ask: boolean | null; // "Ask your history" (/api/ask)
  hatCommands: boolean | null; // voice commands to the hat camera (/api/device/command)
};

export const UNKNOWN_FEATURES: Features = { elevenlabs: null, transcribe: null, lookup: null, history: null, ask: null, hatCommands: null };

export type FrameCheck = {
  ready: boolean;
  key?: string;
  hint?: string;
  detected?: boolean; // something worth suggesting is in view
  label?: string; // e.g. "Menu" or "Nutter Butter cookies"
  suggestedMode?: string; // validated against MODES by the caller
  confidence?: number; // 0..1
};

export type Voice = { id: string; name: string; description?: string; previewUrl?: string };

/** Keep only well-formed sections; the server may omit the field or send junk. */
export function cleanSections(v: unknown): Section[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(
      (x): x is Section =>
        !!x && typeof x === "object" && typeof (x as Section).title === "string" && typeof (x as Section).body === "string",
    )
    .map((x) => ({ title: x.title.trim(), body: x.body.trim() }))
    .filter((x) => x.title && x.body);
}

export function httpsUrl(v: unknown): string | undefined {
  return typeof v === "string" && /^https:\/\//i.test(v) ? v : undefined;
}

// One entry from GET /api/history.
export type Scan = {
  id: string;
  createdAt: string;
  mode: Mode;
  itemKind?: ItemKind;
  title: string;
  spokenText: string;
  sections: Section[];
  lookup: LookupResponse | null;
  image?: string;
};

// GET /api/device/next: events from the hat camera, oldest first.
export type DeviceEvent = {
  id: string;
  createdAt: string;
  kind: "detected" | "answer" | "hint" | "status"; // status: a message about a voice command
  payload: Record<string, unknown>;
};

// POST /api/ask: an answer about the user's earlier scans.
export type AskAnswer = {
  spokenText: string;
  sections: Section[];
  scans: { id: string; title: string; createdAt: string }[];
  error?: boolean;
};
