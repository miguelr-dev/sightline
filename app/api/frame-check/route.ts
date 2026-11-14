import { MODES, type FrameCheckResponse, type Mode } from "@/lib/modes";
import { checkFrame } from "@/lib/frameCheck";
import { readJson } from "@/lib/http";

// Auto-capture helper for the mobile app. See lib/frameCheck.ts.

export const maxDuration = 15;

const MAX_IMAGE_CHARS = 1_500_000;
const NOT_READY: FrameCheckResponse = { ready: false, detected: false, hint: "" };

export async function POST(request: Request) {
  const parsed = await readJson(request, MAX_IMAGE_CHARS + 10_000);
  if (!parsed.ok)
    return Response.json(NOT_READY, { status: parsed.reason === "too-large" ? 413 : 400 });
  const { image, mode, lastKey, lastLabel } = parsed.body;
  if (typeof image !== "string" || image.length < 100 || image.length > MAX_IMAGE_CHARS) {
    return Response.json(NOT_READY, { status: 400 });
  }
  const m: Mode =
    typeof mode === "string" && MODES.includes(mode as Mode) ? (mode as Mode) : "read";
  if (!process.env.ANTHROPIC_API_KEY) return Response.json(NOT_READY, { status: 500 });

  // What the phone saw on the previous frame, so the same item keeps the same key.
  const { result, ok } = await checkFrame(image, m, undefined, {
    lastKey: typeof lastKey === "string" ? lastKey : undefined,
    lastLabel: typeof lastLabel === "string" ? lastLabel : undefined,
  });
  return Response.json(result, {
    status: ok ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
