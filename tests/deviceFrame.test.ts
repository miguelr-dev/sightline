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
import { getFrame, resetFrameStore } from "@/lib/frameStore";

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
