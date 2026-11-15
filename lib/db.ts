import { createHash } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import type { BarcodeResult } from "./barcode";
import type { AnalyzeResponse, HistoryScan, LookupResponse, Mode, Section } from "./modes";

// Server-only: Neon Postgres for caches and scan history, over Neon's HTTP driver.
// Everything here is optional. Without DATABASE_URL, or when Neon errors or is slow,
// these helpers return nothing and SightLine carries on without the database.
// Photos are never stored: only answer text, sections and web image URLs.

type Sql = NeonQueryFunction<false, false>;

const CACHE_TTL_HOURS = 24;
const READ_TIMEOUT_MS = 1_500; // a cache read never holds up an answer for longer than this

// Keep in sync with scripts/db-setup.mjs.
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS lookup_cache (
    key text PRIMARY KEY,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS analysis_cache (
    key text PRIMARY KEY,
    response jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS scans (
    id uuid PRIMARY KEY,
    device_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    mode text NOT NULL,
    item_kind text,
    key text,
    title text,
    spoken_text text NOT NULL,
    sections jsonb NOT NULL DEFAULT '[]'::jsonb,
    lookup jsonb,
    image_url text,
    analysis_key text
  )`,
  `CREATE INDEX IF NOT EXISTS scans_device_created_idx ON scans (device_id, created_at DESC)`,
  // Full-text search over everything a scan says (title, answer, sections, web summary).
  `ALTER TABLE scans ADD COLUMN IF NOT EXISTS search tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(spoken_text, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(jsonb_path_query_array(sections, '$[*].body')::text, '')), 'C') ||
    setweight(to_tsvector('english',
      coalesce(lookup->>'spokenText', '') || ' ' ||
      coalesce(jsonb_path_query_array(lookup, '$.sections[*].body')::text, '')), 'D')
  ) STORED`,
  `CREATE INDEX IF NOT EXISTS scans_search_idx ON scans USING gin (search)`,
  `CREATE INDEX IF NOT EXISTS scans_device_kind_idx ON scans (device_id, item_kind, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS scans_created_idx ON scans (created_at)`,
  `CREATE INDEX IF NOT EXISTS lookup_cache_created_idx ON lookup_cache (created_at)`,
  `CREATE INDEX IF NOT EXISTS analysis_cache_created_idx ON analysis_cache (created_at)`,
  // Barcode answers by GTIN-14: products found are kept 7 days, misses 1 hour.
  `CREATE TABLE IF NOT EXISTS barcode_cache (
    key text PRIMARY KEY,
    response jsonb NOT NULL,
    found boolean NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Hat camera: events the phone polls for, per-hat state, and hat-to-phone pairing.
  `CREATE TABLE IF NOT EXISTS device_events (
    id bigserial PRIMARY KEY,
    device_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL CHECK (kind IN ('detected', 'answer', 'hint', 'status')),
    payload jsonb NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS device_events_device_idx ON device_events (device_id, id)`,
  // Voice commands from the phone add a "status" event (e.g. "No picture from your hat camera").
  `ALTER TABLE device_events DROP CONSTRAINT IF EXISTS device_events_kind_check,
    ADD CONSTRAINT device_events_kind_check CHECK (kind IN ('detected', 'answer', 'hint', 'status'))`,
  `CREATE TABLE IF NOT EXISTS device_state (
    device_id text PRIMARY KEY,
    last_key text,
    streak integer NOT NULL DEFAULT 0,
    last_seen_key text,
    last_read_key text,
    last_read_at timestamptz,
    last_hint_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS device_pairs (
    device_id text PRIMARY KEY,
    phone_device text NOT NULL,
    paired_at timestamptz NOT NULL DEFAULT now()
  )`,
  // Pairing is sticky: last_seen is the paired phone's last poll (see claimPairing).
  `ALTER TABLE device_pairs ADD COLUMN IF NOT EXISTS last_seen timestamptz NOT NULL DEFAULT now()`,
];

let client: Sql | null | undefined;
let schemaReady: Promise<boolean> | null = null;
let warned = false;
let failedAt = 0;
const BACKOFF_MS = 60_000; // after a failure, skip the database for a minute instead of retrying each request

function warnOnce(what: string, error: unknown) {
  failedAt = Date.now();
  if (warned) return;
  warned = true;
  console.warn(
    `Neon ${what} failed; continuing without the database:`,
    String(error).slice(0, 200),
  );
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Configured and not failing: false for a minute after a database call failed. */
export function dbAvailable(): boolean {
  return dbConfigured() && Date.now() - failedAt >= BACKOFF_MS;
}

function sql(): Sql | null {
  if (client === undefined) {
    client = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
  }
  return client;
}

/** Create the tables once per server instance. Retries on the next call if it failed.
 *  All statements go in one HTTP round trip (about 80 ms, against about 1 s one by one),
 *  which every cold server instance pays before its first query. */
function ensureSchema(db: Sql): Promise<boolean> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.transaction(SCHEMA.map((statement) => db.query(statement)));
      return true;
    })().catch((error) => {
      warnOnce("schema setup", error);
      schemaReady = null;
      return false;
    });
  }
  return schemaReady;
}

