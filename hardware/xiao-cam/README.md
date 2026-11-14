# SightLine hat camera (XIAO ESP32S3 Sense)

A Seeed XIAO ESP32S3 Sense on a cap sends a photo to SightLine about every 1.5 seconds. When the server sees something it can read, it reads it and looks it up on the web. The paired phone then speaks the answer. Background, parts and mounting are in [docs/HARDWARE.md](../../docs/HARDWARE.md).

## What you need

- A XIAO ESP32S3 **Sense** (the version with the camera board), with its U.FL antenna attached. Without the antenna, Wi-Fi is weak.
- A USB-C cable and a power bank.
- A phone hotspot. On iPhone, go to Settings > Personal Hotspot and turn on **Maximize Compatibility**, which gives 2.4 GHz and WPA2. Use a plain ASCII phone name, because it becomes the SSID.

## Flash it

1. In **Arduino IDE 2**, open Boards Manager and install **esp32 by Espressif Systems**.
2. Open `hardware/xiao-cam/xiao-cam.ino`.
3. Copy `secrets.h.example` to `secrets.h` (it's git-ignored) and fill it in:
   - `WIFI_SSID` and `WIFI_PASSWORD`: the hotspot.
   - `SERVER_URL`: `https://<your app>.vercel.app/api/device/frame`, or `http://<laptop IP>:3000/api/device/frame` when testing on the same hotspot. The sketch picks TLS (`WiFiClientSecure` with `setInsecure()`) for `https://` URLs and a plain connection for `http://`.
   - `DEVICE_ID`: a name for this hat, such as `hat-01`.
   - `DEVICE_KEY`: the server's `DEVICE_SHARED_KEY`.
4. Under **Tools**, set:
   - **Board**: `XIAO_ESP32S3`
   - **PSRAM**: `OPI PSRAM`. Without it you get "camera init failed".
5. Plug the board in, pick its port and click **Upload**. If the upload won't start, hold **BOOT**, tap **RESET**, release BOOT, then upload again.
6. Open **Serial Monitor** at **115200** baud. You should see `Connected, IP …`, and then one line per frame, such as `48211 bytes -> 200 in 1830ms: {"ready":true,…}`.

## Pair the phone

Get the hat's pair code on the laptop:

```bash
npm run device:code -- hat-01
```

Enter the hat name and the 8-character code in the phone app (Settings > Hat camera). The phone polls `GET /api/device/next?device=hat-01&pair=<code>&after=<last id>` with its `x-sightline-device` header. The first successful poll pairs the hat with that phone, so the hat's scans show up in that phone's history and in "Ask your history".

## Using it

- Look at a label, menu or sign for about 2 seconds. Two clear frames in a row trigger a read. The LED blinks 3 times when a read starts, and once for every frame that was sent.
- Press **BOOT** to read whatever is in view right now.
- The same target isn't read again for 2 minutes, unless you press BOOT.
- If the image is upside down, set `#define FLIP_IMAGE 1` in `secrets.h`.

## Test the server without the board

```bash
curl -s --data-binary @public/demo/menu.jpg -H 'content-type: image/jpeg' \
  -H 'x-device-id: hat-01' -H "x-device-key: $DEVICE_SHARED_KEY" \
  http://localhost:3000/api/device/frame
```

Send it twice to trigger a read. Add `-H 'x-device-button: 1'` to force one.

## Status

The sketch has **not been compiled or flashed** yet, because no board or ESP32 toolchain was available when it was written. The camera pins match `CAMERA_MODEL_XIAO_ESP32S3` in Espressif's `camera_pins.h`. The LED pin (GPIO21, active low) and the BOOT button (GPIO0) follow Seeed's XIAO ESP32S3 pinout. The server side was tested with curl.
