import { after } from "next/server";
import { randomUUID } from "node:crypto";
import {
  LANGUAGES,
  MODES,
  type DeviceCommandResponse,
  type HatCommand,
  type HatCommandType,
  type Mode,
  type RequestMode,
} from "@/lib/modes";
import { parseCommand } from "@/lib/voice";
import { checkPairCode, matchKey, sharedKey, validHatId } from "@/lib/hat";
import { readJson } from "@/lib/http";
import { addDeviceEvent, claimHatRead, dbConfigured, deviceId, pairedPhone } from "@/lib/db";
import { getFrame, noteCommand, waitForFrame } from "@/lib/frameStore";
import { analyzePhoto } from "@/lib/analyze";
import { webLookup } from "@/lib/lookup";

// Voice commands for the hat camera. The user says "read this menu" or "search for this" to the
// phone in their pocket. The phone sends it here, and the hat's latest frame (kept in memory by
// /api/device/frame; see lib/frameStore.ts) is read right away. The reply only says whether
// the command was accepted. The answer and its web lookup arrive as `answer` events through
// /api/device/next, with this command's commandId.

export const maxDuration = 60;

const TYPES: HatCommandType[] = [
  "auto",
  "read",
  "describe",
  "menu",
  "translate",
  "question",
  "lookup",
];
const NO_PICTURE = "No picture from your hat camera. Is it on?";

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function reject(reason: "no-frame" | "unpaired" | "bad-command") {
  return json({ accepted: false, reason } satisfies DeviceCommandResponse);
}

function language(v: unknown): string | undefined {
  return typeof v === "string" && LANGUAGES.some((l) => l.name === v) ? v : undefined;
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/** The command to run: the explicit `command`, or what `text` says. Null if it isn't one. */
function toCommand(body: Record<string, unknown>): HatCommand | null {
  const c = body.command;
  if (c && typeof c === "object") {
    const o = c as Record<string, unknown>;
    if (!TYPES.includes(o.type as HatCommandType)) return null;
    const type = o.type as HatCommandType;
    if (type === "question") {
      const question = str(o.question, 500);
      return question ? { type, question } : null;
    }
    if (type === "translate") return { type, language: language(o.language) ?? "English" };
    return { type };
  }
  const text = str(body.text, 500);
  if (!text) return null;
  const parsed = parseCommand(text);
  switch (parsed.type) {
    case "capture":
      return parsed.mode === "translate"
        ? { type: "translate", language: parsed.language ?? "English" }
        : { type: parsed.mode };
    case "lookup":
      return { type: "lookup" };
    case "question":
      return { type: "question", question: parsed.text };
    default:
      return null; // stop, repeat and help are handled on the phone; history questions go to /api/ask
  }
}

export async function POST(request: Request) {
  if (!sharedKey() || !dbConfigured()) return json({ error: "hat camera is not set up" }, 503);

  const parsed = await readJson(request, 8_000);
  if (!parsed.ok) return json({ error: "send a JSON body" }, 400);
  const body = parsed.body;
  const hat = body.device;
  if (!validHatId(hat)) return json({ error: "missing or invalid device" }, 400);
  const phone = deviceId(request);
  if (!phone) return json({ error: "missing x-sightline-device header" }, 401);
  if (!checkPairCode(hat, typeof body.pair === "string" ? body.pair : null)) {
    return json({ error: "wrong pair code" }, 403);
  }

  const command = toCommand(body);
  if (!command) return reject("bad-command");
  // The phone pairs by polling /api/device/next; commands only come from the paired phone.
  if ((await pairedPhone(hat)) !== phone) return reject("unpaired");
  // Nothing at all from the hat in the last 15 seconds: it's off or out of range.
  if (!getFrame(hat)) return reject("no-frame");

  const commandId = randomUUID();
  noteCommand(hat); // the hat's own auto-read stays quiet while this is answered
  console.log(`[hat-command] ${hat} ${JSON.stringify(command)} id=${commandId.slice(0, 8)}`);
  after(() => runCommand(hat, phone, commandId, command));
  return json({ accepted: true, commandId } satisfies DeviceCommandResponse);
}

/** Read the hat's current view for one command, then post the answer (and lookup) as events. */
async function runCommand(hat: string, owner: string, commandId: string, command: HatCommand) {
  const started = Date.now();
  try {
    const frame = await waitForFrame(hat);
    if (!frame) {
      await addDeviceEvent(hat, "status", { commandId, text: NO_PICTURE });
      return;
    }
    const check = frame.check;
    const mode: RequestMode =
      command.type === "auto"
        ? "auto" // the server chooses the mode for this frame
        : MODES.includes(command.type as Mode)
          ? (command.type as Mode)
          : (check?.suggestedMode ?? (command.type === "lookup" ? "menu" : "describe"));
    const lang = command.type === "translate" ? (command.language ?? "English") : "English";

    // An explicit request always reads (even what was just read), and marks the target as read
    // so the hat's auto-read doesn't read it again straight after.
    const [{ body: answer, saved, mode: answeredIn }] = await Promise.all([
      analyzePhoto({
        image: Buffer.from(frame.bytes).toString("base64"),
        mode,
        language: lang,
        question: command.type === "question" ? command.question : undefined,
        key: check?.key,
        device: owner,
        persist: "defer",
      }),
      claimHatRead(hat, check?.key ? matchKey(check.key) : `command-${commandId}`, true),
    ]);
    await Promise.all([
      saved,
      addDeviceEvent(hat, "answer", {
        commandId,
        command,
        scanId: answer.scanId ?? null,
        mode: answeredIn ?? (mode === "auto" ? "describe" : mode),
        label: check?.label ?? "",
        key: check?.key ?? "",
        button: false,
        spokenText: answer.spokenText,
        sections: answer.sections ?? [],
        itemKind: answer.itemKind ?? "none",
        webQuery: answer.webQuery ?? "",
        error: Boolean(answer.error),
      }),
    ]);
    console.log(
      `[hat-command] ${hat} ${command.type} answered in ${Date.now() - started}ms: ${answer.spokenText.slice(0, 80)}`,
    );

    // "search for this" always looks it up; other reads do when something was identified,
    // as the app does. Follow-up questions don't.
    const identified = Boolean(answer.webQuery && answer.itemKind && answer.itemKind !== "none");
    const wantLookup =
      !answer.error && (command.type === "lookup" || (command.type !== "question" && identified));
    if (!wantLookup) return;
    const { body: lookup } = await webLookup(
      {
        query: answer.webQuery ?? "",
        itemKind: answer.itemKind ?? "none",
        scanId: answer.scanId,
        language: lang,
        context: {
          mode: answeredIn ?? (mode === "auto" ? "describe" : mode),
          spokenText: answer.spokenText,
          details: answer.details,
        },
      },
      { device: owner, persist: "await" },
    );
    if (!lookup.skipped || command.type === "lookup") {
      await addDeviceEvent(hat, "answer", {
        commandId,
        command,
        scanId: answer.scanId ?? null,
        update: "lookup",
        lookup,
      });
    }
  } catch (error) {
    console.error("Hat command failed:", error instanceof Error ? error.message : error);
    await addDeviceEvent(hat, "status", {
      commandId,
      text: "Sorry, that didn't work. Please try again.",
    });
  }
}
