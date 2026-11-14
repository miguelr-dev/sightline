import { after } from "next/server";
import { randomUUID } from "node:crypto";
import { LANGUAGES, type BarcodeResponse } from "@/lib/modes";
import {
  barcodeCacheKey,
  gtin14,
  lookupBarcode,
  translateBarcode,
  validBarcode,
} from "@/lib/barcode";
import { dbConfigured, deviceId, getCachedBarcode, insertScan, putCachedBarcode } from "@/lib/db";

// Barcode lookup for grocery shopping: GET /api/barcode?code=<digits>&language=<name>.
// The app scans a UPC or EAN barcode, and this returns the product's ingredients, allergens and
// nutrition (Open Food Facts), drug facts and recalls (openFDA), or a web summary.

export const maxDuration = 30;

function json(body: BarcodeResponse, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("code") ?? "";
  const code = validBarcode(raw);
  if (!code) {
    return json(
      {
        code: raw.slice(0, 20),
        found: false,
        error: "bad-code",
        spokenText: "That doesn't look like a whole barcode. Please scan it again.",
        sections: [],
        itemKind: "none",
      },
      400,
    );
  }
  const langParam = url.searchParams.get("language");
  const language = langParam && LANGUAGES.some((l) => l.name === langParam) ? langParam : "English";
  const cacheKey = barcodeCacheKey(code, language);

  const hit = await getCachedBarcode(cacheKey);
  const result = hit ?? (await translateBarcode(await lookupBarcode(code), language));

  const device = deviceId(request);
  const scanId = result.found && device && dbConfigured() ? randomUUID() : undefined;
  after(async () => {
    if (!hit) await putCachedBarcode(cacheKey, result);
    if (scanId && device) {
      await insertScan({
        id: scanId,
        device,
        mode: "menu",
        itemKind: result.itemKind,
        key: `barcode-${code}`,
        title: result.title,
        spokenText: result.spokenText,
        sections: result.sections,
        analysisKey: `barcode:${gtin14(code)}`,
      });
    }
  });
  console.log(
    `[barcode] ${code} ${hit ? "cached" : (result.source ?? "not-found")} ${result.title ?? ""}`,
  );
  return json({
    ...result,
    code,
    ...(scanId ? { scanId } : {}),
    ...(hit ? { cached: true } : {}),
  });
}
