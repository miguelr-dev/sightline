#!/usr/bin/env node
// Pretend to be the hat camera: POST JPEGs to /api/device/frame exactly like the firmware does
// (same headers, raw JPEG body, one frame about every 1.5 s, x-device-button on demand).
// Use it to test the pipeline without the board, or as the demo fallback if the board fails.
//
//   npm run sim                                  # cycle through public/demo/*.jpg
//   npm run sim -- --image public/demo/menu.jpg  # one picture, over and over
//   npm run sim -- --webcam                      # the Mac's camera (needs ffmpeg)
//   npm run sim -- --button                      # press "BOOT" on the first frame (read now)
//   npm run sim -- --watch                       # also poll /api/device/next and print answers
//
// Options: --url http://localhost:3000  --device hat-01  --interval 1500  --frames N
//          --hold N (frames per still image, default 4)  --camera 0 (avfoundation index)
// While it runs, press Enter to send the next frame with x-device-button: 1.
// DEVICE_SHARED_KEY comes from .env.local (the npm script loads it). It is never printed.
//
// --watch polls as a pretend phone ("sim-watcher"). If no phone holds the hat it pairs with it, and
// keeps it for 60 s after the sim stops, so the iPhone gets 409 until then. If the iPhone already
// holds it, --watch gets 409. Leave --watch off when the iPhone app is listening, or test with
// another hat ID (--device sim-01).

import { createHmac } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : fallback;
};

const base = opt("url", process.env.SIM_URL || "http://localhost:3000").replace(/\/+$/, "").replace(/\/api\/device\/frame$/, "");
const device = opt("device", "hat-01");
const interval = Number(opt("interval", "1500"));
const maxFrames = Number(opt("frames", "0")) || Infinity;
const hold = Math.max(1, Number(opt("hold", "4")));
const key = process.env.DEVICE_SHARED_KEY;
if (!key) {
  console.error("DEVICE_SHARED_KEY is not set. Run through npm (npm run sim) so .env.local is loaded.");
  process.exit(1);
}

// ---- Frame sources ----
function stillSource() {
  const one = opt("image");
  let files;
  if (one) files = [resolve(one)];
  else {
    const dir = resolve(opt("dir", "public/demo"));
    files = readdirSync(dir).filter((f) => /\.jpe?g$/i.test(f)).sort().map((f) => join(dir, f));
  }
  if (!files.length || !files.every(existsSync)) {
    console.error("No JPEGs found. Pass --image <file.jpg> or --dir <folder>.");
    process.exit(1);
  }
  const images = files.map((f) => ({ name: f.split("/").pop(), bytes: readFileSync(f) }));
  let n = 0;
  // Hold each image for a few frames, like a person looking at something for a few seconds.
  return () => images[Math.floor(n++ / hold) % images.length];
}

function webcamSource() {
  const dir = mkdtempSync(join(tmpdir(), "sightline-sim-"));
  const out = join(dir, "frame.jpg");
  const cam = opt("camera", "0");
  // One long-running ffmpeg keeps overwriting frame.jpg about twice a second.
  const ff = spawn(
    "ffmpeg",
    ["-loglevel", "error", "-f", "avfoundation", "-framerate", "30", "-pixel_format", "nv12", "-i", `${cam}:none`,
     "-vf", "fps=2,scale='min(1280,iw)':-2", "-q:v", "4", "-update", "1", "-y", out],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  ff.on("error", () => {
    console.error("ffmpeg not found. Install it with: brew install ffmpeg");
    process.exit(1);
  });
  ff.on("exit", (code) => {
    if (code) {
      console.error(`ffmpeg exited (${code}). Give your terminal Camera access (System Settings > Privacy & Security > Camera), or try --camera 1. List cameras: ffmpeg -f avfoundation -list_devices true -i ""`);
      process.exit(1);
    }
  });
  process.on("exit", () => ff.kill());
  return () => {
    if (!existsSync(out) || statSync(out).size < 1000) return null;
    const bytes = readFileSync(out);
    // Skip a file caught half-written: it must start FFD8 and end FFD9.
    const ok = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9;
    return ok ? { name: "webcam", bytes } : null;
  };
}

const nextFrame = flag("webcam") ? webcamSource() : stillSource();

// ---- Send frames like the firmware ----
let pressNext = flag("button");
let stop = false;
if (process.stdin.isTTY) {
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", () => {
    pressNext = true;
    console.log("  (button press queued for the next frame)");
  });
}
process.on("SIGINT", () => {
  stop = true;
  process.exit(0);
});

