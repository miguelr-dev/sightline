import Anthropic from "@anthropic-ai/sdk";
import { type FrameCheckResponse, type Mode } from "@/lib/modes";
import { askJson, fastModel } from "@/lib/claude";
import { imageMediaType } from "@/lib/http";
import { matchKey, sameTarget } from "@/lib/hat";

// Server-only. Auto-capture check, used by /api/frame-check (phone) and /api/device/frame (hat): is a readable target in view (detected, for a
// "Menu detected, tap to read" card), and can its main text be read right now (ready, to
// auto-read)? Small image, tiny prompt, fast model, no thinking.

// The model says what kind of thing it sees; the mode is chosen here, so it doesn't flip
// between frames of the same item.
export const CATEGORIES = [
  "packaged_item", // packaged food, drink, product or medicine
  "menu",
  "foreign_text", // a sign or document not in English
  "document", // a document, page, book, slide or a screen of text in English
  "sign", // an English sign
  "scene",
  "none",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_MODE: Record<Exclude<Category, "none">, Mode> = {
  packaged_item: "menu",
  menu: "menu",
  foreign_text: "translate",
  document: "read",
  sign: "read",
  scene: "describe",
};

const SCHEMA = {
  type: "object",
  properties: {
    detected: { type: "boolean" },
    label: { type: "string" },
    category: { type: "string", enum: [...CATEGORIES] },
    ready: { type: "boolean" },
    confidence: { type: "number" },
    key: { type: "string" },
    hint: { type: "string" },
  },
  required: ["detected", "label", "category", "ready", "confidence", "key", "hint"],
  additionalProperties: false,
} as const;

// Words that say what something is packed in, not what it is.
const CONTAINER_WORDS = new Set([
  "can",
  "cans",
  "package",
  "packaging",
  "pack",
  "packet",
  "bottle",
  "box",
  "front",
  "back",
  "carton",
  "jar",
  "bag",
  "tin",
  "container",
  "wrapper",
  "label",
]);
const FILLER_WORDS = new Set(["a", "an", "the", "and", "of", "for", "with"]);

/** "Kirkland Tropical Energy Drink Can" -> "kirkland-tropical-energy-drink": lowercase,
 *  no container or filler words, each word once, original order, at most 4 words. */
export function normalizeKey(raw: string): string {
  const words = raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const kept: string[] = [];
  for (const w of words) {
    if (CONTAINER_WORDS.has(w) || FILLER_WORDS.has(w) || kept.includes(w)) continue;
    kept.push(w);
  }
  return kept.slice(0, 4).join("-");
}

/** If `key` names the same item as the last frame's key (they share a distinctive word, as in
 *  lib/hat.ts), keep the last key so the phone sees one stable id. */
export function stabilizeKey(key: string, lastKey: string | undefined): string {
  if (!key || !lastKey) return key;
  const last = normalizeKey(lastKey);
  return last && sameTarget(matchKey(key), matchKey(last)) ? last : key;
}

// Everyday tech and furniture: never a target, even if the model calls it one.
const INCIDENTAL_WORDS = new Set([
  "laptop",
  "keyboard",
  "keys",
  "monitor",
  "screen",
  "display",
  "computer",
  "desktop",
  "desk",
  "mouse",
  "trackpad",
  "macbook",
  "pc",
  "workspace",
  "setup",
  "cable",
  "charger",
  "chair",
  "furniture",
  "wall",
  "floor",
  "hand",
  "hands",
  "notebook",
]);

/** True when every word of the key is everyday tech or furniture ("laptop-screen"). */
export function incidentalKey(key: string): boolean {
  const words = key.split("-").filter(Boolean);
  return words.length > 0 && words.every((w) => INCIDENTAL_WORDS.has(w));
}

function system(mode: Mode, last?: { key: string; label: string }): string {
  return `You check handheld phone camera frames for a blind user. Frames are small, often angled, with glare.
detected: true only for a text-bearing item the user is presenting to the camera: held up, centered and close, or clearly the subject. That means a label, package, can, bottle, menu, sign, document, book or medicine, even if partly cut off or a little blurry. Never true for keyboards, laptops or monitors in ordinary use, furniture, hands, walls, floors, or a desk or room scene. A screen counts only if it fills most of the frame, clearly pointed at to be read.
label: a short spoken name of 2 to 4 words, e.g. "Nutter Butter cookies", "Lunch menu", "Spanish street sign", "Medicine box". Empty if not detected.
category: "packaged_item" for packaged food, drink, product or medicine; "menu"; "foreign_text" for a sign or document not in English; "document" for a page, book, slide or screen of English text; "sign" for an English sign; "scene" for anything else in view; "none" if nothing is in view.
ready: true if the item's main text or name and main facts can be read now, even with edges cut off, an angle, or some glare. False only if the main text can't be read: too blurry, too dark, too far, or mostly out of frame.${mode === "describe" ? " In describe mode, a clear scene is also ready." : ""}
confidence: 0 to 1, how sure you are that ready is right.
key: the item's brand and product in lowercase, hyphenated, at most 4 words, the same every time you see this item: e.g. "red-bull", "nutter-butter-cookies", "harbor-table-menu", "precaucion-obras". No container words (can, package, bottle, box, front), no sizes or counts. Empty if not detected.${
    last
      ? `
The previous frame showed "${last.label || last.key}" with key "${last.key}". If this frame shows the same item, return exactly "${last.key}" as the key.`
      : ""
  }
hint: if not ready, one spoken tip of 2 to 5 words, e.g. "Move back a little", "Tilt down", "Hold still", "Too dark". Say "Too dark" if the frame is too dark to see anything. Empty if ready, or if the view is clear but has nothing to read (an empty wall).`;
}

function slug(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Check one frame. Never throws; on failure returns a not-ready result with ok false. */
export async function checkFrame(
  image: string,
  m: Mode,
  source?: string, // shown in the log line, e.g. "hat=hat-01"
  opts: { lastKey?: string; lastLabel?: string } = {},
): Promise<{ result: FrameCheckResponse; ok: boolean }> {
  const started = Date.now();
  // What the previous frame showed, cleaned up before it goes into the prompt.
  const lastKey = opts.lastKey ? normalizeKey(opts.lastKey.slice(0, 80)) : "";
  const lastLabel = (opts.lastLabel ?? "")
    .replace(/["\n\r]/g, " ")
    .trim()
    .slice(0, 60);
  const data = image.replace(/^data:image\/\w+;base64,/, "");
  try {
    const parsed = await askJson<{
      detected?: unknown;
      label?: unknown;
      category?: unknown;
      ready?: unknown;
      confidence?: unknown;
      key?: unknown;
      hint?: unknown;
    }>(new Anthropic(), {
      model: fastModel(),
      maxTokens: 160,
      timeoutMs: 6_000,
      system: system(m, lastKey ? { key: lastKey, label: lastLabel } : undefined),
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: imageMediaType(data),
            data,
          },
        },
        { type: "text", text: "Check this frame." },
      ],
      schema: SCHEMA,
    });
    const category = CATEGORIES.includes(parsed?.category as Category)
      ? (parsed?.category as Category)
      : "none";
    const rawKey = normalizeKey(slug(parsed?.key));
    // Everyday tech and furniture never count, whatever the model said.
    const incidental = incidentalKey(rawKey);
    const ready = parsed?.ready === true && !incidental && category !== "none";
    const detected = (parsed?.detected === true || ready) && !incidental && category !== "none";
    const key = detected ? stabilizeKey(rawKey, lastKey) : "";
    const label =
      detected && typeof parsed?.label === "string" ? parsed.label.trim().slice(0, 60) : "";
    const suggestedMode = category !== "none" ? CATEGORY_MODE[category] : undefined;
    const confidence =
      typeof parsed?.confidence === "number"
        ? Math.round(Math.min(1, Math.max(0, parsed.confidence)) * 100) / 100
        : undefined;
    const hint = !ready && typeof parsed?.hint === "string" ? parsed.hint.trim().slice(0, 60) : "";
    const out: FrameCheckResponse = {
      ready,
      detected,
      ...(key ? { key } : {}),
      ...(label ? { label } : {}),
      ...(detected && suggestedMode ? { suggestedMode } : {}),
      ...(confidence !== undefined ? { confidence } : {}),
      hint,
    };
    // One line per frame so the phone's results can be watched live. No image data.
    console.log(
      `[frame-check]${source ? ` ${source}` : ""} mode=${m} ready=${ready} detected=${detected} key=${key || "-"} ` +
        `lastKey=${lastKey || "-"} raw=${rawKey || "-"} category=${category} ` +
        `label=${JSON.stringify(label)} suggested=${out.suggestedMode ?? "-"} ` +
        `conf=${confidence ?? "-"} hint=${JSON.stringify(hint)} ms=${Date.now() - started}`,
    );
    return { result: out, ok: true };
  } catch (error) {
    console.error("Frame check failed:", error instanceof Error ? error.message : error);
    console.log(
      `[frame-check]${source ? ` ${source}` : ""} mode=${m} error ms=${Date.now() - started}`,
    );
    // The camera keeps going; a failed check just means "not ready yet".
    return { result: { ready: false, detected: false, hint: "" }, ok: false };
  }
}
