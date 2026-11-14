import { describe, expect, it } from "vitest";
import { ClipCache } from "./clipCache";
import { withTimeout } from "./timeout";
import { parseHistoryScan } from "./parse";
import { hatStatusFor } from "./hatStatus";
import { lookupLanguage } from "./lookupRequest";

describe("ClipCache: speech clip files are capped and deleted", () => {
  it("evicts the oldest clip and deletes its file when over the cap", () => {
    const deleted: string[] = [];
    const c = new ClipCache(2, (uri) => deleted.push(uri));
    c.set("a", "file:///a.mp3");
    c.set("b", "file:///b.mp3");
    c.set("c", "file:///c.mp3");
    expect(c.get("a")).toBeUndefined();
    expect(deleted).toEqual(["file:///a.mp3"]);
    expect(c.size).toBe(2);
  });

  it("a cache hit counts as recent use", () => {
    const deleted: string[] = [];
    const c = new ClipCache(2, (uri) => deleted.push(uri));
    c.set("a", "A");
    c.set("b", "B");
    c.get("a");
    c.set("c", "C");
    expect(deleted).toEqual(["B"]);
  });

  it("clear() deletes every file", () => {
    const deleted: string[] = [];
    const c = new ClipCache(5, (uri) => deleted.push(uri));
    c.set("a", "A");
    c.set("b", "B");
    c.clear();
    expect(deleted.sort()).toEqual(["A", "B"]);
    expect(c.size).toBe(0);
  });

  it("replacing a key deletes the old file", () => {
    const deleted: string[] = [];
    const c = new ClipCache(5, (uri) => deleted.push(uri));
    c.set("a", "A1");
    c.set("a", "A2");
    expect(deleted).toEqual(["A1"]);
    expect(c.get("a")).toBe("A2");
  });
});

describe("withTimeout", () => {
  it("resolves with the value when it arrives in time", async () => {
    await expect(withTimeout(Promise.resolve(5), 50, -1)).resolves.toBe(5);
  });
  it("resolves with the fallback after the timeout", async () => {
    await expect(withTimeout(new Promise<number>(() => {}), 10, -1)).resolves.toBe(-1);
  });
});

describe("parseHistoryScan: server contract", () => {
  const base = { id: "s1", createdAt: "2026-11-15T01:00:00Z", mode: "menu", itemKind: "food_drink", title: "Nutter Butter", spokenText: "Cookies.", sections: [], lookup: null };
  it("reads imageUrl (the server's field name)", () => {
    expect(parseHistoryScan({ ...base, imageUrl: "https://x.test/a.jpg" })?.image).toBe("https://x.test/a.jpg");
  });
  it("still accepts the old `image` and falls back to the lookup's image", () => {
    expect(parseHistoryScan({ ...base, image: "https://x.test/b.jpg" })?.image).toBe("https://x.test/b.jpg");
    expect(parseHistoryScan({ ...base, lookup: { spokenText: "From the web", image: "https://x.test/c.jpg" } })?.image).toBe("https://x.test/c.jpg");
  });
  it("rejects non-https images and rows without text", () => {
    expect(parseHistoryScan({ ...base, imageUrl: "http://x.test/a.jpg" })?.image).toBeUndefined();
    expect(parseHistoryScan({ id: "x" })).toBeNull();
  });
});

describe("hatStatusFor: /api/device/next responses", () => {
  it("maps 409 paired-elsewhere to its own status", () => {
    expect(hatStatusFor(409, { reason: "paired-elsewhere" })).toBe("elsewhere");
  });
  it("keeps the other codes", () => {
    expect(hatStatusFor(200, {})).toBe("live");
    expect(hatStatusFor(403, {})).toBe("unauthorized");
    expect(hatStatusFor(400, {})).toBe("invalid");
    expect(hatStatusFor(404, {})).toBe("missing");
    expect(hatStatusFor(503, {})).toBe("missing");
    expect(hatStatusFor(0, null)).toBe("offline");
  });
});

describe("lookupLanguage: /api/lookup in Translate mode", () => {
  it("sends the target language only in Translate mode", () => {
    expect(lookupLanguage("translate", "French")).toBe("French");
    expect(lookupLanguage("menu", "French")).toBeUndefined();
    expect(lookupLanguage("translate", "English")).toBeUndefined();
  });
});
