# Hat camera readiness check (Sat 14 Nov, for Sun 15 Nov)

Report only: no tracked files were changed. Scratch scripts are in `/private/tmp/claude-501/-Users-markguggenheim/85afe078-6cc3-439f-a5ac-da25c6b924f4/scratchpad/hatcheck/` (`e2e.mjs`, `timing.mjs`, `cleanup.mjs`, and the logs).

## Verdict

**Ready to go, with one runbook gap to close.** I found no code bug that would stop the hat working tomorrow:

- The firmware compiles cleanly with the FQBN that flash.sh uses.
- The server pipeline passed every end-to-end check with the simulator, and each status code behaved as designed.
- The phone's parsing matches the server's event payloads on every field that matters.

**The gap:** MORNING.md never says how to start the phone app. Expo Go loads its bundle from Metro on the Mac, and Metro's address changes once the Mac joins the hotspot, so the phone won't load the app until Metro is restarted. That's HIGH for the runbook (it isn't a code bug).

**What can't be checked without the board:**
- whether an LED is really on IO2;
- whether the camera is an OV3660 or an OV2640 (the vendor lists both);
- image orientation;
- whether q10 SVGA JPEGs fit the camera's frame buffer.

The checklist below includes a 30-second check for each one.

## What was run

| Check | Result |
| --- | --- |
| `arduino-cli compile` (1.6.0, esp32 core 3.3.12, FQBN `esp32:esp32:esp32s3:PSRAM=opi,FlashSize=8M,PartitionScheme=default_8MB,CDCOnBoot=cdc,USBMode=hwcdc,UploadMode=default,UploadSpeed=921600`, `--warnings all`) | **OK.** No warnings. 1,185,739 B (35%) flash, 62 KB (19%) globals. Took 46 s cold. Every FQBN option exists in this core, and they match NULLLAB's recommended IDE settings exactly. |
| Pins vs github.com/nulllaborg/esp32s3-cam | Preset 0 matches: SDA 4, SCL 5, XCLK 15, D0–D7 11/9/8/10/12/18/17/16, VSYNC 6, HREF 7, PCLK 13, no PWDN/RESET, flash LED GPIO3, 8 MB OPI PSRAM, 8 MB flash, native USB (GPIO19/20). Preset 0 is tried first. The vendor README lists **"OV3660/OV2640"** and names **no status-LED pin**. |
| `npm run sim -- --help` | OK |
| `npm run device:code -- hatcheck-01` | OK |
| `npm run demo:info` | Runs. It printed the Mac IP, server up (all features on), the pair code, and `DEVICE_KEY matches .env.local`, with no secrets. It correctly flags that the Mac is on eduroam now and that `WIFI_SSID`/`WIFI_PASSWORD` in `secrets.h` are still placeholders. |
| `secrets.h` structure (values not printed) | Placeholders: `WIFI_SSID` and `WIFI_PASSWORD`. Set: `SERVER_URL ""`, `SERVER_HOST` (equal to this Mac's LocalHostName), `DEVICE_ID hat-01`, and `DEVICE_KEY`, which matches `.env.local`. flash.sh will prompt for the Wi-Fi values. |
| Bad `x-device-key` | 401 |
| `/next` with wrong pair code | 403 |
| `/next` without `x-sightline-device` | 400 |
| Command before any frame | `{"accepted":false,"reason":"no-frame"}` |
| Second phone polls | **409** `{"reason":"paired-elsewhere"}`. Its command gets `{"accepted":false,"reason":"unpaired"}`. |
| Auto-read (4 demo photos) | Each target gave `detected`, then `answer`, then an `answer` with `update:"lookup"` where something was identified (medicine, menu). The room and the Spanish sign gave no lookup (`itemKind: none`), which is correct. |
| `"read this menu"` | Accepted (85 ms). `answer` with `command:{type:"menu"}` and `commandId`, then a lookup update with the same `commandId`. |
| `"search for this"` | Accepted. `command:{type:"lookup"}` gave an answer and then a lookup update. |
| Button (`x-device-button: 1`) | `reading:true` on the first frame, then answer and lookup. |
| Unpair | `{"unpaired":true}`; doing it again gives `false`. Phone B can then pair (200). |
| Hat silent for more than 15 s | Command gets `no-frame`. |
| Cleanup | Deleted every `device_events`, `device_state` and `device_pairs` row for `hatcheck-01`/`hatcheck-02`, and every `scans` row for `hatcheck-phone-a`/`-b`/`hat-hatcheck-0x`. 0 remain. I left content-keyed `analysis_cache`/`lookup_cache` rows alone, because they carry no device id. |

### Timing

I ran 800 px JPEGs of 63 to 80 KB (board-like), each one unique so no cache hit.

| Step | Time |
| --- | --- |
| Frame POST round trip | 1.3–2.0 s (one 3.6 s outlier). The board's real cadence is about one frame every 1.5–2 s. |
| First frame of the menu → `detected` | 1.9 s |
| First frame → auto-read `answer` | **6.2 s** (about 3 s after the `"reading":true` frame) |
| Voice command accepted → `answer` | **3.0 s** |
| Voice command accepted → lookup | **9.1 s** |
| Command while frames flow | The auto-read stayed quiet, as designed. |

Add up to 0.7 s for the phone's poll, plus TTS start. Real hotspot uploads will add a few hundred ms per frame. The first E2E run used the original demo photos and hit the analysis cache, so its 0.3–0.6 s answers aren't realistic.

## Issues

### HIGH

**H1. MORNING.md has no step for the phone app or Metro.** `hardware/MORNING.md:44-46`
Step 7 assumes the app is already open. In practice:
- `mobile/.env` sets `EXPO_PUBLIC_API_URL=http://100.64.19.59:3000` (the eduroam IP).
- Expo Go loads the JS bundle from Metro at the Mac's current IP.

After the Mac joins the hotspot (172.20.10.x), the saved Expo Go entry and QR point at the old IP, so the app won't load. **Fix:** add a step after step 5:
- `cd mobile && npx expo start --lan --clear`, then scan the new QR with the iPhone Camera app.
- Allow **Local Network** for Expo Go if iOS asks.
- Optionally set `EXPO_PUBLIC_API_URL` in `mobile/.env` to the hotspot URL first, so that "Use default" is right too. The Settings > Server override in step 7 also works without it.

### MED

**M1. The status LED pin is unverified, and the runbook relies on it.**
- `hardware/xiao-cam/xiao-cam.ino:96` (`led = 2, active high`)
- `hardware/MORNING.md:27, 33, 51, 53`

NULLLAB's README lists only a power LED and the GPIO3 flash LED. If there's no IO2 LED, the "blinks twice / once per frame / 3 times" checks will look like failures when nothing is wrong. On a power bank (step 9) the LED is the only sign of life. **Fix (doc):** say "if no LED blinks, check the server terminal and the preview instead". Every frame shows up as a POST in the `npm run dev` output, and reads print `[hat] hat-01 read …`. If the LED is lit all the time and goes dark on each blink, the polarity is inverted. That's cosmetic, so leave it.

**M2. The camera may be an OV2640, not an OV3660.**
- `hardware/xiao-cam/xiao-cam.ino:191-200`
- `hardware/MORNING.md:22`

The vendor lists both sensors. With an OV2640, `tuneSensor` leaves `vflip=0`, but Espressif's CameraWebServer sets `vflip=1` for every sensor on `CAMERA_MODEL_ESP32S3_EYE`. So an OV2640 unit will probably show upside down. **Fix (doc):** step 3 should accept `sensor OV2640` too. If the preview is upside down, set `FLIP_IMAGE 1` (that's already in the table). Optional code fix: set `vflip = 1` for preset 0 regardless of sensor.

