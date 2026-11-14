# Hat camera: demo morning (Sun 15 Nov)

The board arrives around 6 AM and the demo is at 12:30. The steps below should take about 10 minutes. Each step says what you should see, so you can tell which one failed.

**You need:** the board, a **USB-C to USB-C data cable** (or a USB-A to C adapter for the cable in the box, because the MacBook Air only has USB-C ports), the iPhone, and the Mac with this repo.

---

1. **Unbox.** Don't solder anything: the headers aren't needed, and power and data both go over USB-C. Check the camera ribbon is pushed all the way into its connector and the latch is closed. Peel the red cap off the lens if there is one.
   - ✅ The camera is seated firmly.

2. **Plug it into the Mac.**
   - ✅ The charge LED may light or flicker (it's fine either way).
   - ✅ `ls /dev/cu.usbmodem*` shows a port.

3. **Flash it.** From the repo, run:
   ```bash
   ./hardware/flash.sh
   ```
   The first time, it asks for the hotspot name, which is the iPhone's name in Settings > General > About > Name, and the hotspot password. It then compiles (about 15 s), uploads (about 20 s) and opens the serial log.
   - ✅ `+ preset 0 works: ESP32-S3-EYE / Freenove / NULLLAB S3-CAM`
   - ✅ `sensor OV3660`
   - ✅ `Joining Wi-Fi "…"` followed by dots. That's fine until the hotspot is on.
   - Leave this terminal open, because it's the board's log.

4. **Turn the hotspot on.** On the iPhone, go to Settings > Personal Hotspot, turn on Allow Others to Join and **Maximize Compatibility**, and keep that screen open. Join the Mac to the hotspot too.
   - ✅ In the board log: `Connected to "…", IP 172.20.10.x`. The LED blinks twice.

5. **Start the server** in a second terminal. If it's already running, leave it, because it listens on every network.
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
   - ✅ In the board log: `+ http://172.20.10.x:3000 is SightLine`, then a line about every 1.5 s like `52311 bytes -> 200 in 1700ms: {"ready":…}`. The LED blinks once per frame.

6. **Get the phone settings** in a third terminal:
   ```bash
   npm run demo:info
   ```
   - ✅ `Mac IP: 172.20.10.x … on the iPhone hotspot`
   - ✅ `Server: up at http://172.20.10.x:3000`
   - ✅ A pair code
   - ✅ `DEVICE_KEY matches .env.local`

7. **Set up the iPhone app** in Settings:
   - Under **Server**, enter the `http://172.20.10.x:3000` URL. It should show a check mark.
   - Under **Hat camera**, enter `hat-01` and the pair code.

8. **Test it.**
   - Open `http://<board IP>/` on the Mac. The board IP is in the log from step 4. You should see the live picture. Make sure text isn't upside down or mirrored; if it is, see the table below.
   - Hold `public/demo/menu.jpg` (printed, or on a screen) 30 to 50 cm from the lens for 3 seconds, or press **BOOT**.
   - ✅ The LED blinks 3 times, the log shows `"reading":true`, and the phone speaks the menu within about 5 s.

9. **Mount it.** Tape the board on top of the brim, tilted about 15° down, and run the cable to a power bank. On a power bank there's no log, but the LED still blinks once per frame.

---

## If something fails

| Symptom (where you see it) | Fix |
| --- | --- |
| **No serial port** (step 2 or 3: `no serial port after 90 s`) | The cable is probably charge-only, so use a different one, and plug straight into the Mac without a hub. Then unplug, **hold BOOT**, plug back in and release BOOT, and run `./hardware/flash.sh` again. |
| **Upload can't connect** (step 3) | The script tells you what to do: hold BOOT, tap RESET, release BOOT, then press Enter. After that upload, tap RESET once to start the firmware. |
| **Camera init failed on every preset** (step 3 log, LED blinks 5 times) | The ribbon is loose. Unplug the board, open the connector latch, push the ribbon fully in with the contacts facing the board, close the latch and plug back in. If it still fails, the camera module is bad: use the fallback below. |
| **No PSRAM!** (step 3 log) | It was built without PSRAM. Only `flash.sh` sets it correctly, so use it rather than Arduino IDE. |
| **Wi-Fi won't join** (dots forever after step 4) | Keep the iPhone's Personal Hotspot screen open, and check Maximize Compatibility is on. Check the name and password in `hardware/xiao-cam/secrets.h`: the name is case-sensitive, and a curly apostrophe like `Sam’s iPhone` won't match `'`, so rename the phone to plain ASCII. Then run `./hardware/flash.sh` again. |
| **No server found** (log, after Wi-Fi joins) | Check the Mac is on the hotspot and not on campus Wi-Fi, and that `npm run dev -- -H 0.0.0.0` is running. Then check `npm run demo:info` says "Server: up". If you're still stuck, put the URL from demo:info into `SERVER_URL` in `secrets.h` and reflash. |
| **401** (log: `-> 401`) | `DEVICE_KEY` doesn't match the server. Run `./hardware/flash.sh`, which copies it from `.env.local`. |
| **503** (log: `-> 503`) | The server is missing `DEVICE_SHARED_KEY` or `DATABASE_URL` in `.env.local`. Restart `npm run dev` after fixing it. |
| **Frames are 200 but no events** (the phone is silent) | (1) In the app, check the hat ID is `hat-01` and the pair code matches `npm run demo:info`. (2) Press **BOOT** to force a read. If the server terminal shows `[hat] hat-01 read …`, the board is fine and the problem is on the phone side. (3) Open the preview at `http://<board IP>/`. A blurry or dark picture never reaches `"ready":true`, so move closer (30 to 50 cm), add light, or set `TORCH 1`. (4) The same target isn't read again for 2 minutes unless you press BOOT. |
| **App says the hat is paired with another phone** | Only one phone can hold a hat. Tap Disconnect on the other phone, or wait 60 s after it stops polling. A `npm run sim -- --watch` on `hat-01` also counts as a phone. |
| **Picture upside down or mirrored** (preview) | Add `#define FLIP_IMAGE 1` (upside down) or `#define MIRROR_IMAGE 1` (text reads backwards) to `secrets.h`, then run `./hardware/flash.sh`. |
| **Want to watch the log on battery** | You can't, but plug it into the Mac and run `./hardware/flash.sh --monitor`. |

## Fallback: no board, or the board dies

Run the same pipeline from the Mac. The phone hears it exactly as if it came from the hat.

```bash
npm run sim -- --webcam   # the Mac's FaceTime camera (allow Camera for Terminal the first time)
npm run sim               # or cycle through the demo photos
```

Press Enter in that terminal to "press BOOT". The default hat ID is `hat-01`, so the phone doesn't need re-pairing. If the iPhone is the Continuity Camera, `--camera 1` picks the built-in camera.