/** Run `fn` against the database, or return undefined if it's missing, failing or too slow. */
async function withDb<T>(what: string, fn: (db: Sql) => Promise<T>, timeoutMs?: number) {
  const db = sql();
  if (!db || Date.now() - failedAt < BACKOFF_MS) return undefined;
  const work = (async () => {
    if (!(await ensureSchema(db))) return undefined;
    return fn(db);
  })().catch((error) => {
    warnOnce(what, error);
    return undefined;
  });
  if (!timeoutMs) return work;
  return Promise.race([
    work,
    new Promise<undefined>((r) => setTimeout(() => r(undefined), timeoutMs)),
  ]);
}

// ---------- Keys ----------

/** sha256 of the photo bytes plus everything that changes the answer. */
export function analysisKey(parts: {
  image: string;
  mode: string;
  language: string;
  question?: string;
  conversation?: { question: string; answer: string }[]; // earlier turns change the answer
  model: string;
  version: string;
}): string {
  return createHash("sha256")
    .update(parts.image)
    .update(
      "\0" +
        [
          parts.mode,
          parts.language,
          parts.question ?? "",
          parts.model,
          parts.version,
          parts.conversation?.length ? JSON.stringify(parts.conversation) : "",
        ].join("\0"),
    )
    .digest("hex");
}

export function lookupKey(query: string, itemKind: string, language: string): string {
  const q = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return `${itemKind}|${language.toLowerCase()}|${q}`;
}