**M3. The JPEG may not fit the frame buffer.**
- `hardware/xiao-cam/xiao-cam.ino:63` (`JPEG_QUALITY 10`)
- `hardware/xiao-cam/xiao-cam.ino:170-173`

As far as I know, esp32-camera sizes the JPEG buffer at width×height/5, about 96 KB at SVGA. The README itself estimates q10 at 40–90 KB, and a dense menu can go over that. The symptom is `cam_hal: FB-OVF`/`NO-EOI` lines or `Frame grab failed` in the log. **Fix:** add `#define JPEG_QUALITY 12` to `secrets.h` and reflash. `secrets.h.example:20-24` doesn't list this option, so add it there.

**M4. One Neon error silences the hat for 60 s.**
- `lib/db.ts:99` and `lib/db.ts:142` (`BACKOFF_MS = 60_000`)
- `app/api/device/next/route.ts:31`
- `app/api/device/frame/route.ts:59-65`

After any thrown DB error, every DB call returns `undefined` for a minute:
- `/next` returns 503, which the phone shows as "missing" and then polls only every 5 s.
- `updateHatState` gives no streak, so there are no auto-reads.
- `claimHatRead` returns false, so even **BOOT does nothing**.

On a cellular uplink, one blip costs a minute of dead air in the demo. **Fix (post-demo, or tonight if cheap):** use a 5 s backoff for the hat paths, or none for `claimPairing`/`addDeviceEvent`/`claimHatRead`/`updateHatState`. **Tomorrow:** if the hat goes silent and the server log shows `Neon … failed`, wait 60 s.

