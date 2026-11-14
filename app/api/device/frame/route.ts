import { after } from "next/server";
import type { FrameCheckResponse, Mode } from "@/lib/modes";
import { checkFrame } from "@/lib/frameCheck";
import { analyzePhoto } from "@/lib/analyze";
import { webLookup } from "@/lib/lookup";
import { checkDeviceKey, matchKey, sameTarget, sharedKey, validHatId } from "@/lib/hat";
import { readBody } from "@/lib/http";
import { annotateFrame, commandActive, putFrame } from "@/lib/frameStore";
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

  const bytes = await readBody(request, MAX_BYTES).catch(() => null);
  if (!bytes || bytes.length < 1_000) {
    return json({ error: "send one JPEG between 1 KB and 4.5 MB" }, 413);
  }
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return json({ error: "body must be a JPEG" }, 415);
  // Keep it in memory (never on disk or in Neon) so a voice command can read what the hat
  // sees right now; see lib/frameStore.ts.
  const stored = putFrame(hat, bytes);
  const image = Buffer.from(bytes).toString("base64");
  const button = request.headers.get("x-device-button") === "1";

  const { result: fc } = await checkFrame(image, "read", `hat=${hat}${button ? " button" : ""}`);
  annotateFrame(hat, stored, fc);
  // Match keys, so "calle-mayor-precaucion-sign" and "precaucion-calle-mayor-sign" count as one.
  const seenKey = fc.detected && fc.key ? matchKey(fc.key) : null;
  const readyKey = fc.ready && seenKey && (fc.confidence ?? 0) >= MIN_CONFIDENCE ? seenKey : null;
  const state = await updateHatState(hat, readyKey, seenKey);

  // Read when the same ready target shows up twice in a row (and it wasn't just read), or on
  // the button. The claim is atomic, so overlapping frames can't read the same thing twice.
  const wantsRead = button || Boolean(readyKey && (state?.streak ?? 0) >= FRAMES_IN_A_ROW);
  const reading =
    wantsRead && (await claimHatRead(hat, readyKey ?? fc.key ?? `button-${Date.now()}`, button));

  after(async () => {
    if (fc.detected && fc.key && !sameTarget(seenKey, state?.prevSeenKey)) {
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
  // A voice command for this hat is being answered: don't speak a second, automatic answer.
  if (!button && commandActive(hat)) return;
  // Hat scans go into the paired phone's history, so "Ask your history" covers them too.
  const owner = (await pairedPhone(hat)) ?? `hat-${hat}`;
  const mode: Mode = fc.suggestedMode ?? (fc.detected ? "read" : "describe");
  const started = Date.now();
  const { body: answer, saved } = await analyzePhoto({
    image,
    mode,
    language: "English",
    key: fc.key,
    device: owner,
    persist: "defer", // post the answer while the scan row is written; the lookup waits for both
  });
  // The user asked for something by voice while this was being read: their command answers.
  if (!button && commandActive(hat)) {
    await saved;
    return;
  }
  await Promise.all([
    saved,
    addDeviceEvent(hat, "answer", {
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
    }),
  ]);
  console.log(
    `[hat] ${hat} read ${mode} in ${Date.now() - started}ms: ${answer.spokenText.slice(0, 80)}`,
  );

  // Web lookup, the same as the app does after an answer.
  if (!answer.error && answer.webQuery && answer.itemKind && answer.itemKind !== "none") {
    const { body: lookup } = await webLookup(
      {
        query: answer.webQuery,
        itemKind: answer.itemKind,
        brand: answer.brand,
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
