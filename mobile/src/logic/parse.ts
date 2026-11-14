import { cleanSections, httpsUrl, MODES, type BarcodeResult, type ItemKind, type LookupResponse, type Mode, type Scan } from "../modes";

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** A barcode answer: GET /api/barcode's reply, or the `barcode` on an analyze answer (a barcode
 *  printed in the photo). `code` is the scanned code when the reply doesn't carry one. */
export function parseBarcode(v: unknown, code?: string): BarcodeResult | undefined {
  if (!v || typeof v !== "object") return undefined;
  const d = v as Record<string, unknown>;
  const c = typeof d.code === "string" ? d.code : code;
  if (!c || !/^\d{8,14}$/.test(c) || !str(d.spokenText)) return undefined;
  return {
    code: c,
    found: d.found === true,
    spokenText: str(d.spokenText)!,
    sections: cleanSections(d.sections),
    itemKind: typeof d.itemKind === "string" ? (d.itemKind as ItemKind) : undefined,
    image: httpsUrl(d.image),
    title: str(d.title),
    brand: str(d.brand),
    scanId: typeof d.scanId === "string" || typeof d.scanId === "number" ? String(d.scanId) : undefined,
  };
}

export function parseLookup(v: unknown): LookupResponse | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Partial<LookupResponse>;
  if (typeof l.spokenText !== "string" || !l.spokenText.trim()) return null;
  return {
    spokenText: l.spokenText,
    details: typeof l.details === "string" ? l.details : "",
    query: typeof l.query === "string" ? l.query : "",
    itemKind: l.itemKind,
    image: httpsUrl(l.image),
    sections: cleanSections(l.sections),
    sources: Array.isArray(l.sources)
      ? l.sources
          .filter((x) => x && typeof x.url === "string" && typeof x.title === "string")
          .map((x) => ({ title: x.title, url: x.url, thumbnail: httpsUrl(x.thumbnail) }))
      : [],
    error: l.error === true,
  };
}

/** One row of GET /api/history. The server calls the picture `imageUrl`. */
export function parseHistoryScan(v: unknown): Scan | null {
  if (!v || typeof v !== "object") return null;
  const x = v as Record<string, unknown>;
  if (!(typeof x.id === "string" || typeof x.id === "number") || typeof x.spokenText !== "string") return null;
  const lk = parseLookup(x.lookup);
  return {
    id: String(x.id),
    createdAt: typeof x.createdAt === "string" ? x.createdAt : "",
    mode: MODES.includes(x.mode as Mode) ? (x.mode as Mode) : "describe",
    itemKind: typeof x.itemKind === "string" ? (x.itemKind as ItemKind) : undefined,
    title: typeof x.title === "string" && x.title.trim() ? x.title.trim() : x.spokenText.slice(0, 60),
    spokenText: x.spokenText,
    sections: cleanSections(x.sections),
    lookup: lk,
    image: httpsUrl(x.imageUrl) ?? httpsUrl(x.image) ?? lk?.image,
  };
}