const DEVICE_ID = /^[A-Za-z0-9-]{8,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The client's `x-sightline-device` header, if it's a plausible random ID. */
export function deviceId(request: Request): string | undefined {
  const v = request.headers.get("x-sightline-device")?.trim();
  return v && DEVICE_ID.test(v) ? v : undefined;
}

export function isScanId(v: unknown): v is string {
  return typeof v === "string" && UUID.test(v);
}

// ---------- Caches ----------

export async function getCachedAnalysis(key: string): Promise<AnalyzeResponse | undefined> {
  const rows = await withDb(
    "analysis cache read",
    (db) =>
      db`SELECT response FROM analysis_cache
         WHERE key = ${key} AND created_at > now() - make_interval(hours => ${CACHE_TTL_HOURS})`,
    READ_TIMEOUT_MS,
  );
  return (rows?.[0]?.response as AnalyzeResponse | undefined) ?? undefined;
}

export async function putCachedAnalysis(key: string, response: AnalyzeResponse) {
  await withDb(
    "analysis cache write",
    (db) =>
      db`INSERT INTO analysis_cache (key, response) VALUES (${key}, ${JSON.stringify(response)}::jsonb)
         ON CONFLICT (key) DO UPDATE SET response = EXCLUDED.response, created_at = now()`,
  );
}

const NO_IMAGE_TTL_SECONDS = 10 * 60;

/** A cached lookup is reused for 24 hours, but one saved without the picture it could have had
 *  for only 10 minutes, so a later lookup can fill the picture in. */
export function lookupStillFresh(
  response: LookupResponse,
  ageSeconds: number,
  imageExpected: boolean,
): boolean {
  const ttl = imageExpected && !response.image ? NO_IMAGE_TTL_SECONDS : CACHE_TTL_HOURS * 3600;
  return ageSeconds < ttl;
}

export async function getCachedLookup(
  key: string,
  opts: { imageExpected?: boolean } = {},
): Promise<LookupResponse | undefined> {
  const rows = await withDb(
    "lookup cache read",
    (db) =>
      db`SELECT response, EXTRACT(EPOCH FROM now() - created_at)::float AS age_s FROM lookup_cache
         WHERE key = ${key} AND created_at > now() - make_interval(hours => ${CACHE_TTL_HOURS})`,
    READ_TIMEOUT_MS,
  );
  const row = rows?.[0];
  const response = row?.response as LookupResponse | undefined;
  if (!response) return undefined;
  return lookupStillFresh(response, Number(row?.age_s) || 0, opts.imageExpected === true)
    ? response
    : undefined;
}

/** A cached barcode answer: 7 days for a product that was found, 1 hour for a miss. */
export async function getCachedBarcode(key: string): Promise<BarcodeResult | undefined> {
  const rows = await withDb(
    "barcode cache read",
    (db) =>
      db`SELECT response FROM barcode_cache
         WHERE key = ${key}
           AND created_at > now() - CASE WHEN found THEN interval '7 days' ELSE interval '1 hour' END`,
    READ_TIMEOUT_MS,
  );
  return (rows?.[0]?.response as BarcodeResult | undefined) ?? undefined;
}

export async function putCachedBarcode(key: string, response: BarcodeResult) {
  await withDb(
    "barcode cache write",
    (db) =>
      db`INSERT INTO barcode_cache (key, response, found)
         VALUES (${key}, ${JSON.stringify(response)}::jsonb, ${response.found})
         ON CONFLICT (key) DO UPDATE SET response = EXCLUDED.response, found = EXCLUDED.found,
           created_at = now()`,
  );
}

export async function putCachedLookup(key: string, response: LookupResponse) {
  await withDb(
    "lookup cache write",
    (db) =>
      db`INSERT INTO lookup_cache (key, response) VALUES (${key}, ${JSON.stringify(response)}::jsonb)
         ON CONFLICT (key) DO UPDATE SET response = EXCLUDED.response, created_at = now()`,
  );
}

// ---------- Scan history ----------

export type ScanRow = HistoryScan;

/** The id of this device's scan of the same photo in the last 10 minutes, so a replay or retry
 *  doesn't add a duplicate history entry. */
export async function recentScanId(device: string, analysis: string): Promise<string | undefined> {
  const rows = await withDb(
    "scan read",
    (db) =>
      db`SELECT id FROM scans WHERE device_id = ${device} AND analysis_key = ${analysis}
         AND created_at > now() - interval '10 minutes' ORDER BY created_at DESC LIMIT 1`,
    READ_TIMEOUT_MS,
  );
  return (rows?.[0]?.id as string | undefined) ?? undefined;
}

export async function insertScan(scan: {
  id: string;
  device: string;
  mode: Mode;
  itemKind?: string;
  key?: string;
  title?: string;
  spokenText: string;
  sections: Section[];
  analysisKey: string;
}) {
  await withDb(
    "scan write",
    (db) =>
      db`INSERT INTO scans (id, device_id, mode, item_kind, key, title, spoken_text, sections, analysis_key)
         VALUES (${scan.id}, ${scan.device}, ${scan.mode}, ${scan.itemKind ?? null}, ${scan.key ?? null},
                 ${scan.title ?? null}, ${scan.spokenText}, ${JSON.stringify(scan.sections)}::jsonb,
                 ${scan.analysisKey})
         ON CONFLICT (id) DO NOTHING`,
  );
}

/** Attach a finished web lookup (and its picture URL) to the scan it was made for. */
export async function attachLookup(scanId: string, device: string, lookup: LookupResponse) {
  const imageUrl = lookup.image && lookup.image.startsWith("https://") ? lookup.image : null;
  await withDb(
    "scan update",
    (db) =>
      db`UPDATE scans SET lookup = ${JSON.stringify(lookup)}::jsonb,
         image_url = COALESCE(${imageUrl}, image_url)
         WHERE id = ${scanId} AND device_id = ${device}`,
  );
}

export async function listScans(device: string, limit: number): Promise<ScanRow[] | undefined> {
  const rows = await withDb(
    "history read",
    (db) =>
      db`SELECT id, created_at, mode, item_kind, key, title, spoken_text, sections, lookup, image_url
         FROM scans WHERE device_id = ${device} ORDER BY created_at DESC LIMIT ${limit}`,
  );
  return rows?.map((r) => ({
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    mode: r.mode,
    itemKind: r.item_kind,
    key: r.key,
    title: r.title,
    spokenText: r.spoken_text,
    sections: r.sections ?? [],
    lookup: r.lookup ?? null,
    imageUrl: r.image_url,
  }));
}

export async function clearScans(device: string): Promise<number | undefined> {
  const rows = await withDb(
    "history delete",
    (db) => db`DELETE FROM scans WHERE device_id = ${device} RETURNING id`,
  );
  return rows?.length;
}

// ---------- Ask your history (read-only, always scoped to one device) ----------

export type ScanSummary = {
  id: string;
  createdAt: string;
  mode: string;
  itemKind: string | null;
  title: string | null;
  spokenText: string;
  sections: Section[];
  webSummary: string | null;
};

function toSummary(r: Record<string, unknown>): ScanSummary {
  const lookup = r.lookup as LookupResponse | null;
  return {
    id: r.id as string,
    createdAt: new Date(r.created_at as string).toISOString(),
    mode: r.mode as string,
    itemKind: (r.item_kind as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    spokenText: r.spoken_text as string,
    sections: (r.sections as Section[] | null) ?? [],
    webSummary: lookup && !lookup.error ? lookup.spokenText : null,
  };
}

/** Full-text search over one device's scans. Words are OR-ed and results ranked by relevance. */
export async function searchScans(
  device: string,
  opts: { query: string; kind?: string; since?: string; limit?: number },
): Promise<ScanSummary[] | undefined> {
  const words = opts.query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 12);
  if (!words.length) return [];
  const tsq = words.join(" or ");
  const since = opts.since && !Number.isNaN(Date.parse(opts.since)) ? opts.since : null;
  const limit = Math.min(10, Math.max(1, opts.limit ?? 5));
  const rows = await withDb(
    "history search",
    (db) =>
      db`SELECT id, created_at, mode, item_kind, title, spoken_text, sections, lookup,
                ts_rank(search, websearch_to_tsquery('english', ${tsq})) AS rank
         FROM scans
         WHERE device_id = ${device}
           AND search @@ websearch_to_tsquery('english', ${tsq})
           AND (${opts.kind ?? null}::text IS NULL OR item_kind = ${opts.kind ?? null})
           AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
         ORDER BY rank DESC, created_at DESC
         LIMIT ${limit}`,
  );
  return rows?.map(toSummary);
}

export async function recentScans(
  device: string,
  opts: { limit?: number; kind?: string; since?: string },
): Promise<ScanSummary[] | undefined> {
  const since = opts.since && !Number.isNaN(Date.parse(opts.since)) ? opts.since : null;
  const limit = Math.min(20, Math.max(1, opts.limit ?? 5));
  const rows = await withDb(
    "history recent",
    (db) =>
      db`SELECT id, created_at, mode, item_kind, title, spoken_text, sections, lookup
         FROM scans
         WHERE device_id = ${device}
           AND (${opts.kind ?? null}::text IS NULL OR item_kind = ${opts.kind ?? null})
           AND (${since}::timestamptz IS NULL OR created_at >= ${since}::timestamptz)
         ORDER BY created_at DESC
         LIMIT ${limit}`,
  );
  return rows?.map(toSummary);
}

/** How many scans this device has in all, and how many since `since` (an ISO timestamp). */
export async function countScans(
  device: string,
  since: string,
): Promise<{ total: number; since: number } | undefined> {
  const rows = await withDb(
    "history count",
    (db) =>
      db`SELECT count(*)::int AS total,
                count(*) FILTER (WHERE created_at >= ${since}::timestamptz)::int AS since
         FROM scans WHERE device_id = ${device}`,
  );
  const r = rows?.[0];
  return r ? { total: Number(r.total), since: Number(r.since) } : undefined;
}

/** One scan in full, including the web lookup's sections and sources. */
export async function getScan(device: string, id: string): Promise<ScanRow | undefined> {
  if (!isScanId(id)) return undefined;
  const rows = await withDb(
    "history get",
    (db) =>
      db`SELECT id, created_at, mode, item_kind, key, title, spoken_text, sections, lookup, image_url
         FROM scans WHERE device_id = ${device} AND id = ${id}`,
  );
  const r = rows?.[0];
  if (!r) return undefined;
  return {
    id: r.id,
    createdAt: new Date(r.created_at).toISOString(),
    mode: r.mode,
    itemKind: r.item_kind,
    key: r.key,
    title: r.title,
    spokenText: r.spoken_text,
    sections: r.sections ?? [],
    lookup: r.lookup ?? null,
    imageUrl: r.image_url,
  };
}

// ---------- Hat camera ----------

export type DeviceEventKind = "detected" | "answer" | "hint" | "status";
export type DeviceEvent = {
  id: number;
  createdAt: string;
  kind: DeviceEventKind;
  payload: Record<string, unknown>;
};

/**
 * Record what this frame showed and return how many frames in a row have shown the same
 * ready target (`streak`), plus the target seen on the previous frame (`prevSeenKey`).
 * Keys are match keys from lib/hat.ts: the same target when they share a word.
 */
export async function updateHatState(
  device: string,
  readyKey: string | null,
  seenKey: string | null,
): Promise<{ streak: number; prevSeenKey: string | null } | undefined> {
  const rows = await withDb(
    "hat state",
    (db) =>
      db`WITH prev AS (SELECT last_seen_key FROM device_state WHERE device_id = ${device})
         INSERT INTO device_state (device_id, last_key, streak, last_seen_key, updated_at)
         VALUES (${device}, ${readyKey}, ${readyKey ? 1 : 0}, ${seenKey}, now())
         ON CONFLICT (device_id) DO UPDATE SET
           streak = CASE
             WHEN EXCLUDED.last_key IS NULL THEN 0
             WHEN string_to_array(device_state.last_key, '-') && string_to_array(EXCLUDED.last_key, '-')
               THEN device_state.streak + 1
             ELSE 1 END,
           last_key = EXCLUDED.last_key,
           last_seen_key = EXCLUDED.last_seen_key,
           updated_at = now()
         RETURNING streak, (SELECT last_seen_key FROM prev) AS prev_seen_key`,
  );
  const r = rows?.[0];
  return r ? { streak: Number(r.streak), prevSeenKey: r.prev_seen_key ?? null } : undefined;
}

/**
 * Claim the right to read `key` now. False if this hat already read the same target in the
 * last 2 minutes (so it isn't read again while the user keeps looking at it). `force` (the
 * hat's button) always claims.
 */
export async function claimHatRead(device: string, key: string, force: boolean) {
  const rows = await withDb(
    "hat read claim",
    (db) =>
      db`UPDATE device_state SET last_read_key = ${key}, last_read_at = now()
         WHERE device_id = ${device}
           AND (${force} OR last_read_key IS NULL
                OR last_read_at < now() - interval '2 minutes'
                OR NOT (string_to_array(last_read_key, '-') && string_to_array(${key}::text, '-')))
         RETURNING 1 AS ok`,
  );
  return Boolean(rows?.length);
}

/** At most one spoken framing hint every 5 seconds per hat. */
export async function claimHatHint(device: string) {
  const rows = await withDb(
    "hat hint claim",
    (db) =>
      db`UPDATE device_state SET last_hint_at = now()
         WHERE device_id = ${device}
           AND (last_hint_at IS NULL OR last_hint_at < now() - interval '5 seconds')
         RETURNING 1 AS ok`,
  );
  return Boolean(rows?.length);
}

export async function addDeviceEvent(
  device: string,
  kind: DeviceEventKind,
  payload: Record<string, unknown>,
): Promise<number | undefined> {
  const rows = await withDb(
    "hat event write",
    (db) =>
      db`INSERT INTO device_events (device_id, kind, payload)
         VALUES (${device}, ${kind}, ${JSON.stringify(payload)}::jsonb) RETURNING id`,
  );
  return rows?.[0] ? Number(rows[0].id) : undefined;
}

/** Events newer than `after`, oldest first; without `after`, those from the last minute. */
export async function deviceEventsAfter(
  device: string,
  after: number | null,
  limit = 20,
): Promise<DeviceEvent[] | undefined> {
  const rows = await withDb(
    "hat event read",
    (db) =>
      db`SELECT id, created_at, kind, payload FROM device_events
         WHERE device_id = ${device}
           AND (CASE WHEN ${after}::bigint IS NULL THEN created_at > now() - interval '1 minute'
                     ELSE id > ${after}::bigint END)
         ORDER BY id ASC LIMIT ${limit}`,
  );
  return rows?.map((r) => ({
    id: Number(r.id),
    createdAt: new Date(r.created_at).toISOString(),
    kind: r.kind,
    payload: r.payload,
  }));
}

/** The phone (x-sightline-device) this hat is paired with, if any. */
export async function pairedPhone(device: string): Promise<string | undefined> {
  const rows = await withDb(
    "hat pair read",
    (db) => db`SELECT phone_device FROM device_pairs WHERE device_id = ${device}`,
  );
  return (rows?.[0]?.phone_device as string | undefined) ?? undefined;
}

export async function pairHat(device: string, phone: string) {
  await withDb(
    "hat pair write",
    (db) =>
      db`INSERT INTO device_pairs (device_id, phone_device) VALUES (${device}, ${phone})
         ON CONFLICT (device_id) DO UPDATE SET phone_device = EXCLUDED.phone_device, paired_at = now()`,
  );
}

/** How long the paired phone can go without polling before another phone may take the hat. */
export const PAIRING_STALE_SECONDS = 60;

/**
 * Pair `phone` with the hat, or keep it paired, and note that it just polled. The first phone
 * stays paired until it unpairs or stops polling for PAIRING_STALE_SECONDS; until then other
 * phones get "elsewhere". Atomic, so two pollers can't flip the pairing back and forth.
 * Undefined if the database can't be reached.
 */
export async function claimPairing(
  device: string,
  phone: string,
): Promise<"ok" | "elsewhere" | undefined> {
  const rows = await withDb(
    "hat pairing",
    (db) =>
      db`INSERT INTO device_pairs (device_id, phone_device, paired_at, last_seen)
         VALUES (${device}, ${phone}, now(), now())
         ON CONFLICT (device_id) DO UPDATE SET
           phone_device = EXCLUDED.phone_device,
           paired_at = CASE WHEN device_pairs.phone_device = EXCLUDED.phone_device
                            THEN device_pairs.paired_at ELSE now() END,
           last_seen = now()
         WHERE device_pairs.phone_device = EXCLUDED.phone_device
            OR device_pairs.last_seen < now() - make_interval(secs => ${PAIRING_STALE_SECONDS})
         RETURNING phone_device`,
  );
  if (rows === undefined) return undefined;
  return rows.length ? "ok" : "elsewhere";
}

/** Unpair the hat, but only if `phone` is the one paired with it. */
export async function unpairHat(device: string, phone: string): Promise<boolean> {
  const rows = await withDb(
    "hat unpair",
    (db) =>
      db`DELETE FROM device_pairs WHERE device_id = ${device} AND phone_device = ${phone}
         RETURNING device_id`,
  );
  return Boolean(rows?.length);
}
