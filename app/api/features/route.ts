import { connection } from "next/server";
import type { Features } from "@/lib/modes";
import { brightDataConfigured } from "@/lib/brightdata";
import { elevenKey } from "@/lib/elevenlabs";
import { dbAvailable, dbConfigured } from "@/lib/db";

// Tells the client which optional integrations are configured, without exposing any keys.
export async function GET() {
  await connection(); // read env at request time, not at build time
  const eleven = Boolean(elevenKey());
  const body: Features = {
    elevenlabs: eleven,
    transcribe: eleven,
    lookup: brightDataConfigured() && Boolean(process.env.ANTHROPIC_API_KEY),
    history: dbAvailable(), // false while the database is failing, so the app says so
    ask: dbConfigured() && Boolean(process.env.ANTHROPIC_API_KEY),
    hat: dbConfigured() && Boolean(process.env.DEVICE_SHARED_KEY),
    hatCommands: true, // /api/device/command exists; it answers 503 itself when the hat isn't set up
    barcode: true, // Open Food Facts and openFDA need no keys; the web fallback needs Bright Data
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