async function sendFrame(frame, button) {
  const t = Date.now();
  const headers = {
    "Content-Type": "image/jpeg",
    "x-device-id": device,
    "x-device-key": key,
  };
  if (button) headers["x-device-button"] = "1";
  try {
    const res = await fetch(`${base}/api/device/frame`, {
      method: "POST",
      headers,
      body: frame.bytes,
      signal: AbortSignal.timeout(15000),
    });
    const text = await res.text();
    console.log(`${button ? "[button] " : ""}${frame.name} ${frame.bytes.length} bytes -> ${res.status} in ${Date.now() - t}ms: ${text.slice(0, 160)}`);
    if (res.status === 401) console.log("  401: DEVICE_SHARED_KEY doesn't match the server's.");
    return res.status;
  } catch (err) {
    console.log(`${frame.name} -> network error after ${Date.now() - t}ms: ${err.cause?.code ?? err.message}`);
    return 0;
  }
}

// ---- Optional: watch the events the phone would get ----
function pairCode(hat) {
  const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // same as lib/hat.ts
  const mac = createHmac("sha256", key).update(`sightline-pair:${hat}`).digest();
  let code = "";
  for (let i = 0; i < 8; i++) code += ALPHABET[mac[i] % ALPHABET.length];
  return code;
}

async function watch() {
  const pair = pairCode(device);
  let after = null;
  let first = true;
  while (!stop) {
    try {
      const q = new URLSearchParams({ device, pair, ...(after != null ? { after: String(after) } : {}) });
      const res = await fetch(`${base}/api/device/next?${q}`, {
        headers: { "x-sightline-device": "sim-watcher" },
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409) {
        console.log("  [next] 409: another phone holds this hat; --watch stops. (Fine: the phone gets the events.)");
        return;
      }
      if (!res.ok) console.log(`  [next] ${res.status}: ${JSON.stringify(body)}`);
      else {
        // Skip the backlog from earlier runs on the first poll.
        if (!first) {
          for (const e of body.events ?? []) {
            const p = e.payload ?? e.data ?? e;
            const text = p.spokenText ?? p.hint ?? p.label ?? (p.lookup ? `lookup: ${JSON.stringify(p.lookup).slice(0, 140)}` : "");
            console.log(`  [event ${e.id}] ${e.kind ?? e.type ?? "?"}: ${String(text).slice(0, 200)}`);
          }
        }
        first = false;
        if (body.last != null) after = body.last;
      }
    } catch (err) {
      console.log(`  [next] error: ${err.cause?.code ?? err.message}`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
}

console.log(`Simulated hat "${device}" -> ${base}/api/device/frame every ${interval} ms${flag("webcam") ? " (webcam)" : ""}. Enter = read now. Ctrl-C stops.`);
if (flag("watch")) watch();

let sent = 0;
let lastShot = 0;
while (!stop && sent < maxFrames) {
  const wait = lastShot + interval - Date.now();
  if (wait > 0 && !pressNext) {
    await new Promise((r) => setTimeout(r, Math.min(wait, 50)));
    continue;
  }
  lastShot = Date.now();
  const frame = nextFrame();
  if (!frame) continue; // webcam not ready yet
  const button = pressNext;
  pressNext = false;
  await sendFrame(frame, button);
  sent++;
}
if (flag("watch") && Number.isFinite(maxFrames)) {
  // Give the read and lookup time to land before exiting.
  await new Promise((r) => setTimeout(r, Number(opt("linger", "25000"))));
}
process.exit(0);
