import { describe, expect, it, vi } from "vitest";

vi.mock("next/server", () => ({ connection: async () => {} }));

import { GET } from "@/app/api/features/route";

describe("GET /api/features", () => {
  it("advertises hat voice commands", async () => {
    const body = await (await GET()).json();
    expect(body.hatCommands).toBe(true);
  });

  it("advertises barcode lookup", async () => {
    const body = await (await GET()).json();
    expect(body.barcode).toBe(true);
  });
});
