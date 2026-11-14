import type { HistoryResponse } from "@/lib/modes";
import { clearScans, dbConfigured, deviceId, listScans } from "@/lib/db";

// Scan history for one device, identified by its x-sightline-device header (a random ID the
// app keeps). Stores answer text and web image URLs only, never photos.

const headers = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const device = deviceId(request);
  if (!device || !dbConfigured()) {
    return Response.json({ scans: [] } satisfies HistoryResponse, { headers });
  }
  const raw = Number(new URL(request.url).searchParams.get("limit") ?? 20);
  const limit = Number.isFinite(raw) ? Math.min(100, Math.max(1, Math.floor(raw))) : 20;
  const scans = (await listScans(device, limit)) ?? [];
  return Response.json({ scans } satisfies HistoryResponse, { headers });
}

export async function DELETE(request: Request) {
  const device = deviceId(request);
  if (!device) {
    return Response.json({ deleted: 0, error: "missing x-sightline-device header" }, {
      status: 400,
      headers,
    });
  }
  const deleted = (await clearScans(device)) ?? 0;
  return Response.json({ deleted }, { headers });
}
