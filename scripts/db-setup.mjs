// Creates SightLine's Neon tables. The app also does this on first use, so running this is optional.
// Usage: node --env-file=.env.local scripts/db-setup.mjs
import { neon } from "@neondatabase/serverless";

// Keep in sync with SCHEMA in lib/db.ts.
const SCHEMA = [
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

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run: node --env-file=.env.local scripts/db-setup.mjs");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
for (const statement of SCHEMA) await sql.query(statement);
const tables = await sql`SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('lookup_cache', 'analysis_cache', 'scans', 'device_events', 'device_state', 'device_pairs', 'barcode_cache')
  ORDER BY table_name`;
console.log("Ready:", tables.map((t) => t.table_name).join(", "));
