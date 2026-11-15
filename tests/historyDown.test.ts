import { beforeEach, describe, expect, it, vi } from "vitest";

// D13: when Neon is configured but down, history says so (503) instead of looking empty, and
// /api/features reports history:false.

vi.mock("next/server", () => ({ connection: async () => {} }));
vi.mock("@/lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db")>();
  return {
    ...actual,
    dbConfigured: vi.fn(() => true),
    dbAvailable: vi.fn(() => true),
    listScans: vi.fn(),
    clearScans: vi.fn(),
  };
});

import { DELETE, GET } from "@/app/api/history/route";
import { GET as features } from "@/app/api/features/route";
import * as db from "@/lib/db";

const req = (method: string) =>
  new Request("http://localhost/api/history?limit=5", { method, headers: { "x-sightline-device": "fix-1234567890ab" } });

describe("history when the database is down", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.dbConfigured).mockReturnValue(true);
    vi.mocked(db.dbAvailable).mockReturnValue(true);
  });

  it("GET answers 503 unavailable, not an empty list", async () => {
    vi.mocked(db.listScans).mockResolvedValue(undefined);
    const res = await GET(req("GET"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "unavailable" });
  });

  it("DELETE answers 503 instead of saying it cleared", async () => {
    vi.mocked(db.clearScans).mockResolvedValue(undefined);
    const res = await DELETE(req("DELETE"));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ deleted: 0, error: "unavailable" });
  });

  it("a working database still answers 200", async () => {
    vi.mocked(db.listScans).mockResolvedValue([]);
    vi.mocked(db.clearScans).mockResolvedValue(3);
    expect((await GET(req("GET"))).status).toBe(200);
    expect(await (await DELETE(req("DELETE"))).json()).toEqual({ deleted: 3 });
  });

  it("no database configured: still an empty 200, as before", async () => {
    vi.mocked(db.dbConfigured).mockReturnValue(false);
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scans: [] });
  });

  it("/api/features reports history:false while the database is failing", async () => {
    vi.mocked(db.dbAvailable).mockReturnValue(false);
    expect((await (await features()).json()).history).toBe(false);
    vi.mocked(db.dbAvailable).mockReturnValue(true);
    expect((await (await features()).json()).history).toBe(true);
  });
});
