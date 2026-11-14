import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Background work scheduled with next/server's after() is collected here so tests can await it.
const bg = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    bg.pending.push(Promise.resolve().then(fn));
  },
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    dbConfigured: () => true,
    pairedPhone: vi.fn(),
    addDeviceEvent: vi.fn(async () => 1),
    claimHatRead: vi.fn(async () => true),
  };
});
vi.mock("@/lib/analyze", () => ({ analyzePhoto: vi.fn() }));
vi.mock("@/lib/lookup", () => ({ webLookup: vi.fn() }));

import { POST } from "@/app/api/device/command/route";
import * as db from "@/lib/db";
import { analyzePhoto } from "@/lib/analyze";
import { webLookup } from "@/lib/lookup";
import { pairCode } from "@/lib/hat";
import { putFrame, resetFrameStore } from "@/lib/frameStore";

const KEY = "test-shared-key-for-unit-tests";
const HAT = "hat-01";
const PHONE = "phone-1234-abcd";
const FRAME = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const FRAME_B64 = Buffer.from(FRAME).toString("base64");
const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function request(body: unknown, phone: string | null = PHONE) {
  return new Request("http://localhost:3000/api/device/command", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(phone ? { "x-sightline-device": phone } : {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function command(extra: Record<string, unknown>) {
  return request({ device: HAT, pair: pairCode(HAT, KEY), ...extra });
}

async function drain() {
  while (bg.pending.length) await Promise.all(bg.pending.splice(0));
}

function analyzeReturns(body: Record<string, unknown>) {
  vi.mocked(analyzePhoto).mockResolvedValue({
    body: { spokenText: "", details: "", sections: [], ...body } as never,
    status: 200,
    saved: Promise.resolve(),
  });
}

function lookupReturns(spokenText: string) {
  vi.mocked(webLookup).mockResolvedValue({
    body: { spokenText, details: "", query: "q", sources: [] },
    status: 200,
  });
}

function eventsOfKind(kind: string) {
  return vi
    .mocked(db.addDeviceEvent)
    .mock.calls.filter(([hat, k]) => hat === HAT && k === kind)
    .map(([, , payload]) => payload as Record<string, unknown>);
}

describe("POST /api/device/command", () => {
  beforeEach(() => {
    process.env.DEVICE_SHARED_KEY = KEY;
    resetFrameStore();
    bg.pending.length = 0;
    vi.clearAllMocks();
    vi.mocked(db.pairedPhone).mockResolvedValue(PHONE);
    analyzeReturns({
      spokenText: "Harbor Table lunch menu: starters, mains and desserts.",
      itemKind: "restaurant",
      webQuery: "Harbor Table menu hours reviews allergens",
      scanId: SCAN_ID,
    });
    lookupReturns("From the web: Harbor Table is open 11 to 2.");
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("auth and validation", () => {
    it("400 for a body that isn't JSON", async () => {
      const res = await POST(request("not json"));
      expect(res.status).toBe(400);
    });

    it("400 for a missing or invalid hat id", async () => {
      const res = await POST(request({ pair: "x", text: "read this" }));
      expect(res.status).toBe(400);
    });

    it("401 without the phone's x-sightline-device header", async () => {
      const res = await POST(
        request({ device: HAT, pair: pairCode(HAT, KEY), text: "read this" }, null),
      );
      expect(res.status).toBe(401);
    });

    it("403 for a wrong pair code", async () => {
      const res = await POST(request({ device: HAT, pair: "wrongcod", text: "read this" }));
      expect(res.status).toBe(403);
    });

    it("503 when the hat camera isn't set up", async () => {
      process.env.DEVICE_SHARED_KEY = "";
      const res = await POST(command({ text: "read this" }));
      expect(res.status).toBe(503);
    });
  });

  describe("rejections", () => {
    it("unpaired when this phone isn't the hat's paired phone", async () => {
      putFrame(HAT, FRAME);
      vi.mocked(db.pairedPhone).mockResolvedValue("some-other-phone-99");
      const res = await POST(command({ text: "read this" }));
      expect(await res.json()).toEqual({ accepted: false, reason: "unpaired" });
    });

    it.each([
      ["stop", { text: "stop" }],
      ["help", { text: "help" }],
      ["a history question", { text: "what did I scan yesterday" }],
      ["an unknown type", { command: { type: "dance" } }],
      ["nothing at all", {}],
    ])("bad-command for %s", async (_name, extra) => {
      putFrame(HAT, FRAME);
      const res = await POST(command(extra));
      expect(await res.json()).toEqual({ accepted: false, reason: "bad-command" });
    });

    it("no-frame when the hat hasn't sent anything recently", async () => {
      const res = await POST(command({ text: "read this" }));
      expect(await res.json()).toEqual({ accepted: false, reason: "no-frame" });
    });
  });

  describe("accepted commands", () => {
    it('"read this menu": reads the latest frame and posts the answer and lookup', async () => {
      putFrame(HAT, FRAME);
      const res = await POST(command({ text: "read this menu" }));
      const body = await res.json();
      expect(body).toEqual({ accepted: true, commandId: expect.stringMatching(UUID) });
      await drain();

      expect(analyzePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ image: FRAME_B64, mode: "menu", device: PHONE }),
      );
      const [answer, update] = eventsOfKind("answer");
      expect(answer).toMatchObject({
        commandId: body.commandId,
        command: { type: "menu" },
        scanId: SCAN_ID,
        mode: "menu",
        spokenText: "Harbor Table lunch menu: starters, mains and desserts.",
      });
      expect(update).toMatchObject({
        commandId: body.commandId,
        update: "lookup",
        lookup: { spokenText: "From the web: Harbor Table is open 11 to 2." },
      });
    });

    it("an explicit command reads even the target that was just read (claims with force)", async () => {
      putFrame(HAT, FRAME);
      await POST(command({ command: { type: "read" } }));
      await drain();
      expect(analyzePhoto).toHaveBeenCalledTimes(1);
      expect(db.claimHatRead).toHaveBeenCalledWith(HAT, expect.any(String), true);
    });

    it('"lookup" forces a web lookup even when nothing was identified', async () => {
      putFrame(HAT, FRAME);
      analyzeReturns({ spokenText: "A can with a blue label.", itemKind: "none", webQuery: "" });
      lookupReturns("From the web: Red Bull has 80 milligrams of caffeine.");
      const body = await (await POST(command({ text: "search for this" }))).json();
      await drain();

      expect(webLookup).toHaveBeenCalledTimes(1);
      expect(vi.mocked(webLookup).mock.calls[0][0]).toMatchObject({
        context: { spokenText: "A can with a blue label." },
      });
      const [answer, update] = eventsOfKind("answer");
      expect(answer).toMatchObject({ commandId: body.commandId, command: { type: "lookup" } });
      expect(update).toMatchObject({
        commandId: body.commandId,
        update: "lookup",
        lookup: { spokenText: "From the web: Red Bull has 80 milligrams of caffeine." },
      });
    });

    it('"question" passes the question as a follow-up about that frame, with no lookup', async () => {
      putFrame(HAT, FRAME);
      await POST(command({ command: { type: "question", question: "How much is the salmon?" } }));
      await drain();
      expect(analyzePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ image: FRAME_B64, question: "How much is the salmon?" }),
      );
      expect(webLookup).not.toHaveBeenCalled();
      expect(eventsOfKind("answer")[0]).toMatchObject({
        command: { type: "question", question: "How much is the salmon?" },
      });
    });

    it("plain text that isn't a command becomes a question", async () => {
      putFrame(HAT, FRAME);
      await POST(command({ text: "Is there anything vegetarian?" }));
      await drain();
      expect(analyzePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ question: "Is there anything vegetarian?" }),
      );
    });

    it('"translate this to Spanish" reads in Translate mode with that language', async () => {
      putFrame(HAT, FRAME);
      await POST(command({ text: "translate this to Spanish" }));
      await drain();
      expect(analyzePhoto).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "translate", language: "Spanish" }),
      );
    });

    it("waits for a fresh frame, then posts a status event if none comes", async () => {
      vi.useFakeTimers();
      putFrame(HAT, FRAME);
      vi.advanceTimersByTime(5_000); // stale, but the hat was on recently
      const body = await (await POST(command({ text: "read this" }))).json();
      expect(body.accepted).toBe(true);
      await vi.advanceTimersByTimeAsync(4_100);
      await drain();
      expect(analyzePhoto).not.toHaveBeenCalled();
      expect(eventsOfKind("status")).toEqual([
        { commandId: body.commandId, text: "No picture from your hat camera. Is it on?" },
      ]);
    });

    it("uses the next frame when it arrives during the wait", async () => {
      vi.useFakeTimers();
      putFrame(HAT, new Uint8Array([0xff, 0xd8, 9]));
      vi.advanceTimersByTime(5_000);
      await POST(command({ text: "read this" }));
      await vi.advanceTimersByTimeAsync(1_000);
      putFrame(HAT, FRAME);
      await vi.advanceTimersByTimeAsync(10);
      await drain();
      expect(analyzePhoto).toHaveBeenCalledWith(expect.objectContaining({ image: FRAME_B64 }));
    });
  });
});
