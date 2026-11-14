export type HatStatus = "connecting" | "live" | "missing" | "unauthorized" | "invalid" | "elsewhere" | "offline";

/** What a /api/device/next reply means for the hat screen. */
export function hatStatusFor(code: number, body: unknown): HatStatus {
  if (code === 200) return "live";
  if (code === 409 && (body as { reason?: unknown } | null)?.reason === "paired-elsewhere") return "elsewhere";
  if (code === 401 || code === 403) return "unauthorized";
  if (code === 400) return "invalid";
  if (code === 404 || code === 405 || code === 503) return "missing";
  return "offline";
}
