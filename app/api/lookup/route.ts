import { deviceId } from "@/lib/db";
import { webLookup } from "@/lib/lookup";
import { readJson } from "@/lib/http";

// Web lookup for the last answer. The client calls this after the first answer has been spoken,
// so it never delays it.

export const maxDuration = 30;

export async function POST(request: Request) {
  // A query plus the answer it's about: a few KB. 64 KB is plenty.
  const parsed = await readJson(request, 64_000);
  if (!parsed.ok) {
    return Response.json(
      {
        spokenText: "Sorry, that web lookup request didn't come through.",
        details: "",
        query: "",
        sources: [],
        error: true,
      },
      { status: parsed.reason === "too-large" ? 413 : 400 },
    );
  }
  const result = await webLookup(parsed.body, { device: deviceId(request) });
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
