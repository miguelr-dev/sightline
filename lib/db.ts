import { createHash } from "node:crypto";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
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
  // Hat camera: events the phone polls for, per-hat state, and hat-to-phone pairing.
  `CREATE TABLE IF NOT EXISTS device_events (
    id bigserial PRIMARY KEY,
    device_id text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    kind text NOT NULL CHECK (kind IN ('detected', 'answer', 'hint')),
    payload jsonb NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS device_events_device_idx ON device_events (device_id, id)`,
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
  console.warn(`Neon ${what} failed; continuing without the database:`, String(error).slice(0, 200));
}

export function dbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function sql(): Sql | null {
  if (client === undefined) {
    client = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
  }
  return client;
}

/** Create the tables once per server instance. Retries on the next call if it failed. */
function ensureSchema(db: Sql): Promise<boolean> {
  if (!schemaReady) {
    schemaReady = (async () => {
      for (const statement of SCHEMA) await db.query(statement);
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
  model: string;
  version: string;
}): string {
  return createHash("sha256")
    .update(parts.image)
    .update("\0" + [parts.mode, parts.language, parts.question ?? "", parts.model, parts.version].join("\0"))
    .digest("hex");
}

export function lookupKey(query: string, itemKind: string, language: string): string {
  const q = query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
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

export async function getCachedLookup(key: string): Promise<LookupResponse | undefined> {
  const rows = await withDb(
    "lookup cache read",
    (db) =>
      db`SELECT response FROM lookup_cache
         WHERE key = ${key} AND created_at > now() - make_interval(hours => ${CACHE_TTL_HOURS})`,
    READ_TIMEOUT_MS,
  );
  return (rows?.[0]?.response as LookupResponse | undefined) ?? undefined;
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

export type DeviceEventKind = "detected" | "answer" | "hint";
export type DeviceEvent = {
  id: number;
  createdAt: string;
  kind: DeviceEventKind;
  payload: Record<string, unknown>;
};

/**
 * Record what this frame showed and return how many frames in a row have shown the same
 * ready target (`streak`), plus the target seen on the previous frame (`prevSeenKey`).
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
             WHEN device_state.last_key = EXCLUDED.last_key THEN device_state.streak + 1
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
           AND (${force} OR last_read_key IS DISTINCT FROM ${key}
                OR last_read_at < now() - interval '2 minutes')
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
