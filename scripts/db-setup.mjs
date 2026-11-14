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
];

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run: node --env-file=.env.local scripts/db-setup.mjs");
  process.exit(1);
}
const sql = neon(process.env.DATABASE_URL);
for (const statement of SCHEMA) await sql.query(statement);
const tables = await sql`SELECT table_name FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name IN ('lookup_cache', 'analysis_cache', 'scans')
  ORDER BY table_name`;
console.log("Ready:", tables.map((t) => t.table_name).join(", "));
