// Prints what you need on demo morning: the Mac's IP on the iPhone hotspot, the URL for the
// iPhone app's Settings > Server, the hat's pair code, and the secrets.h values to check.
// Usage: npm run demo:info [-- hat-01]
// Never prints DEVICE_SHARED_KEY.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT || 3000);
const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;

// ---- secrets.h (the board's settings) ----
const secretsPath = join(root, "hardware/xiao-cam/secrets.h");
const secrets = existsSync(secretsPath) ? readFileSync(secretsPath, "utf8") : "";
const define = (name) => (secrets.match(new RegExp(`^#define ${name} "(.*)"$`, "m")) || [])[1];
const hat = process.argv[2] || define("DEVICE_ID") || "hat-01";

// ---- Addresses ----
const addrs = [];
for (const [name, list] of Object.entries(networkInterfaces())) {
  for (const a of list ?? []) {
    if (a.family === "IPv4" && !a.internal) addrs.push({ name, ip: a.address });
  }
}
// An iPhone Personal Hotspot hands out 172.20.10.2-14.
const hotspot = addrs.find((a) => a.ip.startsWith("172.20.10."));
const best = hotspot ?? addrs.find((a) => a.name === "en0") ?? addrs[0];
let host = "";
try {
  host = execFileSync("scutil", ["--get", "LocalHostName"], { encoding: "utf8" }).trim();
} catch {}
let ssid = "";
try {
  // Works on macOS 14+ without location permission only sometimes; best effort.
  const out = execFileSync("ipconfig", ["getsummary", best?.name || "en0"], { encoding: "utf8" });
  ssid = (out.match(/^\s*SSID : (.*)$/m) || [])[1] ?? "";
} catch {}

console.log(bold("\nSightLine demo info\n"));
if (!best) console.log(red("No network address. Join the iPhone hotspot first."));
else {
  console.log(`Mac IP:           ${bold(best.ip)} (${best.name})${hotspot ? green("  on the iPhone hotspot") : red("  NOT a hotspot address (172.20.10.x). Is the Mac on the hotspot?")}`);
  if (ssid) console.log(`Wi-Fi network:    ${ssid}`);
  for (const a of addrs) if (a !== best) console.log(`  also:           ${a.ip} (${a.name})`);
}
const url = best ? `http://${best.ip}:${PORT}` : `http://<mac-ip>:${PORT}`;
console.log(`\niPhone app > Settings > Server:\n  ${bold(url)}`);
if (host) console.log(`  (or http://${host}.local:${PORT} if Bonjour works on the hotspot)`);

// ---- Is the dev server up and reachable from the LAN? ----
async function check(base) {
  try {
    const res = await fetch(`${base}/api/features`, { signal: AbortSignal.timeout(15000) });
    return res.ok ? await res.json() : { status: res.status };
  } catch (err) {
    return { error: err.cause?.code ?? err.message };
  }
}
const lan = best ? await check(url) : { error: "no address" };
if (lan.error || lan.status) {
  const local = await check(`http://localhost:${PORT}`);
  console.log(red(`\nServer: not reachable at ${url} (${lan.error ?? lan.status}).`));
  console.log(local.error ? red("  Not running locally either. Start it: npm run dev -- -H 0.0.0.0") : red("  Running on localhost only. Restart it with: npm run dev -- -H 0.0.0.0"));
} else {
  const off = Object.entries(lan).filter(([, v]) => v === false).map(([k]) => k);
  console.log(green(`\nServer: up at ${url}`) + (off.length ? `  (off: ${off.join(", ")})` : "  (all features on)"));
  if (lan.hat === false) console.log(red("  Hat camera is OFF: needs DEVICE_SHARED_KEY and DATABASE_URL in .env.local"));
}

// ---- Pair code (same derivation as scripts/device-code.mjs) ----
console.log("");
try {
  const out = execFileSync(process.execPath, [join(root, "scripts/device-code.mjs"), hat], {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const code = (out.match(/: (\S+)\s*$/) || [])[1];
  console.log(`iPhone app > Settings > Hat camera:\n  hat ${bold(hat)}  pair code ${bold(code ?? out.trim())}`);
} catch (err) {
  console.log(red(`Pair code: ${String(err.stderr || err.message).trim()}`));
}

// ---- secrets.h reminder ----
console.log(`\nBoard settings (hardware/xiao-cam/secrets.h):`);
if (!secrets) console.log(red("  secrets.h missing. ./hardware/flash.sh creates it."));
else {
  const key = process.env.DEVICE_SHARED_KEY;
  const ssidSet = define("WIFI_SSID");
  const keyOk = key && define("DEVICE_KEY") === key;
  console.log(`  WIFI_SSID    "${ssidSet}"${ssidSet === "your-phone-hotspot" ? red("  <- still the placeholder") : ""}${ssid && ssidSet !== ssid ? red(`  <- the Mac is on "${ssid}"`) : ""}`);
  console.log(`  WIFI_PASSWORD ${define("WIFI_PASSWORD") && define("WIFI_PASSWORD") !== "hotspot-password" ? "(set)" : red("(placeholder)")}`);
  console.log(`  SERVER_URL   "${define("SERVER_URL") ?? ""}"${define("SERVER_URL") ? "" : "  (auto: finds the Mac by itself)"}`);
  console.log(`  SERVER_HOST  "${define("SERVER_HOST") ?? ""}"${host && define("SERVER_HOST") !== host ? red(`  <- this Mac is "${host}"`) : ""}`);
  console.log(`  DEVICE_ID    "${define("DEVICE_ID")}"`);
  console.log(`  DEVICE_KEY   ${keyOk ? green("matches .env.local") : red("does NOT match DEVICE_SHARED_KEY in .env.local (run ./hardware/flash.sh to fix)")}`);
}
console.log(`\nNo board? Same pipeline from the Mac: ${bold("npm run sim")} (demo photos) or ${bold("npm run sim -- --webcam")}\n`);
