import { MODES, type FrameCheckResponse, type Mode } from "@/lib/modes";
import { checkFrame } from "@/lib/frameCheck";

// Auto-capture helper for the mobile app. See lib/frameCheck.ts.

export const maxDuration = 15;

const MAX_IMAGE_CHARS = 1_500_000;
const NOT_READY: FrameCheckResponse = { ready: false, detected: false, hint: "" };

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json(NOT_READY, { status: 400 });
  }
  const { image, mode } = body;
  if (typeof image !== "string" || image.length < 100 || image.length > MAX_IMAGE_CHARS) {
    return Response.json(NOT_READY, { status: 400 });
  }
  const m: Mode =
    typeof mode === "string" && MODES.includes(mode as Mode) ? (mode as Mode) : "read";
  if (!process.env.ANTHROPIC_API_KEY) return Response.json(NOT_READY, { status: 500 });

  const { result, ok } = await checkFrame(image, m);
  return Response.json(result, {
    status: ok ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