**M5. Wi-Fi join depends on a scan.** `hardware/xiao-cam/xiao-cam.ino:247` and `:459-460`
`WiFiMulti.run()` scans first and only joins SSIDs it sees. An iPhone hotspot isn't always visible, mainly when the Personal Hotspot screen is closed and no clients are connected. MORNING step 4 covers the first join. A later reconnect, after a drop with the screen closed, may not happen until someone opens that screen. **Fix (doc):** if the hat drops off later, open Settings > Personal Hotspot on the iPhone for a moment. Optional code fix: when there's only one SSID, use `WiFi.begin(WIFI_SSID, WIFI_PASSWORD)`, which doesn't need the scan.

### LOW

**L1. The fallback section is wrong about the hat ID default.**
- `hardware/MORNING.md:83` says "The default hat ID is `hat-01`".
- `scripts/demo-info.mjs:103` tells you to run `npm run sim` with no `--hat`.

`sim-board.mjs:57-62` has no default and exits with code 2 if `--hat` is missing. The two commands at `MORNING.md:79-80` already pass `--hat hat-01`, so they work. **Fix:** correct the sentence and add `-- --hat hat-01` to the demo-info hint.

**L2. Reflashing while the monitor is open fails with "port busy".** `hardware/MORNING.md:24` and `hardware/flash.sh:130`
Step 3 says to leave the monitor running. The FLIP/MIRROR fix in the table needs a reflash. **Fix (doc):** Ctrl-C the monitor terminal before running `./hardware/flash.sh` again.

**L3. The first compile is slow, and compile errors get cut off.**
- `hardware/MORNING.md:20` says "about 15 s".
- `hardware/flash.sh:98` uses `tail -4`.

A cold build took 46 s. `tail -4` can hide the actual error line on a failed build. **Fix:** run `./hardware/flash.sh --compile-only` tonight. It also prompts for the hotspot name and password, so that step is done before 6 AM. Show 20 lines on failure.

**L4. flash.sh carries on with placeholder Wi-Fi when run non-interactively.** `hardware/flash.sh:58` and `:89-91`
It prints a warning and then flashes firmware that can never join. That's fine for tomorrow, because it will be run in a terminal. **Fix:** `fail` instead of warn when stdin isn't a TTY.

**L5. Keep-alive reuse can stick to an old host.** `hardware/xiao-cam/xiao-cam.ino:276-279` and `:371`
HTTPClient reuses a socket that's still connected without checking the host (`HTTPClient.cpp:1154-1161`). If a wrong server answers 404/502 three times with keep-alive, the rediscovery probes go to that same host. This is rare, and connection errors already close the socket. **Fix:** `plain.stop()` before `findServer()`.

**L6. The phone shows "not set up" when the database is down.** `mobile/src/logic/hatStatus.ts:9`
503 maps to `"missing"`, but `/next` also returns 503 when the DB is unreachable (see M4). **Fix:** use the 503 body's `error` text to tell the two apart.

**L7. A status reply leaves the pending command open forever.** `mobile/src/logic/hatCommands.ts:112-118`
After a `status` event (for example "No picture from your hat camera"), the command stays in `phase:"status"` until the next send, and the 500 ms tick interval keeps running. It's harmless. **Fix:** clear `current` on status.

**L8. Small contract gaps.** None of these breaks anything:
- The phone reads `payload.details` (`mobile/src/api.ts:364`), `payload.image` (`:372`) and `detected.confidence` (`mobile/App.tsx:728`), but the server never sends them (`app/api/device/frame/route.ts:69-73, 114-125`; `command/route.ts:148-161`). Hat answers therefore have empty "details" and no photo.
- A "search for this" whose lookup is skipped posts a lookup with empty `spokenText` (`command/route.ts:187`), which `parseLookup` drops. The user hears the answer but nothing about the web search.

