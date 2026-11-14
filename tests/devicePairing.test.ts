import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    dbConfigured: () => true,
    claimPairing: vi.fn(),
    unpairHat: vi.fn(),
    pairHat: vi.fn(),
    deviceEventsAfter: vi.fn(async () => []),
  };
});

import { GET as next } from "@/app/api/device/next/route";
import { POST as unpair } from "@/app/api/device/unpair/route";
import * as db from "@/lib/db";
import { pairCode } from "@/lib/hat";

const KEY = "test-shared-key-for-unit-tests";
const HAT = "hat-01";
const PHONE = "phone-1234-abcd";
const OTHER = "phone-9999-zzzz";

function poll(phone: string, pair = pairCode(HAT, KEY)) {
  return next(
    new Request(`http://localhost:3000/api/device/next?device=${HAT}&pair=${pair}`, {
      headers: { "x-sightline-device": phone },
    }),
  );
}

function unpairRequest(body: Record<string, unknown>, phone: string | null = PHONE) {
  return unpair(
    new Request("http://localhost:3000/api/device/unpair", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(phone ? { "x-sightline-device": phone } : {}),
      },
      body: JSON.stringify(body),
    }),
  );
}

describe("hat pairing is sticky", () => {
  beforeEach(() => {
    process.env.DEVICE_SHARED_KEY = KEY;
    vi.clearAllMocks();
  });

  it("the paired phone (or the first one) gets its events", async () => {
    vi.mocked(db.claimPairing).mockResolvedValue("ok");
    const res = await poll(PHONE);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ events: [], paired: true });
    expect(db.claimPairing).toHaveBeenCalledWith(HAT, PHONE);
  });

  it("another phone with the pair code gets 409 paired-elsewhere and doesn't take over", async () => {
    vi.mocked(db.claimPairing).mockResolvedValue("elsewhere");
    const res = await poll(OTHER);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ reason: "paired-elsewhere" });
    expect(db.pairHat).not.toHaveBeenCalled();
    expect(db.deviceEventsAfter).not.toHaveBeenCalled();
  });

  it("a wrong pair code still gets 403 before any pairing", async () => {
    const res = await poll(PHONE, "wrongcod");
    expect(res.status).toBe(403);
    expect(db.claimPairing).not.toHaveBeenCalled();
  });

  it("503 when the database can't be reached to check the pairing", async () => {
    vi.mocked(db.claimPairing).mockResolvedValue(undefined);
    const res = await poll(PHONE);
    expect(res.status).toBe(503);
  });
});

describe("POST /api/device/unpair", () => {
  beforeEach(() => {
    process.env.DEVICE_SHARED_KEY = KEY;
    vi.clearAllMocks();
  });

  it("400 for a missing or invalid hat id", async () => {
    expect((await unpairRequest({ pair: "x" })).status).toBe(400);
  });

  it("401 without the phone's x-sightline-device header", async () => {
    const res = await unpairRequest({ device: HAT, pair: pairCode(HAT, KEY) }, null);
    expect(res.status).toBe(401);
  });

  it("403 for a wrong pair code", async () => {
    expect((await unpairRequest({ device: HAT, pair: "wrongcod" })).status).toBe(403);
  });

  it("unpairs the calling phone only", async () => {
    vi.mocked(db.unpairHat).mockResolvedValue(true);
    const res = await unpairRequest({ device: HAT, pair: pairCode(HAT, KEY) });
    expect(await res.json()).toEqual({ unpaired: true });
    expect(db.unpairHat).toHaveBeenCalledWith(HAT, PHONE);
  });

  it("says so when this phone wasn't the paired one", async () => {
    vi.mocked(db.unpairHat).mockResolvedValue(false);
    const res = await unpairRequest({ device: HAT, pair: pairCode(HAT, KEY) });
    expect(await res.json()).toEqual({ unpaired: false });
  });
});
