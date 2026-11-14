import { beforeEach, describe, expect, it, vi } from "vitest";

const bg = vi.hoisted(() => ({ pending: [] as Promise<unknown>[] }));
vi.mock("next/server", () => ({
  after: (fn: () => unknown) => {
    bg.pending.push(Promise.resolve().then(fn));
  },
}));
vi.mock("@/lib/frameCheck", () => ({
  checkFrame: vi.fn(async () => ({
    result: { ready: false, detected: true, key: "red-bull-package", label: "Red Bull", hint: "" },
    ok: true,
  })),
}));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    dbConfigured: () => true,
    updateHatState: vi.fn(async () => ({ streak: 0, prevSeenKey: null })),
    claimHatRead: vi.fn(async () => false),
    claimHatHint: vi.fn(async () => false),
    addDeviceEvent: vi.fn(async () => 1),
    pairedPhone: vi.fn(async () => undefined),
  };
});
vi.mock("@/lib/analyze", () => ({ analyzePhoto: vi.fn() }));
vi.mock("@/lib/lookup", () => ({ webLookup: vi.fn() }));

import { POST } from "@/app/api/device/frame/route";
import * as db from "@/lib/db";
import { checkFrame } from "@/lib/frameCheck";
import { analyzePhoto } from "@/lib/analyze";
import { getFrame, noteCommand, resetFrameStore } from "@/lib/frameStore";

const KEY = "test-shared-key-for-unit-tests";
const JPEG = new Uint8Array(2_000).fill(7);
JPEG.set([0xff, 0xd8]);

function frame(key: string) {
  return new Request("http://localhost:3000/api/device/frame", {
    method: "POST",
    headers: { "content-type": "image/jpeg", "x-device-id": "hat-01", "x-device-key": key },
    body: JPEG,
  });
}

describe("POST /api/device/frame feeds the latest-frame store", () => {
  beforeEach(() => {
    process.env.DEVICE_SHARED_KEY = KEY;
    resetFrameStore();
    bg.pending.length = 0;
    vi.clearAllMocks();
  });

  it("keeps the hat's latest frame and its frame check in memory", async () => {
    const res = await POST(frame(KEY));
    expect(res.status).toBe(200);
    const stored = getFrame("hat-01");
    expect(stored?.bytes).toEqual(JPEG);
    expect(stored?.check).toMatchObject({ detected: true, key: "red-bull-package" });
  });

  it("doesn't store frames from a hat with the wrong key", async () => {
    const res = await POST(frame("wrong-key"));
    expect(res.status).toBe(401);
    expect(getFrame("hat-01")).toBeUndefined();
  });
});

describe("POST /api/device/frame auto-read vs voice commands", () => {
  beforeEach(() => {
    process.env.DEVICE_SHARED_KEY = KEY;
    resetFrameStore();
    bg.pending.length = 0;
    vi.clearAllMocks();
    // A ready target on its second frame in a row, so the hat reads it on its own.
    vi.mocked(checkFrame).mockResolvedValue({
      result: { ready: true, detected: true, key: "red-bull-package", label: "Red Bull", confidence: 0.95, hint: "" },
      ok: true,
    });
    vi.mocked(db.updateHatState).mockResolvedValue({ streak: 2, prevSeenKey: "bull-red" });
    vi.mocked(db.claimHatRead).mockResolvedValue(true);
    vi.mocked(analyzePhoto).mockResolvedValue({
      body: { spokenText: "Red Bull Energy Drink, 8.4 fluid ounces.", details: "", itemKind: "none" },
      status: 200,
      saved: Promise.resolve(),
    });
  });

  async function answers() {
    while (bg.pending.length) await Promise.all(bg.pending.splice(0));
    return vi.mocked(db.addDeviceEvent).mock.calls.filter(([, kind]) => kind === "answer");
  }

  it("auto-reads a target seen twice in a row", async () => {
    await POST(frame(KEY));
    expect(await answers()).toHaveLength(1);
  });

  it("drops an automatic answer when a voice command arrives while it's being read", async () => {
    vi.mocked(analyzePhoto).mockImplementation(async () => {
      noteCommand("hat-01"); // the user spoke while the hat was already reading
      return {
        body: { spokenText: "Red Bull Energy Drink, 8.4 fluid ounces.", details: "", itemKind: "none" },
        status: 200,
        saved: Promise.resolve(),
      };
    });
    await POST(frame(KEY));
    expect(await answers()).toHaveLength(0);
  });

  it("doesn't post a second, automatic answer while a voice command is being answered", async () => {
    noteCommand("hat-01");
    await POST(frame(KEY));
    expect(await answers()).toHaveLength(0);
  });
});
