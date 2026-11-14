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
  read: "Reads the text on the item you are showing, or all visible text if there is no single item.",
  describe: "Describes the item you are showing, or the scene if there is no single item.",
  menu: "Summarizes the menu, product, or medicine label you are showing.",
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
};

export type AnalyzeResponse = {
  spokenText: string;
  details: string;
  error?: boolean;
};
