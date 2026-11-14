# Hat camera: what to buy and how to build it

Research notes from Saturday 14 Nov, about 1 PM. Prices and stock change hourly, so check each listing before buying. **Hard deadline:** if no camera board is in hand by **8 AM Sunday**, demo the fallback instead.

## 1. Where to get a camera board today or tonight

| Rank | Source | What to get | Price | Notes |
| --- | --- | --- | --- | --- |
| 1 | **Amazon** ([search](https://www.amazon.com/s?k=XIAO+ESP32S3+Sense)) | Seeed **XIAO ESP32S3 Sense**, ASIN [B0C69FFVHH](https://www.amazon.com/dp/B0C69FFVHH) | ~$14–20 | In the app, set ZIP 92037 and choose "Today" or "Overnight". Ship to a teammate's off-campus address or an Amazon Locker near UTC, not to the Qualcomm Room. Free same-day for Prime on orders over $25 ([Amazon](https://www.aboutamazon.com/news/amazon-prime/amazon-same-day-delivery)). |
| 2 | **Amazon** backup | Aideepen **ESP32-CAM + ESP32-CAM-MB** USB programmer, 2-pack, ASIN [B0948ZFTQZ](https://www.amazon.com/dp/B0948ZFTQZ) | ~$15–20 | Fulfilled by Amazon ([Hackster](https://hackster.io/products/buy/106198)). Uses micro-USB. Buy whichever board arrives sooner. |
| 3 | **Addicore**, 7847 Dunbrook Rd Ste H, San Diego 92126 (about 15 min from UCSD) | Look in their ESP32 category | ~$10–20 | Order online and choose local pickup. They take no walk-ins, and orders placed before noon ship the same day ([Addicore](https://www.addicore.com/pages/about-addicore)). Weekend hours aren't listed, so email or call first. |
| 4 | **Micro Center Tustin**, about 85 mi (1.5 h each way) | Inland ESP32-CAM pair, [SKU 632692](https://www.microcenter.com/quickView/632692/inland-esp32-cam-wifi-bluetooth-camera-modules-pair) | ~$15 | Set the store to Tustin on the site to check stock; I could only see a New Jersey store's count. I found no Micro Center listing for the XIAO Sense, and the plain XIAO S3 3-pack they sell has no camera. There's no Micro Center in San Diego ([forum](https://community.microcenter.com/discussion/16062/can-we-get-a-micro-center-in-san-diego)). |
| ✗ | Best Buy, Target, Walmart | Accessories only | | They don't stock camera boards in stores. Walmart.com listings are mail-order. |
| ✗ | Campus makerspaces | | | UCSD cut DIB Makerspace funding in April 2026 ([Guardian](https://ucsdguardian.org/2026/04/20/ucsd-cuts-all-future-makerspace-funding/)). EnVision requires UCSD safety training plus open-access hours, and doesn't sell parts. |
| ? | MLH hardware lab | | | The standard US lab has no ESP32 or camera boards, only 8 Logitech webcams, Raspberry Pi 4B kits and Arduinos ([MLH](https://guide.mlh.com/organizer-resources/hardware-lab-contents)). The SanD Hacks guide doesn't mention a lab. Ask in Slack whether there is one, and whether any hacker has a spare XIAO or ESP32-CAM. |

**Accessories** (Target, or the same Amazon order):
- A short USB-C cable (micro-USB for the ESP32-CAM).
- Any USB power bank.
- A baseball cap, foam double-sided tape and zip ties.
- Bluetooth earbuds or Shokz bone-conduction headphones (optional).

## 2. Which board

- **Top pick: XIAO ESP32S3 Sense.** It has native USB-C, so it needs no programmer. It has 8 MB PSRAM, a plug-in OV2640 or OV3660 camera, and a user button. It's thumb-sized, about $14 at Mouser or DigiKey ([Ameridroid listing](https://ameridroid.com/products/xiao-esp32-s3-sense)).
  - **Antenna:** a U.FL antenna comes in the box. Attach it, or Wi-Fi will be weak.
  - **Heat:** the board runs warm, so mount it on top of the brim, not against your head.
- **Backup: AI-Thinker ESP32-CAM with the MB programmer.** Same camera, older chip. It needs the MB board to flash, and has no native USB.

## 3. Fastest path to a first photo on our server

1. **Install the board package.** In Arduino IDE 2 (faster to set up than PlatformIO), add Espressif's **esp32** board package.
2. **Set the board options.** Board **XIAO_ESP32S3**, and **Tools > PSRAM > OPI PSRAM**. If PSRAM is off, you get "camera init failed" ([guide](https://coxxect.blogspot.com/2024/07/first-try-camerawebserver-on-seeed.html), [forum](https://forum.edgeimpulse.com/t/camera-init-failed-with-error-0xffffffff/8902)).
3. **Set up the phone hotspot.** On the iPhone, go to Settings > Personal Hotspot and turn on **Maximize Compatibility**. This forces 2.4 GHz and WPA2, which the ESP32 needs ([Apple](https://support.apple.com/en-al/guide/security/secfd166f620/web)). Rename the phone to plain ASCII with no curly apostrophe, because that name becomes the SSID. Keep the hotspot screen open while the board joins. Don't use UCSD-Guest (captive portal) or eduroam.
4. **Prove the camera works (about 20 min).** Open File > Examples > ESP32 > Camera > **CameraWebServer**. Uncomment `CAMERA_MODEL_XIAO_ESP32S3`, enter the hotspot SSID and password, then flash. Open the printed IP from a laptop on the same hotspot.
5. **Write our own sketch, about 60 lines:**
   - `esp_camera_init` at XGA or SVGA, JPEG quality 10–12, `CAMERA_GRAB_LATEST`.
   - Connect to Wi-Fi.
   - Loop about every 1.5 s, or immediately when the BOOT button (GPIO0) is pressed:
     - Get a frame with `esp_camera_fb_get()`.
     - POST it with `WiFiClientSecure` (`setInsecure()`) and `HTTPClient` (`setReuse(true)`, so TLS isn't renegotiated every frame) to `https://<app>.vercel.app/api/device/frame` as `Content-Type: image/jpeg`, with headers `x-sightline-device` and `x-device-key`.
     - Return the frame buffer.
   - Blink the LED when a POST succeeds ([pattern](https://forum.arduino.cc/t/out-of-memory-for-a-simple-10kb-photo/1096600)).
6. **Test before the board arrives.** Write the server route tonight and test it by sending saved JPEGs with `curl --data-binary @menu.jpg`.

## 4. Server and app changes

**`POST /api/device/frame`**
- Reads a raw JPEG body (Vercel's limit is 4.5 MB) and checks `x-device-key` against an env secret.
- Runs the existing frame-check logic.
- When the frame is `ready` and its `key` is new for that device, runs analyze and writes `{spokenText, sections, key, hint}` to a Neon `device_events` table.
- Returns `{ready, hint}` quickly. Set `maxDuration` to 30.

**`GET /api/device/next?device=&after=`**
- Returns events newer than `after`. The phone polls it about every 700 ms.
- Neon is required here, because Vercel functions share no memory between requests. This also gives us a stronger Neon track story.

**Phone: "Hat camera" mode in Settings**
- Enter the device code. The app then turns off its own camera and Auto mode and polls for events.
- Speaks each answer with the existing `/api/speak` chunking and plays the web lookup as usual.
- Speaks hints at most every 5 s.
- Uses keep-awake, because Expo Go must stay in the foreground.

**Mounting**
- Put the board on top of the brim, tilted about 15° down.
- Run the cable to a power bank on the back strap or in a pocket.

## 5. Risk, latency and the pitch

- **Latency:** about 4–6 s to the first word (POST about 1 s, frame-check about 1.2 s, analyze about 2.5 s, poll plus speech about 0.7 s).
- **Main risks:**
  - Weak cell signal in the Qualcomm Room. Test it now, and keep a second teammate's hotspot ready.
  - OV2640 text clarity. Hold menus 30–50 cm away and use XGA.
- **At judging:** play the audio through the phone speaker so the judge can hear it. Offer the judge the Shokz and the cap.
- **Fallbacks, in order:**
  1. A Pi 4 with a Logitech webcam from the MLH lab, posting from a Python script to the same route.
  2. The iPhone itself on a neck lanyard or chest mount, running Auto mode, with earbuds.
- **Prizes:**
  - Best Overall: the hardware counts toward technical complexity and the demo.
  - Neon: the device event queue.
  - ElevenLabs: unchanged.
- **Credibility for the pitch:**
  - Be My Eyes recommends lanyards and chest or head mounts for hands-free use ([Be My Eyes](https://support.bemyeyes.com/hc/en-us/articles/360015938637-Recommended-Accessories)), and runs on Ray-Ban Meta glasses ([Be My Eyes](https://bemyeyes.com/blog/be-my-eyes-on-ray-ban-meta)).
  - Bone conduction keeps the ears open for traffic ([Reviewed](https://reviewed.com/accessibility/content/shokz-opencomm-review-ideal-headset-blind-users)).
  - Envision Glasses cost $1,899–3,499 and OrCam MyEye about $4,000+ ([guide](https://www.onedayadvisor.com/2026/08/best-smart-glasses-for-visually.html)). Our hands-free camera costs $15.
- **Ruled out for this weekend:**
  - Ray-Ban Meta camera access needs a native Swift SDK and Xcode 26.4+ ([GitHub](https://github.com/facebook/meta-wearables-dat-ios)).
  - Mentra Live and Brilliant Labs Halo are mail-order only.
