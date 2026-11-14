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
