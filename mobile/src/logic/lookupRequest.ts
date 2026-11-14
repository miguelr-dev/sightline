import type { Mode } from "../modes";

/** /api/lookup writes its summary in this language; only Translate mode asks for one. */
export function lookupLanguage(mode: Mode, language: string): string | undefined {
  return mode === "translate" && language && language !== "English" ? language : undefined;
}
