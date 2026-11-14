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
