// Copies the live site's keys from .env.local to Vercel (Production), then redeploys so they apply.
//
//   npm run env:push -- --check    which keys .env.local has (names only, never values)
//   npm run env:push               add them to Vercel and redeploy production
//
// Values go to the Vercel CLI on stdin, so they never appear in the terminal or the process list.
// ANTHROPIC_API_KEY is already on Vercel and is left alone.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const SCOPE = "miguelsreese-6882s-projects";
const SITE = "https://sightline-theta-drab.vercel.app";
const KEYS = [
  { name: "ELEVENLABS_API_KEY", what: "Matilda's voice and voice commands (needs Text to Speech and Speech to Text access)" },
  { name: "BRIGHTDATA_API_KEY", what: "web lookups (recalls, nutrition, reviews)" },
  { name: "BRIGHTDATA_SERP_ZONE", what: "web lookups: the SERP zone name, e.g. serp_api1", secret: false },
  { name: "DATABASE_URL", what: "Neon: caches, scan history, Ask your history, the hat camera" },
  { name: "DEVICE_SHARED_KEY", what: "the hat camera (must match the key flashed on the hat)" },
];

const bunVercel = path.join(homedir(), ".bun/bin/vercel");
const VERCEL = process.env.VERCEL_BIN || (existsSync(bunVercel) ? bunVercel : "vercel");
const check = process.argv.includes("--check");

const present = KEYS.filter((k) => (process.env[k.name] ?? "").trim());
const missing = KEYS.filter((k) => !present.includes(k));
for (const k of KEYS) console.log(`${present.includes(k) ? "✓" : "✗"} ${k.name.padEnd(21)} ${k.what}`);
if (missing.length) console.log(`\nMissing from .env.local: ${missing.map((k) => k.name).join(", ")}. Those features stay off.`);
if (check || !present.length) process.exit(present.length ? 0 : 1);

console.log("\nAdding to Vercel (Production)…");
let failed = 0;
for (const k of present) {
  const r = spawnSync(
    VERCEL,
    ["env", "add", k.name, "production", "--force", "--yes", k.secret === false ? "--no-sensitive" : "--sensitive", "--scope", SCOPE],
    { input: process.env[k.name].trim(), encoding: "utf8" },
  );
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${k.name}${ok ? "" : `: ${(r.stderr || r.stdout || "").trim().split("\n").pop()}`}`);
}
if (failed) {
  console.log("\nSome keys weren't added; fix those and run this again. Not redeploying.");
  process.exit(1);
}

// Environment variables only apply to new deployments.
console.log("\nRedeploying production so the keys take effect (about a minute)…");
const re = spawnSync(VERCEL, ["redeploy", SITE, "--target", "production", "--scope", SCOPE], { stdio: "inherit" });
if (re.status !== 0) process.exit(1);

const features = await fetch(`${SITE}/api/features`, { cache: "no-store" })
  .then((r) => r.json())
  .catch(() => null);
console.log("\nLive site features:", features ?? "couldn't reach /api/features");
