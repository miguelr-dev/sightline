import Anthropic from "@anthropic-ai/sdk";
import { MODES, type FrameCheckResponse, type Mode } from "@/lib/modes";
import { askJson, fastModel } from "@/lib/claude";

// Auto-capture helper for the mobile app: is there a readable target fully in frame?
// Small image, tiny prompt, fast model, no thinking.

export const maxDuration = 15;

const MAX_IMAGE_CHARS = 1_500_000;

const SCHEMA = {
  type: "object",
  properties: {
    ready: { type: "boolean" },
    key: { type: "string" },
    hint: { type: "string" },
  },
  required: ["ready", "key", "hint"],
  additionalProperties: false,
} as const;

const TARGET: Record<Mode, string> = {
  read: "a page, sign, screen or document with text",
  describe: "a scene",
  menu: "a menu page, product package, or medicine label",
  translate: "a sign or text in any language",
};

function system(mode: Mode): string {
  return `You check camera frames for a blind user's auto-capture. Target: ${TARGET[mode]}.
ready: true only if the whole target is in frame, sharp enough to read, and lit well enough.${mode === "describe" ? " For a scene, ready is true unless the frame is very blurry or dark." : ""}
key: an id for the target that stays the same every time you see it: its brand or title in 2 or 3 lowercase words plus one type word (menu, package, label, sign, page, scene), hyphenated, e.g. "nutter-butter-package", "harbor-table-menu", "demo-prin-label". Never add sizes, counts or other details. Empty if no target.
hint: if not ready, one spoken tip of 2 to 5 words, e.g. "Move back a little", "Tilt down", "Move left", "Hold still", "Too dark". Empty if ready or nothing relevant is in view.`;
}

function slug(v: unknown): string {
  if (typeof v !== "string") return "";
  return v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json({ ready: false, hint: "" } satisfies FrameCheckResponse, { status: 400 });
  }
  const { image, mode } = body;
  if (typeof image !== "string" || image.length < 100 || image.length > MAX_IMAGE_CHARS) {
    return Response.json({ ready: false, hint: "" } satisfies FrameCheckResponse, { status: 400 });
  }
  const m: Mode = typeof mode === "string" && MODES.includes(mode as Mode) ? (mode as Mode) : "read";
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ ready: false, hint: "" } satisfies FrameCheckResponse, { status: 500 });
  }

  try {
    const parsed = await askJson<{ ready?: unknown; key?: unknown; hint?: unknown }>(
      new Anthropic(),
      {
        model: fastModel(),
        maxTokens: 120,
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
      },
    );
    const ready = parsed?.ready === true;
    const key = slug(parsed?.key);
    const hint =
      !ready && typeof parsed?.hint === "string" ? parsed.hint.trim().slice(0, 60) : "";
    const out: FrameCheckResponse = { ready, ...(key ? { key } : {}), hint };
    return Response.json(out, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Frame check failed:", error instanceof Error ? error.message : error);
    // The app keeps showing the camera; a failed check just means "not ready yet".
    return Response.json({ ready: false, hint: "" } satisfies FrameCheckResponse, { status: 502 });
  }
}
