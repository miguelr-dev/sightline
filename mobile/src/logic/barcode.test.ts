import { describe, expect, it } from "vitest";
import { initialBarcodeState, normalizeBarcode, reduceBarcode, pickCard, frameCheckAllowed, barcodeWebQuery } from "./barcode";
import { initialReadAll, reduceReadAll } from "./readAll";

describe("normalizeBarcode", () => {
  it("accepts valid EAN-13, EAN-8, UPC-A and UPC-E codes", () => {
    expect(normalizeBarcode("ean13", "5449000000996")).toBe("5449000000996"); // Coca-Cola
    expect(normalizeBarcode("upc_a", "049000028911")).toBe("049000028911");
    expect(normalizeBarcode("ean8", "96385074")).toBe("96385074");
    expect(normalizeBarcode("upc_e", "01234565")).toBe("01234565");
  });
  it("rejects bad check digits, wrong lengths and other symbologies (a partial or misread code)", () => {
    expect(normalizeBarcode("ean13", "5449000000997")).toBeNull();
    expect(normalizeBarcode("ean13", "54490000")).toBeNull();
    expect(normalizeBarcode("qr", "5449000000996")).toBeNull();
    expect(normalizeBarcode("ean13", "54490000009a6")).toBeNull();
  });
  it("accepts iOS's org.gs1 type names", () => {
    expect(normalizeBarcode("org.gs1.EAN-13", "5449000000996")).toBe("5449000000996");
  });
  it("accepts US UPC-A codes that iOS reports as ean13 with the leading zero stripped (12 digits)", () => {
    // expo-camera iOS: UPC-A comes back as type ean13 and the 13-digit value minus its leading 0.
    expect(normalizeBarcode("ean13", "049000028911")).toBe("049000028911"); // Diet Coke
    expect(normalizeBarcode("org.gs1.EAN-13", "044000032029")).toBe("044000032029"); // Oreo
    expect(normalizeBarcode("ean13", "049000028912")).toBeNull(); // still checks the check digit
  });
});

const COKE = "5449000000996";
const OTHER = "049000028911";

describe("reduceBarcode: confirm, dedupe, rescan", () => {
  it("needs the same code twice within 500 ms before looking it up", () => {
    let r = reduceBarcode(initialBarcodeState, { type: "seen", code: COKE, at: 0 });
    expect(r.effects).toEqual([{ type: "aimTick" }]); // first detection: a light tick
    r = reduceBarcode(r.state, { type: "seen", code: COKE, at: 300 });
    expect(r.effects).toEqual([{ type: "confirmed", code: COKE }]);
  });

  it("does not confirm when the second sighting is too late or a different code", () => {
    let r = reduceBarcode(initialBarcodeState, { type: "seen", code: COKE, at: 0 });
    r = reduceBarcode(r.state, { type: "seen", code: COKE, at: 900 });
    expect(r.effects.some((e) => e.type === "confirmed")).toBe(false);
    r = reduceBarcode(r.state, { type: "seen", code: OTHER, at: 1000 });
    expect(r.effects.some((e) => e.type === "confirmed")).toBe(false);
  });

  it("only confirms a code once while it stays in view", () => {
    let s = initialBarcodeState;
    const confirmed: string[] = [];
    for (const at of [0, 200, 400, 600, 800]) {
      const r = reduceBarcode(s, { type: "seen", code: COKE, at });
      s = r.state;
      for (const e of r.effects) if (e.type === "confirmed") confirmed.push(e.code);
    }
    expect(confirmed).toEqual([COKE]);
  });

  it("an unreadable (partial) code gives an aiming tick, at most once a second", () => {
    let r = reduceBarcode(initialBarcodeState, { type: "partial", at: 0 });
    expect(r.effects).toEqual([{ type: "aimTick" }]);
    r = reduceBarcode(r.state, { type: "partial", at: 400 });
    expect(r.effects).toEqual([]);
    r = reduceBarcode(r.state, { type: "partial", at: 1100 });
    expect(r.effects).toEqual([{ type: "aimTick" }]);
  });

  it("after reading, the same code is ignored for about 10 s", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "read", code: COKE, at: 1000 }).state;
    s = reduceBarcode(s, { type: "seen", code: COKE, at: 2000 }).state;
    const r = reduceBarcode(s, { type: "seen", code: COKE, at: 2200 });
    expect(r.effects.some((e) => e.type === "confirmed")).toBe(false);
    let t = reduceBarcode(s, { type: "seen", code: COKE, at: 11_100 }).state;
    expect(reduceBarcode(t, { type: "seen", code: COKE, at: 11_300 }).effects).toContainEqual({ type: "confirmed", code: COKE });
  });

  it("closing the result sheet allows an immediate rescan of the same code", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "read", code: COKE, at: 1000 }).state;
    s = reduceBarcode(s, { type: "sheetClosed" }).state;
    s = reduceBarcode(s, { type: "seen", code: COKE, at: 1500 }).state;
    expect(reduceBarcode(s, { type: "seen", code: COKE, at: 1700 }).effects).toContainEqual({ type: "confirmed", code: COKE });
  });

  it("clears the card when the barcode has been out of view for 1.5 s", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "seen", code: COKE, at: 0 }).state;
    s = reduceBarcode(s, { type: "seen", code: COKE, at: 200 }).state;
    expect(reduceBarcode(s, { type: "tick", at: 1000 }).effects).toEqual([]);
    expect(reduceBarcode(s, { type: "tick", at: 1800 }).effects).toEqual([{ type: "gone" }]);
  });
});

