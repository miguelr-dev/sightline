import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

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
    getCachedBarcode: vi.fn(async () => undefined),
    putCachedBarcode: vi.fn(async () => {}),
    insertScan: vi.fn(async () => {}),
  };
});
vi.mock("@/lib/brightdata", () => ({
  brightDataConfigured: () => true,
  searchWeb: vi.fn(async () => ({ results: [] })),
  searchImage: vi.fn(async () => undefined),
}));
vi.mock("@/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/claude")>();
  return { ...actual, askJson: vi.fn() };
});

import { GET } from "@/app/api/barcode/route";
import { barcodeCacheKey } from "@/lib/barcode";
import * as db from "@/lib/db";
import { searchWeb } from "@/lib/brightdata";
import { askJson } from "@/lib/claude";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), "utf8");

// The network, by URL: Open Food Facts knows the soda; openFDA knows the Tylenol UPC.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- init is read from mock.calls
const routeByUrl = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const json = (body: string, status = 200) =>
    new Response(body, { status, headers: { "content-type": "application/json" } });
  if (url.includes("openfoodfacts.org")) {
    if (url.includes("049000028911")) return json(fixture("off-soda"));
    if (url.includes("305730150309")) return json(fixture("off-advil"));
    if (url.includes("0123456789012")) {
      // An OTC medicine without a drug-UPC prefix (e.g. a store listing).
      return json(JSON.stringify({ status: 1, product: { product_name: "Tylenol Extra Strength caplets", brands: "Tylenol" } }));
    }
    return json(fixture("off-missing"));
  }
  if (url.includes("api.fda.gov/drug/label")) {
    const u = decodeURIComponent(url);
    if (u.includes("300450406026") || u.includes('brand_name.exact:"Tylenol"')) return json(fixture("fda-label-tylenol"));
    if (u.includes('brand_name.exact:"Advil"')) return json(fixture("fda-label-advil"));
    return json('{"error":{"code":"NOT_FOUND"}}', 404);
  }
  if (url.includes("api.fda.gov/drug/enforcement")) {
    return decodeURIComponent(url).includes("Advil")
      ? json(fixture("fda-enforcement-advil"))
      : json(fixture("fda-enforcement-tylenol"));
  }
  return json('{"error":{"code":"NOT_FOUND"}}', 404);
};
const fetchMock = vi.fn(routeByUrl);

