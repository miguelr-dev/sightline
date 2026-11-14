// Server-only: Google search results through Bright Data's SERP API.
// Docs: https://docs.brightdata.com/scraping-automation/serp-api

const ENDPOINT = "https://api.brightdata.com/request";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  date?: string;
  thumbnail?: string; // https URL or a small data: URI
};

// Google often inlines thumbnails as base64 data URIs; keep only small ones.
const MAX_DATA_URI = 12_000;

export function brightDataConfigured(): boolean {
  return Boolean(process.env.BRIGHTDATA_API_KEY && process.env.BRIGHTDATA_SERP_ZONE);
}

type Organic = {
  title?: unknown;
  link?: unknown;
  url?: unknown;
  description?: unknown;
  snippet?: unknown;
  date?: unknown;
  display_link?: unknown;
  image?: unknown;
  image_url?: unknown;
  image_base64?: unknown;
};

/** An image field from Bright Data: an https URL, or a data: URI if it's small. */
export function pickImage(...candidates: unknown[]): string | undefined {
  for (const c of candidates) {
    if (typeof c !== "string") continue;
    if (/^https:\/\/\S+$/.test(c) && c.length < 2000) return c;
    if (
      /^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(c) &&
      c.length <= MAX_DATA_URI
    ) {
      return c;
    }
  }
  return undefined;
}

function asText(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function isGoogle(url: string): boolean {
  try {
    return /(^|\.)google\.[a-z.]+$/.test(new URL(url).hostname);
  } catch {
    return true;
  }
}

function toResult(o: Organic): SearchResult | null {
  let url = asText(o.link, 500) || asText(o.url, 500);
  const title = asText(o.title, 200);
  if (!url || !title || !/^https?:\/\//.test(url)) return null;
  // Google sometimes wraps results in its own redirect links. Use the site shown under the
  // title ("https://www.yelp.com › biz › …") instead, or skip the result if there's none.
  if (isGoogle(url)) {
    const shown = asText(o.display_link, 300).split(" › ")[0];
    if (!/^https?:\/\/[^\s/]+/.test(shown) || isGoogle(shown)) return null;
    url = shown;
  }
  const date = asText(o.date, 40);
  const thumbnail = pickImage(o.image_url, o.image, o.image_base64);
  return {
    title,
    url,
    snippet: asText(o.description, 500) || asText(o.snippet, 500),
    ...(date ? { date } : {}),
    ...(thumbnail ? { thumbnail } : {}),
  };
}

/** Fetch one Google results page through Bright Data as parsed JSON. */
async function fetchSerp(
  query: string,
  opts: { images?: boolean; signal?: AbortSignal } = {},
): Promise<Record<string, unknown>> {
  const key = process.env.BRIGHTDATA_API_KEY;
  const zone = process.env.BRIGHTDATA_SERP_ZONE;
  if (!key || !zone) throw new Error("Bright Data is not configured");

  // brd_json=1 asks Bright Data to return Google's results parsed as JSON.
  // hl/gl: without them Bright Data's results come from a non-US location.
  const target =
    `https://www.google.com/search?q=${encodeURIComponent(query)}` +
    `${opts.images ? "&tbm=isch" : ""}&hl=en&gl=us&brd_json=1`;
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ zone, url: target, format: "raw" }),
    signal: opts.signal,
  });
  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Bright Data error ${res.status}: ${raw.slice(0, 300)}`);
  }
  if (!raw.trim()) throw new Error("Bright Data returned an empty reply");

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw) as Record<string, unknown>;
    // With format "json" the parsed page arrives as a string in `body`; handle both.
    if (typeof data.body === "string") data = JSON.parse(data.body) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Bright Data returned something other than JSON (${res.headers.get("content-type")}): ${raw.slice(0, 200)}`,
    );
  }
  return data;
}

export type WebSearch = {
  results: SearchResult[];
  image?: string; // the first picture Google showed for the query (usually a small thumbnail)
};

