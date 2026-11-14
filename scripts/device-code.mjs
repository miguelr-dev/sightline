// Prints the pair code for a hat camera. The phone enters it once to pair with the hat.
// Usage: npm run device:code -- hat-01
import { createHmac } from "node:crypto";

const hat = process.argv[2];
const key = process.env.DEVICE_SHARED_KEY;
if (!hat || !/^[A-Za-z0-9-]{3,40}$/.test(hat)) {
  console.error("Usage: npm run device:code -- <hat id, e.g. hat-01>");
  process.exit(1);
}
if (!key) {
  console.error("DEVICE_SHARED_KEY is not set (put it in .env.local).");
  process.exit(1);
}
// Same derivation as pairCode() in lib/hat.ts.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const mac = createHmac("sha256", key).update(`sightline-pair:${hat}`).digest();
let code = "";
for (let i = 0; i < 8; i++) code += ALPHABET[mac[i] % ALPHABET.length];
console.log(`Pair code for ${hat}: ${code}`);
