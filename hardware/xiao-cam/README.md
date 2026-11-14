# SightLine hat camera firmware

An ESP32-S3 camera board on a cap sends a photo to SightLine about every 1.5 seconds. When the server sees something it can read, it reads it and looks it up on the web, and the paired phone speaks the answer. For the demo-morning steps, see [../MORNING.md](../MORNING.md). Background is in [docs/HARDWARE.md](../../docs/HARDWARE.md).

The folder is still called `xiao-cam`, but the sketch runs on any common ESP32-S3 camera board.

## Boards

At boot the sketch tries each camera pin preset in turn until `esp_camera_init` succeeds, and logs the one that worked:

| # | Preset | Boards |
| --- | --- | --- |
| 0 | ESP32-S3-EYE pinout | **NULLLAB ESP32-S3 CAM Dev Kit** (the one ordered: OV3660, "OverAir W01" chip antenna, IO2 LED), Freenove ESP32-S3-WROOM CAM, most generic "ESP32-S3-CAM" boards |
| 1 | XIAO ESP32S3 Sense | Seeed XIAO ESP32S3 Sense |
| 2 | M5Stack Unit CamS3 | M5Stack Unit CamS3 |
| 3 | DFRobot | FireBeetle 2 ESP32-S3, Romeo ESP32-S3 |
| 4 | ESP32-S3-CAM-LCD | Espressif ESP32-S3-CAM-LCD |

The NULLLAB board's pins come from its schematic and README at [github.com/nulllaborg/esp32s3-cam](https://github.com/nulllaborg/esp32s3-cam). That board has an ESP32-S3R8 chip (8 MB octal PSRAM), 8 MB flash and native USB. The camera uses the ESP32-S3-EYE pins (SDA 4, SCL 5, XCLK 15, VSYNC 6, HREF 7, PCLK 13, D0 to D7 on 11/9/8/10/12/18/17/16), with no PWDN or RESET pin. The status LED is on IO2 and is lit when the pin is HIGH. IO3 switches the two white flash LEDs. The microSD slot uses 38/39/40 and isn't used here.

## Flash it

```bash
./hardware/flash.sh
```

The script:
1. Installs arduino-cli and the ESP32 core if they're missing.
2. Creates `secrets.h` (git-ignored). It fills `DEVICE_KEY` from `.env.local` and `SERVER_HOST` from the Mac's name, and asks for the hotspot name and password once.
3. Compiles for ESP32S3 Dev Module with OPI PSRAM, 8 MB flash and USB CDC on boot.
4. Finds the USB port and uploads. If the upload can't connect, it tells you to hold BOOT and tap RESET.
5. Opens the serial monitor at 115200.

Other modes: `--compile-only`, `--monitor` (just watch the log) and `--port /dev/cu.usbmodemXXXX`.

## How it finds the server

`SERVER_URL` in `secrets.h` is an override. Leave it `""` and the board looks in this order:
1. The last server that worked (saved in flash).
2. `<SERVER_HOST>.local` over mDNS.
3. A scan of its Wi-Fi subnet (an iPhone hotspot is 172.20.10.1 to .14) for `GET /api/features` on port 3000.

It accepts a server only if the reply looks like SightLine's. After 3 failed posts in a row, or a Wi-Fi reconnect, it searches again, so a new Mac IP is picked up without reflashing. Both `http://` and `https://` URLs work (https uses `setInsecure()`).

## Using it

- Look at a label, menu or sign for about 2 seconds. Two clear frames in a row trigger a read. The LED blinks 3 times when a read starts, and once for every frame that's accepted.
- Press **BOOT** to read whatever is in view right now. This sends `x-device-button: 1`.
- **Preview:** open `http://<board IP>/` (the IP is printed on serial) on the Mac to see what the camera sees. It refreshes every 1.5 s. Use it to aim the camera, and to check the picture isn't upside down or mirrored.
- If the picture is wrong, set `FLIP_IMAGE 1` (upside down) or `MIRROR_IMAGE 1` (text reads backwards) in `secrets.h` and run `./hardware/flash.sh` again.
- Other options in `secrets.h`: `FRAME_SIZE FRAMESIZE_XGA` for small print, `TORCH 1` to keep the flash LEDs on in a dark room, and `WIFI_SSID2`/`WIFI_PASSWORD2` for a backup hotspot.

## Without the board

`npm run sim` does exactly what the firmware does: the same headers, a raw JPEG every 1.5 s, and the button on Enter. It cycles through `public/demo/*.jpg`. `npm run sim -- --webcam` uses the Mac's camera instead, which needs ffmpeg and Camera permission for the terminal. Add `--watch` to print the events the phone would get. `--watch` polls as a pretend phone, which can hold the hat's pairing for 60 s, so test it with `--device sim-01` while the iPhone is paired to `hat-01`.

## Status (14 Nov)

- The sketch **compiles** with arduino-cli 1.6.0 and esp32 core 3.3.12. It uses 35% of flash.
- It has **not run on hardware yet**.
- The server path was tested end to end with `hardware/sim-board.mjs`, over plain HTTP to the Mac's LAN IP.
