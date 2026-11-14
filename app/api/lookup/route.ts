import { deviceId } from "@/lib/db";
import { webLookup } from "@/lib/lookup";

// Web lookup for the last answer. The client calls this after the first answer has been spoken,
// so it never delays it.

export const maxDuration = 30;

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return Response.json(
      {
        spokenText: "Sorry, that web lookup request didn't come through.",
        details: "",
        query: "",
        sources: [],
        error: true,
      },
      { status: 400 },
    );
  }
  const result = await webLookup(body, { device: deviceId(request) });
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
