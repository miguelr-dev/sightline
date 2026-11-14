// Barcode scanning for groceries (tested in barcode.test.ts). The camera reports codes on-device;
// these pure rules decide when a code is real, when to look it up, and which card wins.

const TYPES: Record<string, "ean13" | "ean8" | "upc_a" | "upc_e"> = {
  ean13: "ean13",
  "org.gs1.EAN-13": "ean13",
  ean8: "ean8",
  "org.gs1.EAN-8": "ean8",
  upc_a: "upc_a",
  upc_e: "upc_e",
  "org.gs1.UPC-E": "upc_e",
};
const LENGTH = { ean13: 13, ean8: 8, upc_a: 12, upc_e: 8 } as const;

function gtinValid(d: string): boolean {
  let sum = 0;
  const payload = d.slice(0, -1);
  for (let i = 0; i < payload.length; i++) sum += Number(payload[payload.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
}

function upcEToA(e: string): string {
  const ns = e[0];
  const m = e.slice(1, 7);
  const last = m[5];
  let a: string;
  if (last <= "2") a = ns + m.slice(0, 2) + last + "0000" + m.slice(2, 5);
  else if (last === "3") a = ns + m.slice(0, 3) + "00000" + m.slice(3, 5);
  else if (last === "4") a = ns + m.slice(0, 4) + "00000" + m[4];
  else a = ns + m.slice(0, 5) + "0000" + last;
  return a + e[7];
}

/** The code's digits if it's a valid retail barcode, else null (a misread or partial code). */
export function normalizeBarcode(type: string, data: string): string | null {
  const kind = TYPES[type];
  if (!kind || !/^\d+$/.test(data) || data.length !== LENGTH[kind]) return null;
  return gtinValid(kind === "upc_e" ? upcEToA(data) : data) ? data : null;
}

export type BarcodeState = {
  pending: { code: string; at: number } | null; // seen once, waiting for a second sighting
  confirmed: string | null; // looked up / on the card
  lastSeenAt: number;
  lastTickAt: number;
  read: { code: string; until: number } | null; // just read: ignored for a while
};

export const initialBarcodeState: BarcodeState = {
  pending: null,
  confirmed: null,
  lastSeenAt: 0,
  lastTickAt: -Infinity,
  read: null,
};

export type BarcodeEvent =
  | { type: "seen"; code: string; at: number }
  | { type: "partial"; at: number } // a barcode is in view but didn't decode to a valid code
  | { type: "read"; code: string; at: number }
  | { type: "sheetClosed"; at?: number; holdMs?: number } // holdMs: keep ignoring the last code briefly
  | { type: "tick"; at: number };

export type BarcodeEffect = { type: "aimTick" } | { type: "confirmed"; code: string } | { type: "gone" };

const CONFIRM_MS = 500;
const TICK_GAP_MS = 1000;
const READ_DEDUPE_MS = 10_000;
const GONE_MS = 1500;

export function reduceBarcode(s: BarcodeState, e: BarcodeEvent): { state: BarcodeState; effects: BarcodeEffect[] } {
  const tick = (at: number, state: BarcodeState) =>
    at - state.lastTickAt >= TICK_GAP_MS
      ? { state: { ...state, lastTickAt: at }, effects: [{ type: "aimTick" } as BarcodeEffect] }
      : { state, effects: [] as BarcodeEffect[] };

  switch (e.type) {
    case "seen": {
      if (s.read && s.read.code === e.code && e.at < s.read.until) return { state: s, effects: [] };
      const read = s.read && e.at >= s.read.until ? null : s.read;
      if (s.confirmed === e.code) return { state: { ...s, read, lastSeenAt: e.at }, effects: [] };
      if (s.pending && s.pending.code === e.code && e.at - s.pending.at <= CONFIRM_MS) {
        return {
          state: { ...s, read, pending: null, confirmed: e.code, lastSeenAt: e.at },
          effects: [{ type: "confirmed", code: e.code }],
        };
      }
      return tick(e.at, { ...s, read, pending: { code: e.code, at: e.at } });
    }
    case "partial":
      return tick(e.at, s);
    case "read":
      return { state: { ...s, pending: null, confirmed: null, read: { code: e.code, until: e.at + READ_DEDUPE_MS } }, effects: [] };
    case "sheetClosed": {
      const hold = e.holdMs && e.at !== undefined && s.read ? { code: s.read.code, until: e.at + e.holdMs } : null;
      return { state: { ...s, pending: null, confirmed: null, read: hold }, effects: [] };
    }
    case "tick":
      if (s.confirmed && e.at - s.lastSeenAt >= GONE_MS) return { state: { ...s, confirmed: null }, effects: [{ type: "gone" }] };
      return { state: s, effects: [] };
  }
}

export type AnyCard = { kind: "barcode" | "frame"; key: string; label: string };

/** A barcode card takes priority over the frame-check card. */
export function pickCard<B extends AnyCard, F extends AnyCard>(barcode: B | null, frame: F | null): B | F | null {
  return barcode ?? frame ?? null;
}

/** Frame-check calls pause while a barcode is on the card or being confirmed. */
export function frameCheckAllowed(o: { barcodeCard: boolean; confirming: boolean }): boolean {
  return !o.barcodeCard && !o.confirming;
}
