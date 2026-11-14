import { findLanguage, type RequestMode } from "./modes";
import { parseCommand } from "./voice";

// "Ask while looking": the user holds up the phone and says "what does this sign say",
// "is this gluten free" or "search for this". The app sends a fresh photo with the raw
// transcript, and this works out what to do with that photo.

export const MAX_UTTERANCE = 300;

export type Interpretation = {
  utterance: string; // trimmed, at most MAX_UTTERANCE characters
  mode: RequestMode; // "auto" stays auto unless the utterance names a mode
  language: string;
  question?: string; // a question about this new photo
  autoLookup: boolean; // "search for this": the app should run /api/lookup after the answer
};

/**
 * What an utterance means for this photo, starting from the request's mode and language.
 * Null when there's no utterance. History questions ("what did I scan earlier"), stop and help
 * change nothing here: the app sends those to /api/ask or handles them itself.
 */
export function interpretUtterance(
  raw: unknown,
  base: { mode: RequestMode; language: string },
): Interpretation | null {
  if (typeof raw !== "string") return null;
  const utterance = raw.trim().slice(0, MAX_UTTERANCE);
  if (!utterance) return null;

  const out: Interpretation = { utterance, ...base, autoLookup: false };
  const cmd = parseCommand(utterance);
  switch (cmd.type) {
    case "capture":
      out.mode = cmd.mode;
      if (cmd.mode === "translate") {
        out.language = cmd.language ?? findLanguage(base.language)?.name ?? "English";
      }
      break;
    case "lookup":
      out.autoLookup = true;
      break;
    case "question":
      out.question = cmd.text.slice(0, MAX_UTTERANCE);
      break;
    default:
      break; // ask, stop, repeat, help
  }
  return out;
}
