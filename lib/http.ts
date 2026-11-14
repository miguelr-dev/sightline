// Server-only: read a request body with a hard size cap, so an oversized upload is refused
// without buffering all of it. (Vercel stops bodies over 4.5 MB itself; `next dev` does not.)

/** The body's bytes, or null if it's larger than `maxBytes` (checked as it streams in). */
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export type JsonBody =
  { ok: true; body: Record<string, unknown> } | { ok: false; reason: "too-large" | "bad-json" };

/** Parse a JSON object body of at most `maxBytes`. */
export async function readJson(request: Request, maxBytes: number): Promise<JsonBody> {
  let bytes: Uint8Array | null;
  try {
    bytes = await readBody(request, maxBytes);
  } catch {
    return { ok: false, reason: "bad-json" };
  }
  if (!bytes) return { ok: false, reason: "too-large" };
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return {
      ok: true,
      body: (parsed && typeof parsed === "object" ? parsed : {}) as Record<string, unknown>,
    };
  } catch {
    return { ok: false, reason: "bad-json" };
  }
}

/** The media type of a base64 image from its first bytes; Claude needs it to match. */
export function imageMediaType(
  base64: string,
): "image/jpeg" | "image/png" | "image/webp" | "image/gif" {
  if (base64.startsWith("iVBORw0KGgo")) return "image/png";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/jpeg";
}
