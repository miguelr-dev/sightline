import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { ZXING_WASM_VERSION } from "barcode-detector/ponyfill";
import { initialScanState, normalizeBarcode, onAnswerClosed, onSighting, upcEToA } from "@/lib/barcodeScan";

describe("normalizeBarcode", () => {
  it("accepts valid retail codes", () => {
    expect(normalizeBarcode("upc_a", "049000028911")).toBe("049000028911");
    expect(normalizeBarcode("ean_13", "3017620422003")).toBe("3017620422003");
    expect(normalizeBarcode("ean_8", "96385074")).toBe("96385074");
  });

  it("rejects misreads, wrong lengths and other formats", () => {
    expect(normalizeBarcode("upc_a", "049000028912")).toBeNull(); // bad check digit
    expect(normalizeBarcode("ean_13", "04900002891")).toBeNull();
    expect(normalizeBarcode("upc_a", "04900002891A")).toBeNull();
    expect(normalizeBarcode("qr_code", "049000028911")).toBeNull();
  });

  it("expands UPC-E to UPC-A", () => {
    expect(upcEToA("04252614")).toBe("042100005264");
    expect(normalizeBarcode("upc_e", "04252614")).toBe("042100005264");
    expect(normalizeBarcode("upc_e", "04252615")).toBeNull();
  });
});

describe("onSighting", () => {
  it("confirms on the second sighting, then holds the code", () => {
    let r = onSighting(initialScanState, "049000028911", 0);
    expect(r.confirmed).toBe(false);
    r = onSighting(r.state, "049000028911", 300);
    expect(r.confirmed).toBe(true);
    r = onSighting(r.state, "049000028911", 600);
    r = onSighting(r.state, "049000028911", 900);
    expect(r.confirmed).toBe(false); // just read
  });

  it("needs the two sightings close together, of the same code", () => {
    let r = onSighting(initialScanState, "049000028911", 0);
    r = onSighting(r.state, "049000028911", 5000);
    expect(r.confirmed).toBe(false);
    r = onSighting(r.state, "3017620422003", 5200);
    expect(r.confirmed).toBe(false);
  });

  it("allows the same code again shortly after its answer is closed", () => {
    let r = onSighting(initialScanState, "049000028911", 0);
    r = onSighting(r.state, "049000028911", 100);
    const closed = onAnswerClosed(r.state, 2000);
    r = onSighting(closed, "049000028911", 4000);
    expect(r.confirmed).toBe(false);
    r = onSighting(r.state, "049000028911", 5100);
    r = onSighting(r.state, "049000028911", 5300);
    expect(r.confirmed).toBe(true);
  });
});

it("serves the ZXing .wasm for the installed version", () => {
  // lib/barcodeScan.ts loads /zxing/zxing_reader-<version>.wasm. After upgrading barcode-detector,
  // copy node_modules/zxing-wasm/dist/reader/zxing_reader.wasm to that name.
  expect(existsSync(new URL(`../public/zxing/zxing_reader-${ZXING_WASM_VERSION}.wasm`, import.meta.url))).toBe(true);
});
