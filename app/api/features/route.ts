import { connection } from "next/server";
import type { Features } from "@/lib/modes";
import { brightDataConfigured } from "@/lib/brightdata";
import { elevenKey } from "@/lib/elevenlabs";
import { dbConfigured } from "@/lib/db";

// Tells the client which optional integrations are configured, without exposing any keys.
export async function GET() {
  await connection(); // read env at request time, not at build time
  const eleven = Boolean(elevenKey());
  const body: Features = {
    elevenlabs: eleven,
    transcribe: eleven,
    lookup: brightDataConfigured() && Boolean(process.env.ANTHROPIC_API_KEY),
    history: dbConfigured(),
  };
  return Response.json(body, { headers: { "Cache-Control": "no-store" } });
}
