import { LANGUAGES, findLanguage, type Mode } from "./modes";

// Which voice reads an answer, as in the iPhone app (mobile/src/logic/speechLang.ts).

/** The server's spokenLanguage ("es", "es-MX") as one of the app's voice tags ("es-ES"). */
export function speechLanguageTag(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const tag = v.trim().toLowerCase().split(/[-_]/)[0];
  if (!tag) return undefined;
  return LANGUAGES.find((l) => l.code.split("-")[0].toLowerCase() === tag)?.code;
}

/** Translate speaks its target language. Otherwise the language the answer is in (Read mode
 *  reads a Spanish sign verbatim, so a Spanish voice reads it), else English. */
export function answerLang(mode: Mode, language: string, spokenLanguage?: string): string {
  if (mode === "translate") return findLanguage(language)?.code ?? "en-US";
  return speechLanguageTag(spokenLanguage) ?? "en-US";
}
