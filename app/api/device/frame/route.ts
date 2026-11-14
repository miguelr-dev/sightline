import { after } from "next/server";
import type { FrameCheckResponse, Mode } from "@/lib/modes";
import { checkFrame } from "@/lib/frameCheck";
import { analyzePhoto } from "@/lib/analyze";
import { webLookup } from "@/lib/lookup";
import { checkDeviceKey, sharedKey, validHatId } from "@/lib/hat";
import {
  addDeviceEvent,
  claimHatHint,
  claimHatRead,
  dbConfigured,
  pairedPhone,
  updateHatState,
} from "@/lib/db";

// Hat camera: the board POSTs a raw JPEG about every 1.5 seconds. We check the frame, reply at
// once, and when a target is clearly readable (ready with confidence >= 0.7 on two frames in a
// row, or the hat's button was pressed) read it and look it up after replying. Results go to
// device_events, which the paired phone polls through /api/device/next and speaks.

export const maxDuration = 60; // the read and web lookup run after the reply

const MAX_BYTES = 4_500_000;
const MIN_CONFIDENCE = 0.7;
const FRAMES_IN_A_ROW = 2;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!sharedKey()) return json({ error: "hat camera is not set up (DEVICE_SHARED_KEY)" }, 503);
  if (!dbConfigured()) return json({ error: "hat camera needs DATABASE_URL" }, 503);

  const hat = request.headers.get("x-device-id");
  if (!validHatId(hat)) return json({ error: "missing or invalid x-device-id" }, 400);
  if (!checkDeviceKey(request.headers.get("x-device-key"))) {
    return json({ error: "bad x-device-key" }, 401);
  }

  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.length < 1_000 || bytes.length > MAX_BYTES) {
    return json({ error: "send one JPEG between 1 KB and 4.5 MB" }, 413);
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: "body must be a JPEG" }, 415);
  const image = Buffer.from(bytes).toString("base64");
  const button = request.headers.get("x-device-button") === "1";

  const { result: fc } = await checkFrame(image, "read", `hat=${hat}${button ? " button" : ""}`);
  const readyKey =
    fc.ready && fc.key && (fc.confidence ?? 0) >= MIN_CONFIDENCE ? fc.key : null;
  const state = await updateHatState(hat, readyKey, fc.detected ? (fc.key ?? null) : null);

  // Read when the same ready target shows up twice in a row (and it wasn't just read), or on
  // the button. The claim is atomic, so overlapping frames can't read the same thing twice.
  const wantsRead = button || Boolean(readyKey && (state?.streak ?? 0) >= FRAMES_IN_A_ROW);
  const reading =
    wantsRead && (await claimHatRead(hat, readyKey ?? fc.key ?? `button-${Date.now()}`, button));

  after(async () => {
    if (fc.detected && fc.key && fc.key !== state?.prevSeenKey) {
      await addDeviceEvent(hat, "detected", {
        label: fc.label ?? "",
        key: fc.key,
        suggestedMode: fc.suggestedMode ?? "read",
      });
    }
    if (!reading && !fc.ready && fc.hint && (await claimHatHint(hat))) {
      await addDeviceEvent(hat, "hint", { hint: fc.hint });
    }
    if (reading) await readAndLookUp(hat, image, fc, button);
  });

  const reply: FrameCheckResponse & { reading: boolean } = {
    ready: fc.ready,
    detected: fc.detected,
    ...(fc.label ? { label: fc.label } : {}),
    hint: fc.hint ?? "",
    reading,
  };
  return json(reply);
}

/** Read the frame like the phone app would, then look it up on the web, posting both as events. */
async function readAndLookUp(hat: string, image: string, fc: FrameCheckResponse, button: boolean) {
  // Hat scans go into the paired phone's history, so "Ask your history" covers them too.
  const owner = (await pairedPhone(hat)) ?? `hat-${hat}`;
  const mode: Mode = fc.suggestedMode ?? (fc.detected ? "read" : "describe");
  const started = Date.now();
  const { body: answer } = await analyzePhoto({
    image,
    mode,
    language: "English",
    key: fc.key,
    device: owner,
    persist: "await", // the scan row must exist before the lookup is attached to it
  });
  await addDeviceEvent(hat, "answer", {
    scanId: answer.scanId ?? null,
    mode,
    label: fc.label ?? "",
    key: fc.key ?? "",
    button,
    spokenText: answer.spokenText,
    sections: answer.sections ?? [],
    itemKind: answer.itemKind ?? "none",
    webQuery: answer.webQuery ?? "",
    error: Boolean(answer.error),
  });
  console.log(`[hat] ${hat} read ${mode} in ${Date.now() - started}ms: ${answer.spokenText.slice(0, 80)}`);

  // Web lookup, the same as the app does after an answer.
  if (!answer.error && answer.webQuery && answer.itemKind && answer.itemKind !== "none") {
    const { body: lookup } = await webLookup(
      {
        query: answer.webQuery,
        itemKind: answer.itemKind,
        scanId: answer.scanId,
        context: { mode, spokenText: answer.spokenText },
      },
      { device: owner, persist: "await" },
    );
    if (!lookup.skipped) {
      await addDeviceEvent(hat, "answer", {
        scanId: answer.scanId ?? null,
        update: "lookup",
        lookup,
      });
    }
  }
}
