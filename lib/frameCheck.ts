import Anthropic from "@anthropic-ai/sdk";
import { MODES, type FrameCheckResponse, type Mode } from "@/lib/modes";
import { askJson, fastModel } from "@/lib/claude";

// Server-only. Auto-capture check, used by /api/frame-check (phone) and /api/device/frame (hat): is a readable target in view (detected, for a
// "Menu detected, tap to read" card), and can its main text be read right now (ready, to
// auto-read)? Small image, tiny prompt, fast model, no thinking.

const SCHEMA = {
  type: "object",
  properties: {
    detected: { type: "boolean" },
    label: { type: "string" },
    suggestedMode: { type: "string", enum: [...MODES] },
    ready: { type: "boolean" },
    confidence: { type: "number" },
    key: { type: "string" },
    hint: { type: "string" },
  },
  required: ["detected", "label", "suggestedMode", "ready", "confidence", "key", "hint"],
  additionalProperties: false,
} as const;

function system(mode: Mode): string {
  return `You check handheld phone camera frames for a blind user. Frames are small, often angled, with glare.
detected: true if any readable target is visible at all: a product, package, menu, sign, label, screen or document, even if partly cut off or a little blurry. False for empty walls, floors, ordinary scenes, or a blur.
label: a short spoken name of 2 to 4 words, e.g. "Nutter Butter cookies", "Lunch menu", "Spanish street sign", "Medicine box", "Presentation slide". Empty if not detected.
suggestedMode: "menu" for a menu, product, package or medicine; "translate" for text not in English; "read" for a document, slide, screen or other text; "describe" for a scene. The user is in ${mode} mode now.
ready: true if the target's main text or name and main facts can be read now, even with edges cut off, an angle, or some glare. False only if the main text can't be read: too blurry, too dark, too far, or mostly out of frame.${mode === "describe" ? " In describe mode, a clear scene is also ready." : ""}
confidence: 0 to 1, how sure you are that ready is right.
key: an id that stays the same each time you see this target: its brand or title in 2 or 3 lowercase words plus one type word (menu, package, label, sign, page, slide, scene), hyphenated, e.g. "nutter-butter-package", "harbor-table-menu". No sizes or counts. Empty if not detected.
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
): Promise<{ result: FrameCheckResponse; ok: boolean }> {
  const started = Date.now();
  try {
    const parsed = await askJson<{
      detected?: unknown;
      label?: unknown;
      suggestedMode?: unknown;
      ready?: unknown;
      confidence?: unknown;
      key?: unknown;
      hint?: unknown;
    }>(new Anthropic(), {
      model: fastModel(),
      maxTokens: 160,
      timeoutMs: 6_000,
      system: system(m),
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/jpeg",
            data: image.replace(/^data:image\/\w+;base64,/, ""),
          },
        },
        { type: "text", text: "Check this frame." },
      ],
      schema: SCHEMA,
    });
    const ready = parsed?.ready === true;
    const detected = parsed?.detected === true || ready;
    const key = detected ? slug(parsed?.key) : "";
    const label =
      detected && typeof parsed?.label === "string" ? parsed.label.trim().slice(0, 60) : "";
    const suggestedMode = MODES.includes(parsed?.suggestedMode as Mode)
      ? (parsed?.suggestedMode as Mode)
      : undefined;
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
