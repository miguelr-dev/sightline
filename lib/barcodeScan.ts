// Client-side barcode scanning for /app (it watches for barcodes in every mode), following the iPhone app
// (mobile/src/logic/barcode.ts): retail barcodes only, a code must be seen twice before it's
// looked up, and a code that was just read is ignored for a while.

export const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
const LENGTH: Record<(typeof BARCODE_FORMATS)[number], number> = { ean_13: 13, ean_8: 8, upc_a: 12, upc_e: 8 };

const CONFIRM_MS = 1200; // the second sighting must come within this
const READ_HOLD_MS = 10_000; // a code that was just read is ignored this long
export const REOPEN_HOLD_MS = 3000; // after closing its answer, wait before reading the same code again

function gtinValid(d: string): boolean {
  let sum = 0;
  const body = d.slice(0, -1);
  for (let i = 0; i < body.length; i++) sum += Number(body[body.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(d[d.length - 1]);
}

/** UPC-E (8 digits) to UPC-A (12 digits): its check digit is computed on the long form. */
export function upcEToA(e: string): string {
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

/** The digits to look up if this is a valid retail barcode, else null (a misread or partial code).
 *  UPC-E is expanded to UPC-A, which is what /api/barcode and the product databases expect. */
export function normalizeBarcode(format: string, raw: string): string | null {
  // Like the iPhone app: a 12-digit "EAN-13" is a UPC-A whose leading 0 was dropped.
  if (format === "ean_13" && raw.length === 12) format = "upc_a";
  const len = LENGTH[format as keyof typeof LENGTH];
  if (!len || !/^\d+$/.test(raw) || raw.length !== len) return null;
  const code = format === "upc_e" ? upcEToA(raw) : raw;
  return gtinValid(code) ? code : null;
}

export type ScanState = {
  last: { code: string; at: number } | null; // seen once, waiting for a second sighting
  hold: { code: string; until: number } | null; // just read: ignored until `until`
};
export const initialScanState: ScanState = { last: null, hold: null };

/** A valid code was seen at `now`. Confirmed on the second sighting within CONFIRM_MS. */
export function onSighting(s: ScanState, code: string, now: number): { state: ScanState; confirmed: boolean } {
  if (s.hold && s.hold.code === code && now < s.hold.until) return { state: s, confirmed: false };
  if (s.last && s.last.code === code && now - s.last.at <= CONFIRM_MS) {
    return { state: { last: null, hold: { code, until: now + READ_HOLD_MS } }, confirmed: true };
  }
  return { state: { ...s, last: { code, at: now } }, confirmed: false };
}

/** Don't offer `code` again until `ms` from now (the user hid its card). */
export function holdCode(s: ScanState, code: string, now: number, ms = READ_HOLD_MS): ScanState {
  return { last: null, hold: { code, until: now + ms } };
}

/** The answer for the held code was closed: allow it again after a short pause. */
export function onAnswerClosed(s: ScanState, now: number): ScanState {
  return s.hold ? { ...s, hold: { ...s.hold, until: now + REOPEN_HOLD_MS } } : s;
}

export type Detected = { rawValue: string; format: string; boundingBox: DOMRectReadOnly };
export type Detector = { detect(source: CanvasImageSource): Promise<Detected[]> };

let detectorPromise: Promise<Detector> | null = null;

/** The browser's own BarcodeDetector when it reads retail codes (Chrome on Android), otherwise a
 *  ZXing WebAssembly reader (Safari on iPhone). The .wasm is served from /public, not a CDN. */
export function getDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    type NativeCtor = { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> };
    const Native = (globalThis as { BarcodeDetector?: NativeCtor }).BarcodeDetector;
    if (Native) {
      try {
        const supported = await Native.getSupportedFormats();
        const formats = BARCODE_FORMATS.filter((f) => supported.includes(f));
        if (formats.length === BARCODE_FORMATS.length) return new Native({ formats });
      } catch {
        // fall through to ZXing
      }
    }
    const { BarcodeDetector, prepareZXingModule, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? `/zxing/zxing_reader-${ZXING_WASM_VERSION}.wasm` : prefix + path,
      },
    });
    return new BarcodeDetector({ formats: [...BARCODE_FORMATS] }) as unknown as Detector;
  })();
  detectorPromise.catch(() => {
    detectorPromise = null; // try again next time
  });
  return detectorPromise;
}
