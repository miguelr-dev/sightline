import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// Server-only: authentication and pairing for the hat camera (see docs/HARDWARE.md).
//
// - The board proves itself with x-device-key, compared in constant time to DEVICE_SHARED_KEY.
// - A phone pairs with a hat by entering the hat's pair code: 8 characters derived from
//   DEVICE_SHARED_KEY and the hat's ID (HMAC-SHA256), so the server keeps no code list.
//   Get a hat's code with: npm run device:code -- <hat-id>

const HAT_ID = /^[A-Za-z0-9-]{3,40}$/;
const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0/o, 1/l/i

export function sharedKey(): string | undefined {
  return process.env.DEVICE_SHARED_KEY || undefined;
}

export function validHatId(v: unknown): v is string {
  return typeof v === "string" && HAT_ID.test(v);
}

/** Constant-time string comparison (hashing first makes the lengths equal). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkDeviceKey(given: string | null): boolean {
  const key = sharedKey();
  return Boolean(key && given && safeEqual(given, key));
}

export function pairCode(hatId: string, key: string): string {
  const mac = createHmac("sha256", key).update(`sightline-pair:${hatId}`).digest();
  let code = "";
  for (let i = 0; i < 8; i++) code += CODE_ALPHABET[mac[i] % CODE_ALPHABET.length];
  return code;
}

export function checkPairCode(hatId: string, given: string | null): boolean {
  const key = sharedKey();
  if (!key || !given) return false;
  const normalized = given.toLowerCase().replace(/[^a-z0-9]/g, "");
  return safeEqual(normalized, pairCode(hatId, key));
}

// The frame check names the same target differently from frame to frame, even for the
// same photo: "precaucion-calle-mayor-sign", "calle-mayor-precaucion-sign",
// "precaucion-sidewalk-work-sign"; "demo-prin-medicine-label", "demo-prin-medicine-package".
// For counting frames in a row and for not reading a target twice, keys are compared as sets
// of distinctive words (no type words, nothing shorter than 3 letters), and two keys are the
// same target when they share a word. lib/db.ts does the same comparison in SQL with &&.
const SKIP_WORDS = new Set(["menu", "package", "label", "sign", "page", "slide", "scene", "box"]);
const FILLER = new Set(["the", "and", "for", "with"]);

/** Words that say what kind of product something is, not which one: two keys that share only
 *  these ("monster-energy-drink", "red-bull-energy-drink") are different products. */
export const GENERIC_WORDS = new Set([
  "cookie", "cookies", "energy", "drink", "drinks", "cola", "soda", "chips", "chip", "bar", "bars",
  "tablets", "tablet", "caplets", "capsules", "softgels", "pain", "reliever", "relief", "crackers",
  "cracker", "snack", "snacks", "candy", "juice", "water", "sparkling", "original", "classic",
  "flavor", "flavored", "extra", "strength", "diet", "zero", "sugar", "free", "cereal", "medicine",
  "sandwich", "tea", "coffee",
]);

/** A key's distinctive words, sorted and hyphenated: "calle-mayor-precaucion". */
export function matchKey(key: string): string {
  const words = [...new Set(key.toLowerCase().split("-"))].filter(
    (w) => w.length >= 3 && !FILLER.has(w),
  );
  const named = words.filter((w) => !SKIP_WORDS.has(w) && !GENERIC_WORDS.has(w));
  return (named.length ? named : words.length ? words : [key.toLowerCase()]).sort().join("-");
}

/** True when two match keys name the same target (they share a word). */
export function sameTarget(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const B = new Set(b.split("-"));
  return a.split("-").some((w) => B.has(w));
}