/** One Google search through Bright Data. Throws on network or API errors and empty replies. */
async function searchOnce(
  query: string,
  opts: { limit?: number; signal?: AbortSignal } = {},
): Promise<WebSearch> {
  const data = await fetchSerp(query, { signal: opts.signal });

  const results: SearchResult[] = [];
  const seen = new Set<string>();
  const add = (list: unknown, max: number) => {
    if (!Array.isArray(list)) return;
    for (const item of list.slice(0, max)) {
      const r = item && typeof item === "object" ? toResult(item as Organic) : null;
      if (r && !seen.has(r.url)) {
        seen.add(r.url);
        results.push(r);
      }
    }
  };
  // A couple of news items first (recalls and warnings often show up there), then the web.
  add(data.top_stories, 2);
  add(data.news, 2);
  add(data.organic, 8);

  // Google's image strip links each picture to a page; use them as thumbnails for those pages.
  const images = Array.isArray(data.images) ? (data.images as Record<string, unknown>[]) : [];
  const imageFor = new Map<string, string>();
  for (const img of images) {
    const link = asText(img.link, 500);
    const pic = pickImage(img.image_url, img.image, img.image_base64);
    if (link && pic && !imageFor.has(link)) imageFor.set(link, pic);
  }
  for (const r of results) {
    if (!r.thumbnail && imageFor.has(r.url)) r.thumbnail = imageFor.get(r.url);
  }
  const first = images
    .map((img) => pickImage(img.image_url, img.image, img.image_base64))
    .find(Boolean);
  return { results: results.slice(0, opts.limit ?? 7), ...(first ? { image: first } : {}) };
}

const HEDGE_AFTER_MS = 3_500;

function broaden(query: string): string {
  const words = query.split(/\s+/).filter(Boolean);
  return words.length > 3 ? words.slice(0, -1).join(" ") : `${query} information`;
}

/**
 * Google search with a hedge: Bright Data usually answers in 2-4 seconds but sometimes
 * takes 10 or more, or returns an empty reply. If the first request is slow or fails,
 * a second one starts, and the first good answer wins. Throws if both fail or time runs out.
 */
export async function searchWeb(
  query: string,
  opts: { limit?: number; timeoutMs: number },
): Promise<WebSearch> {
  const controllers: AbortController[] = [];
  const deadline = AbortSignal.timeout(opts.timeoutMs);
  let settled = false;
  const attempt = () => {
    const c = new AbortController();
    controllers.push(c);
    deadline.addEventListener("abort", () => !settled && c.abort(deadline.reason), { once: true });
    // The backup searches a slightly broader query: Bright Data refuses the exact same
    // search for 15 seconds after it fails, and fewer words often finds more anyway.
    const q = controllers.length > 1 ? broaden(query) : query;
    return searchOnce(q, { limit: opts.limit, signal: c.signal });
  };

  // The slower duplicate is left to finish (and is ignored) rather than cancelled, since a
  // cancelled request can make Bright Data refuse the same query for a few seconds.
  return new Promise<WebSearch>((resolve, reject) => {
    let failures = 0;
    let started = 0;
    const launch = () => {
      started++;
      attempt().then(
        (r) => {
          settled = true;
          clearTimeout(hedgeTimer);
          resolve(r);
        },
        (e) => {
          failures++;
          if (!deadline.aborted)
            console.warn(`Bright Data attempt ${started} failed:`, String(e).slice(0, 200));
          if (deadline.aborted) return reject(deadline.reason ?? e);
          if (started < 2) {
            clearTimeout(hedgeTimer);
            launch(); // first one failed fast: retry right away
          } else if (failures >= started) {
            reject(e);
          }
        },
      );
    };
    const hedgeTimer = setTimeout(() => {
      if (started < 2) launch();
    }, HEDGE_AFTER_MS);
    launch();
    deadline.addEventListener("abort", () => reject(deadline.reason), { once: true });
  });
}

/**
 * One picture of the item (a product packshot, a restaurant photo) from Google Images.
 * Prefers the full-size https image; falls back to a small inline thumbnail. Never throws.
 */
export async function searchImage(query: string, timeoutMs: number): Promise<string | undefined> {
  try {
    const data = await fetchSerp(query, { images: true, signal: AbortSignal.timeout(timeoutMs) });
    const images = Array.isArray(data.images) ? (data.images as Record<string, unknown>[]) : [];
    // Prefer direct image files from ordinary sites; social-media crawler links often won't load.
    const urls = images
      .slice(0, 8)
      .map((img) => pickImage(img.original_image))
      .filter((u): u is string => Boolean(u) && !u!.startsWith("data:"));
    const direct = urls.find(
      (u) =>
        /\.(jpe?g|png|webp)(\?|$)/i.test(u) &&
        !/instagram|facebook|fbcdn|fbsbx|lookaside|tiktok|pinimg/i.test(u),
    );
    const usable = direct ?? urls.find((u) => !/lookaside|fbsbx/i.test(u));
    if (usable) return usable;
    for (const img of images.slice(0, 3)) {
      const thumb = pickImage(img.image, img.image_base64);
      if (thumb) return thumb;
    }
  } catch (error) {
    console.warn("Bright Data image search failed:", String(error).slice(0, 160));
  }
  return undefined;
}