**L9. An auto-read and a command can say the same thing twice.**
In the E2E run, an auto-read answer landed 0.2 s before the "read this menu" command's answer for the same menu. The phone would start the menu, cut itself off and say it again. `commandActive` only suppresses auto-reads that *finish* after the command. That's acceptable for the demo; mention it if someone asks.

### Checked and fine

- Discovery order: override, then saved, then mDNS, then subnet scan.
- The scan range is right for the hotspot. The /28 mask gives .1–.14, and it skips itself and the gateway (.1, the iPhone).
- `/api/features` validation: it looks for `"hat"` and warns on `"hat":false`. That matches the live JSON.
- Headers and content type: `image/jpeg`. Timeouts: connect 4 s, read 20 s, probe 8 s; the server frame check caps at 6 s.
- Error handling: 401 and 503 are logged with fixes. Rediscovery happens after 3 connection errors or 404/502. 409/403 never come from `/frame`.
- The BOOT ISR: GPIO0, FALLING, 250 ms debounce, and `millis()` is ISR-safe.
- `fb` is returned on every path, including before reading the reply, and `http.end()` is always called.
- `HTTPClient::begin` clears headers, so there are no duplicates.
- The PSRAM path uses 2 frame buffers in PSRAM with GRAB_LATEST, and there's a VGA/DRAM fallback.
- The OV3660 tuning matches Espressif's example.
- Port detection: `/dev/cu.usbmodem*` first. Boot-mode instructions: hold BOOT, tap RESET, release, then RESET after upload.
- Mac firewall: currently **off**. The dev server listens on `*:3000`.

## 6 AM checklist (improved)

**Tonight:**
1. Run `./hardware/flash.sh --compile-only` and enter the hotspot name and password when asked. This warms the 46 s build and fills `secrets.h`.
2. Charge the iPhone and the power bank.
3. Pack a USB-C to USB-C **data** cable.

**6 AM:**
1. Mac: plug in the charger and keep the lid **open**, because closing it sleeps the Mac even with caffeinate. Run `caffeinate -dims &`. The firewall is off; if it's turned on, allow `node`.
2. iPhone: turn on Personal Hotspot with **Maximize Compatibility** on, and keep that screen open. Join the Mac to it. Check cellular signal at the venue.
3. Board: seat the ribbon, plug it in, and check `ls /dev/cu.usbmodem*`. Run `./hardware/flash.sh`.
   - Expect `preset 0 works`, then `sensor OV3660` or `sensor OV2640` (both are fine).
   - Then `Connected … 172.20.10.x`, then `+ http://172.20.10.x:3000 is SightLine`, then `… -> 200`.
   - If the log shows `FB-OVF` or `Frame grab failed`, add `#define JPEG_QUALITY 12` to `secrets.h`. Always Ctrl-C the monitor before reflashing.
4. Server: if `npm run dev -- -H 0.0.0.0` isn't already running, start it. Run `npm run demo:info` and check it says `on the iPhone hotspot`, `Server: up`, and `DEVICE_KEY matches`.
5. **Phone app:** run `cd mobile && npx expo start --lan --clear` and scan the new QR. Allow Local Network. In Settings > Server, enter the demo:info URL and look for the check mark. In Hat camera, enter `hat-01` and the pair code, then connect.
6. Test:
   - Open `http://<board IP>/` and check the orientation. Fix it with FLIP/MIRROR in `secrets.h` and reflash.
   - Hold the menu 30–50 cm away for about 3 s. Expect speech roughly 6–7 s after you start holding it, or 3–4 s after a voice command.
   - Press BOOT once.
   - **If no LED blinks, use the server terminal (`[hat] hat-01 read …`) as the signal instead.**
7. Once both clients have joined, leave the Personal Hotspot screen and keep SightLine in the foreground; it keeps the screen awake. If the hat drops off later, open Personal Hotspot for a moment so it can rejoin.
8. If the hat goes silent and the server shows `Neon … failed`, wait 60 s. If the board dies, run `npm run sim -- --hat hat-01 --webcam`.
