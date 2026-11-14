import { checkPairCode, sharedKey, validHatId } from "@/lib/hat";
import { readJson } from "@/lib/http";
import { dbConfigured, deviceId, unpairHat } from "@/lib/db";

// The paired phone lets go of a hat, so another phone can pair with it straight away
// (otherwise that takes 60 s of silence). Body: { device, pair }, plus the phone's
// x-sightline-device header. Only the paired phone can unpair.

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sharedKey() || !dbConfigured()) return json({ error: "hat camera is not set up" }, 503);
  const parsed = await readJson(request, 4_000);
  if (!parsed.ok) return json({ error: "send a JSON body" }, 400);
  const hat = parsed.body.device;
  if (!validHatId(hat)) return json({ error: "missing or invalid device" }, 400);
  const phone = deviceId(request);
  if (!phone) return json({ error: "missing x-sightline-device header" }, 401);
  const pair = typeof parsed.body.pair === "string" ? parsed.body.pair : null;
  if (!checkPairCode(hat, pair)) return json({ error: "wrong pair code" }, 403);
  return json({ unpaired: await unpairHat(hat, phone) });
}