function barcode(code: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost:3000/api/barcode?code=${code}`, { headers }));
}

async function drain() {
  while (bg.pending.length) await Promise.all(bg.pending.splice(0));
}

describe("GET /api/barcode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bg.pending.length = 0;
    fetchMock.mockImplementation(routeByUrl);
    vi.stubGlobal("fetch", fetchMock);
    // clearAllMocks keeps per-test return values; reset the ones tests override.
    vi.mocked(searchWeb).mockResolvedValue({ results: [] });
    vi.mocked(askJson).mockReset();
    vi.mocked(db.getCachedBarcode).mockResolvedValue(undefined);
    process.env.BRIGHTDATA_API_KEY = "test";
    process.env.BRIGHTDATA_SERP_ZONE = "test";
    process.env.ANTHROPIC_API_KEY = "test";
  });

  it("400 for a bad code, without touching the network", async () => {
    const res = await barcode("049000028912");
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Open Food Facts first, with a generic User-Agent", async () => {
    const body = await (await barcode("049000028911")).json();
    expect(body).toMatchObject({
      code: "049000028911",
      found: true,
      source: "openfoodfacts",
      itemKind: "food_drink",
      title: "Diet Coke Soft Drink",
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("world.openfoodfacts.org/api/v2/product/049000028911.json");
    expect(new Headers(init.headers).get("user-agent")).toMatch(/^SightLine\//);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("api.fda.gov"))).toBe(false);
  });

  it("drug UPC that Open Food Facts misses: openFDA, with the recall first", async () => {
    const body = await (await barcode("300450406026")).json();
    expect(body).toMatchObject({ found: true, source: "openfda", itemKind: "medicine" });
    expect(body.sections[0].title).toBe("Recalls");
    expect(searchWeb).not.toHaveBeenCalled();
  });

  it("other codes Open Food Facts misses: a web search, summarized by Claude", async () => {
    vi.mocked(searchWeb).mockResolvedValue({
      results: [{ title: "Acme Widget 012345678905", url: "https://example.com/w", snippet: "UPC 012345678905" }],
    });
    vi.mocked(askJson).mockResolvedValue({
      found: true,
      title: "Acme Widget",
      itemKind: "product",
      spokenText: "Acme Widget, a 3-pack of kitchen sponges.",
      sections: [{ title: "About", body: "Kitchen sponges, 3 per pack." }],
    });
    const body = await (await barcode("012345678905")).json();
    expect(vi.mocked(searchWeb).mock.calls[0][0]).toBe('"012345678905" UPC product');
    expect(body).toMatchObject({ found: true, source: "web", itemKind: "product", title: "Acme Widget" });
  });

  it("nothing anywhere: found false with a helpful spoken note", async () => {
    const body = await (await barcode("012345678905")).json();
    expect(body).toMatchObject({
      code: "012345678905",
      found: false,
      spokenText: "I couldn't find that barcode. Try the Menu / Label mode on the package.",
    });
  });

  it("a drug UPC found in Open Food Facts still gets openFDA (Advil)", async () => {
    const body = await (await barcode("305730150309")).json();
    expect(body).toMatchObject({ found: true, source: "openfda", itemKind: "medicine", title: "Advil" });
    expect(body.spokenText.toLowerCase()).toContain("ibuprofen");
    expect(body.spokenText).toContain("No recalls found.");
  });

  it("an OTC medicine without the drug prefix is checked against openFDA by brand, recall first", async () => {
    const body = await (await barcode("0123456789012")).json();
    expect(body).toMatchObject({ found: true, source: "openfda", itemKind: "medicine" });
    expect(body.sections[0].title).toBe("Recalls");
  });

  it("falls through to the web when Open Food Facts can't be reached", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      if (String(input).includes("openfoodfacts.org")) throw new Error("timeout");
      return new Response('{"error":{"code":"NOT_FOUND"}}', { status: 404 });
    });
    vi.mocked(searchWeb).mockResolvedValue({
      results: [{ title: "Acme Widget", url: "https://example.com/w", snippet: "UPC 012345678905" }],
    });
    vi.mocked(askJson).mockResolvedValue({
      found: true,
      title: "Acme Widget",
      itemKind: "product",
      spokenText: "Acme Widget.",
      sections: [],
    });
    const body = await (await barcode("012345678905")).json();
    expect(body.source).toBe("web");
  });

  it("caches results by code (found and not found)", async () => {
    await barcode("049000028911");
    await drain();
    expect(db.putCachedBarcode).toHaveBeenCalledWith(
      barcodeCacheKey("049000028911", "English"),
      expect.objectContaining({ found: true, source: "openfoodfacts" }),
    );
    await barcode("012345678905");
    await drain();
    expect(db.putCachedBarcode).toHaveBeenCalledWith(
      barcodeCacheKey("012345678905", "English"),
      expect.objectContaining({ found: false }),
    );
  });

  it("answers from the cache without any network call", async () => {
    vi.mocked(db.getCachedBarcode).mockResolvedValue({
      found: true,
      source: "openfoodfacts",
      spokenText: "Diet Coke Soft Drink by Coca-Cola.",
      sections: [],
      itemKind: "food_drink",
    });
    const body = await (await barcode("049000028911")).json();
    expect(body).toMatchObject({ found: true, cached: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("records a history scan when the phone sends its device header", async () => {
    const body = await (
      await barcode("049000028911", { "x-sightline-device": "phone-1234-abcd" })
    ).json();
    await drain();
    expect(body.scanId).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.insertScan).toHaveBeenCalledWith(
      expect.objectContaining({
        id: body.scanId,
        device: "phone-1234-abcd",
        itemKind: "food_drink",
        key: "barcode-049000028911",
      }),
    );
  });

  it("no history without the header", async () => {
    const body = await (await barcode("049000028911")).json();
    await drain();
    expect(body.scanId).toBeUndefined();
    expect(db.insertScan).not.toHaveBeenCalled();
  });
});
