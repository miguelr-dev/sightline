import { checkPairCode, sharedKey, validHatId } from "@/lib/hat";
import { dbConfigured, deviceEventsAfter, deviceId, pairHat, pairedPhone } from "@/lib/db";

// The paired phone polls this about every 700 ms for the hat's new events:
//   GET /api/device/next?device=<hat id>&pair=<pair code>&after=<last event id>
// with its x-sightline-device header. A correct pair code also pairs this phone with the hat,
// so the hat's scans go into this phone's history.

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  if (!sharedKey() || !dbConfigured()) return json({ error: "hat camera is not set up" }, 503);

  const url = new URL(request.url);
  const hat = url.searchParams.get("device");
  const phone = deviceId(request);
  if (!validHatId(hat)) return json({ error: "missing or invalid device" }, 400);
  if (!phone) return json({ error: "missing x-sightline-device header" }, 400);
  if (!checkPairCode(hat, url.searchParams.get("pair"))) {
    return json({ error: "wrong pair code" }, 403);
  }

  const afterParam = url.searchParams.get("after");
  const afterId = afterParam && /^\d{1,15}$/.test(afterParam) ? Number(afterParam) : null;

  const [owner, events] = await Promise.all([pairedPhone(hat), deviceEventsAfter(hat, afterId)]);
  if (owner !== phone) await pairHat(hat, phone);

  const list = events ?? [];
  return json({
    events: list,
    last: list.length ? list[list.length - 1].id : afterId,
    paired: true,
  });
}
