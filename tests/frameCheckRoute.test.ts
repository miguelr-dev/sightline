import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/frameCheck", () => ({
  checkFrame: vi.fn(async () => ({ result: { ready: false, detected: false, hint: "" }, ok: true })),
}));

import { POST } from "@/app/api/frame-check/route";
import { checkFrame } from "@/lib/frameCheck";

describe("POST /api/frame-check", () => {
  it("passes lastKey and lastLabel on to the frame check", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    await POST(
      new Request("http://localhost:3000/api/frame-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          image: "/9j/" + "A".repeat(200),
          mode: "menu",
          lastKey: "kirkland-tropical-energy-drink",
          lastLabel: "Kirkland energy drink",
        }),
      }),
    );
    expect(checkFrame).toHaveBeenCalledWith(expect.any(String), "menu", undefined, {
      lastKey: "kirkland-tropical-energy-drink",
      lastLabel: "Kirkland energy drink",
    });
  });
});
