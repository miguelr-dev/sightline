import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analyze", () => ({ analyzePhoto: vi.fn() }));

import { POST } from "@/app/api/analyze/route";
import { analyzePhoto } from "@/lib/analyze";

const IMAGE = "/9j/" + "A".repeat(200);

function analyze(body: Record<string, unknown>) {
  return POST(
    new Request("http://localhost:3000/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: IMAGE, mode: "describe", language: "English", ...body }),
    }),
  );
}

describe("POST /api/analyze with an utterance (ask while looking)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(analyzePhoto).mockResolvedValue({
      body: { spokenText: "Caution: sidewalk work ahead.", details: "", itemKind: "none" },
      status: 200,
    });
  });

  it('"what does this sign say" switches to Read mode and echoes what it understood', async () => {
    const body = await (await analyze({ utterance: "what does this sign say" })).json();
    expect(analyzePhoto).toHaveBeenCalledWith(expect.objectContaining({ mode: "read" }));
    expect(body).toMatchObject({
      spokenText: "Caution: sidewalk work ahead.",
      utterance: "what does this sign say",
      interpreted: { mode: "read" },
    });
    expect(body.autoLookup).toBeUndefined();
  });

  it('"translate this to French" sets Translate mode and the language', async () => {
    const body = await (await analyze({ utterance: "translate this to French" })).json();
    expect(analyzePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "translate", language: "French" }),
    );
    expect(body.interpreted).toEqual({ mode: "translate", language: "French" });
  });

  it("a plain question is asked about this new photo, not as a follow-up", async () => {
    const body = await (await analyze({ mode: "menu", utterance: "how much is the salmon" })).json();
    expect(analyzePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "menu", question: "how much is the salmon", isFollowUp: false }),
    );
    expect(body.interpreted).toEqual({ mode: "menu", question: "how much is the salmon" });
  });

  it('"search for this" analyzes, then tells the app to run the web lookup', async () => {
    const body = await (await analyze({ mode: "menu", utterance: "search for this" })).json();
    expect(analyzePhoto).toHaveBeenCalledWith(expect.objectContaining({ mode: "menu" }));
    expect(body).toMatchObject({ autoLookup: true, interpreted: { mode: "menu" } });
  });

  it("an empty utterance is ignored", async () => {
    const body = await (await analyze({ mode: "menu", utterance: "  " })).json();
    expect(analyzePhoto).toHaveBeenCalledWith(expect.objectContaining({ mode: "menu" }));
    expect(body.utterance).toBeUndefined();
    expect(body.interpreted).toBeUndefined();
  });

  it("an over-length utterance is truncated to 300 characters", async () => {
    const long = "is this " + "very ".repeat(100) + "spicy";
    const body = await (await analyze({ utterance: long })).json();
    expect(body.utterance).toHaveLength(300);
  });

  it("a follow-up question (no utterance) keeps working as before", async () => {
    await analyze({ question: "How much is the salmon?" });
    expect(analyzePhoto).toHaveBeenCalledWith(
      expect.objectContaining({ question: "How much is the salmon?" }),
    );
    expect(vi.mocked(analyzePhoto).mock.calls[0][0].isFollowUp).not.toBe(false);
  });
});