describe("card priority", () => {
  const barcode = { kind: "barcode" as const, key: COKE, label: "Coca-Cola Classic" };
  const frame = { kind: "frame" as const, key: "menu", label: "Menu" };
  it("a barcode card wins over the frame-check card", () => {
    expect(pickCard(barcode, frame)).toBe(barcode);
    expect(pickCard(null, frame)).toBe(frame);
    expect(pickCard(null, null)).toBeNull();
  });
  it("frame-check pauses while a barcode card is up or a code is being confirmed", () => {
    expect(frameCheckAllowed({ barcodeCard: true, confirming: false })).toBe(false);
    expect(frameCheckAllowed({ barcodeCard: false, confirming: true })).toBe(false);
    expect(frameCheckAllowed({ barcodeCard: false, confirming: false })).toBe(true);
  });
});

describe("reduceReadAll: Read all sections in order", () => {
  const sections = [
    { title: "Nutrition", body: "140 calories." },
    { title: "Empty", body: "   " },
    { title: "Ingredients", body: "Carbonated water, sugar." },
  ];
  it("queues every non-empty section in order, title then body, after stopping speech", () => {
    const r = reduceReadAll(initialReadAll, { type: "start", prefix: "r-1", sections });
    expect(r.state.status).toBe("reading");
    expect(r.effects).toEqual([
      { type: "stopSpeech" },
      {
        type: "enqueue",
        items: [
          { owner: "r-1-0", text: "Nutrition. 140 calories." },
          { owner: "r-1-2", text: "Ingredients. Carbonated water, sugar." },
        ],
      },
    ]);
  });
  it("tracks which section is being read and finishes after the last", () => {
    let s = reduceReadAll(initialReadAll, { type: "start", prefix: "r-1", sections }).state;
    s = reduceReadAll(s, { type: "speaking", owner: "r-1-0" }).state;
    expect(s.current).toBe("r-1-0");
    s = reduceReadAll(s, { type: "speaking", owner: "r-1-2" }).state;
    expect(s.current).toBe("r-1-2");
    s = reduceReadAll(s, { type: "speaking", owner: null }).state;
    expect(s.status).toBe("idle");
  });
  it("ignores the old speech stopping before the first section starts", () => {
    let s = reduceReadAll(initialReadAll, { type: "start", prefix: "r-1", sections }).state;
    s = reduceReadAll(s, { type: "speaking", owner: null }).state;
    expect(s.status).toBe("reading");
  });
  it("speech from something else ends Read all", () => {
    let s = reduceReadAll(initialReadAll, { type: "start", prefix: "r-1", sections }).state;
    s = reduceReadAll(s, { type: "speaking", owner: "r-1-0" }).state;
    expect(reduceReadAll(s, { type: "speaking", owner: "other" }).state.status).toBe("idle");
  });
  it("Stop and dismiss stop speech and reset", () => {
    const s = reduceReadAll(initialReadAll, { type: "start", prefix: "r-1", sections }).state;
    for (const type of ["stop", "dismiss"] as const) {
      const r = reduceReadAll(s, { type });
      expect(r.state.status).toBe("idle");
      expect(r.effects).toEqual([{ type: "stopSpeech" }]);
    }
  });
  it("can read several groups (answer, then web) in one go", () => {
    const r = reduceReadAll(initialReadAll, {
      type: "start",
      prefix: "r-1",
      sections: [{ title: "A", body: "a" }],
      more: [{ prefix: "w-1", sections: [{ title: "B", body: "b" }] }],
    });
    expect(r.effects[1]).toEqual({ type: "enqueue", items: [{ owner: "r-1-0", text: "A. a" }, { owner: "w-1-0", text: "B. b" }] });
  });
  it("does nothing when every section is empty", () => {
    const r = reduceReadAll(initialReadAll, { type: "start", prefix: "x", sections: [{ title: "A", body: "" }] });
    expect(r.state.status).toBe("idle");
    expect(r.effects).toEqual([]);
  });
});

describe("BARCODE mode rescan after closing the sheet", () => {
  it("holds the same code briefly so the sheet doesn't reopen on the product still in view", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "read", code: COKE, at: 1000 }).state;
    s = reduceBarcode(s, { type: "sheetClosed", at: 5000, holdMs: 3000 }).state;
    s = reduceBarcode(s, { type: "seen", code: COKE, at: 5200 }).state;
    expect(reduceBarcode(s, { type: "seen", code: COKE, at: 5400 }).effects).not.toContainEqual({ type: "confirmed", code: COKE });
    s = reduceBarcode(s, { type: "seen", code: COKE, at: 8100 }).state;
    expect(reduceBarcode(s, { type: "seen", code: COKE, at: 8300 }).effects).toContainEqual({ type: "confirmed", code: COKE });
  });
  it("a different product is read straight away", () => {
    let s = reduceBarcode(initialBarcodeState, { type: "read", code: COKE, at: 1000 }).state;
    s = reduceBarcode(s, { type: "sheetClosed", at: 5000, holdMs: 3000 }).state;
    s = reduceBarcode(s, { type: "seen", code: OTHER, at: 5200 }).state;
    expect(reduceBarcode(s, { type: "seen", code: OTHER, at: 5400 }).effects).toContainEqual({ type: "confirmed", code: OTHER });
  });
});

describe("barcodeWebQuery: barcode results look themselves up on the web automatically", () => {
  it("uses the product name, adding the brand when the name doesn't already include it", () => {
    expect(barcodeWebQuery({ found: true, title: "Energy Drink - Tropical", brand: "Kirkland" })).toBe("Kirkland Energy Drink - Tropical");
    expect(barcodeWebQuery({ found: true, title: "Nutter Butter Bites", brand: "Nutter Butter" })).toBe("Nutter Butter Bites");
    expect(barcodeWebQuery({ found: true, title: "Almdudler Original 0,35l" })).toBe("Almdudler Original 0,35l");
  });
  it("skips the lookup when the barcode wasn't found or has no name", () => {
    expect(barcodeWebQuery({ found: false, title: "Something" })).toBe("");
    expect(barcodeWebQuery({ found: true })).toBe("");
    expect(barcodeWebQuery({ found: true, title: "   " })).toBe("");
  });
});
