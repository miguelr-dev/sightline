// SightLine hat camera, for any ESP32-S3 camera board.
//
// Grabs a JPEG about every 1.5 s and POSTs it to SightLine's /api/device/frame. The paired phone
// speaks what the server finds. Press BOOT (GPIO0) to read whatever is in view right now.
//
// Boards: tries each camera pin preset below until esp_camera_init succeeds, and logs the winner.
//   0. ESP32-S3-EYE pinout: NULLLAB "ESP32-S3 CAM Dev Kit" (OV3660, "OverAir W01" antenna),
//      Freenove ESP32-S3-WROOM CAM and most generic ESP32-S3-CAM boards.
//   1. Seeed XIAO ESP32S3 Sense.
//   2. M5Stack Unit CamS3.   3. DFRobot FireBeetle 2 / Romeo ESP32-S3.   4. ESP32-S3-CAM-LCD.
//
// Finding the server: SERVER_URL from secrets.h if it answers, else the last server that worked
// (saved in flash), else <SERVER_HOST>.local over mDNS, else a scan of the Wi-Fi subnet (an iPhone
// hotspot is 172.20.10.1-14) for GET /api/features on SERVER_PORT. Re-runs whenever posts fail.
//
// Build: ./hardware/flash.sh (ESP32S3 Dev Module, OPI PSRAM, 8 MB flash, USB CDC on boot).
// Preview: open http://<board IP>/ on the same Wi-Fi to see what the camera sees.

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiMulti.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ESPmDNS.h>
#include <Preferences.h>
#include <WebServer.h>

// ---- Settings: put real values in secrets.h (git-ignored). ----
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID "your-phone-hotspot"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "hotspot-password"
#endif
#ifndef WIFI_SSID2
#define WIFI_SSID2 ""  // optional backup network, e.g. a teammate's hotspot
#endif
#ifndef WIFI_PASSWORD2
#define WIFI_PASSWORD2 ""
#endif
#ifndef SERVER_URL
#define SERVER_URL ""  // "" = find the Mac automatically. Or e.g. "http://172.20.10.3:3000"
#endif
#ifndef SERVER_HOST
#define SERVER_HOST ""  // the Mac's mDNS name without ".local" (npm run demo:info prints it)
#endif
#ifndef SERVER_PORT
#define SERVER_PORT 3000
#endif
#ifndef DEVICE_ID
#define DEVICE_ID "hat-01"  // letters, digits and dashes; the phone pairs with this name
#endif
#ifndef DEVICE_KEY
#define DEVICE_KEY "same-as-DEVICE_SHARED_KEY-on-the-server"
#endif
#ifndef FRAME_SIZE
#define FRAME_SIZE FRAMESIZE_SVGA  // 800x600. FRAMESIZE_XGA (1024x768) helps with small print.
#endif
#ifndef JPEG_QUALITY
#define JPEG_QUALITY 10  // 0-63, lower is sharper and bigger. 10 keeps text crisp at ~40-90 KB.
#endif
#ifndef FLIP_IMAGE
#define FLIP_IMAGE 0  // 1 = rotate 180 degrees (camera mounted upside down)
#endif
#ifndef MIRROR_IMAGE
#define MIRROR_IMAGE 0  // 1 = toggle left-right mirroring (if text in the preview reads backwards)
#endif
#ifndef CAMERA_PRESET
#define CAMERA_PRESET -1  // -1 = try all presets in order; 0-4 = force one
#endif
#ifndef TORCH
#define TORCH 0  // 1 = keep the white flash LEDs on (NULLLAB board only; for dark rooms)
#endif

const unsigned long INTERVAL_MS = 1500;
const int BUTTON_PIN = 0;  // BOOT button on every ESP32-S3 board, LOW when pressed

// ---- Camera pin presets (from Espressif's camera_pins.h and the NULLLAB schematic) ----
struct CamPreset {
  const char* name;
  int pwdn, reset, xclk, sda, scl;
  int y9, y8, y7, y6, y5, y4, y3, y2;
  int vsync, href, pclk;
  int led;          // status LED, -1 if none
  bool ledActiveLow;
  int torch;        // flash LED pin to hold off (or on with TORCH), -1 if none
};

const CamPreset PRESETS[] = {
    // NULLLAB ESP32-S3 CAM (github.com/nulllaborg/esp32s3-cam): IO2 -> 1k -> LED -> GND (active
    // high), IO3 drives the two white flash LEDs. Same camera pins as ESP32-S3-EYE and Freenove.
    {"ESP32-S3-EYE / Freenove / NULLLAB S3-CAM", -1, -1, 15, 4, 5,
     16, 17, 18, 12, 10, 8, 9, 11, 6, 7, 13, 2, false, 3},
    {"Seeed XIAO ESP32S3 Sense", -1, -1, 10, 40, 39,
     48, 11, 12, 14, 16, 18, 17, 15, 38, 47, 13, 21, true, -1},
    {"M5Stack Unit CamS3", -1, 21, 11, 17, 41,
     13, 4, 10, 5, 7, 16, 15, 6, 42, 18, 12, 14, false, -1},
    {"DFRobot FireBeetle 2 / Romeo ESP32-S3", -1, -1, 45, 1, 2,
     48, 46, 8, 7, 4, 41, 40, 39, 6, 42, 5, -1, false, -1},
    {"ESP32-S3-CAM-LCD", -1, -1, 40, 17, 18,
     39, 41, 42, 12, 3, 14, 47, 13, 21, 38, 11, -1, false, -1},
};
const int PRESET_COUNT = sizeof(PRESETS) / sizeof(PRESETS[0]);

const CamPreset* board = &PRESETS[0];  // the preset that worked
WiFiMulti wifiMulti;
WiFiClientSecure tls;  // for https://
WiFiClient plain;      // for http:// (the Mac on the same hotspot)
HTTPClient http;
Preferences prefs;
WebServer preview(80);
String serverBase;  // e.g. "http://172.20.10.3:3000", "" until found
unsigned long lastShot = 0;
int failures = 0;
bool wasConnected = false;
volatile bool buttonPressed = false;
volatile unsigned long buttonAt = 0;

// ---------------------------------------------------------------- LED and button

void ledWrite(bool on) {
  if (board->led < 0) return;
  digitalWrite(board->led, (on != board->ledActiveLow) ? HIGH : LOW);
}

void blink(int times, int ms) {
  for (int i = 0; i < times; i++) {
    ledWrite(true);
    delay(ms);
    ledWrite(false);
    if (i + 1 < times) delay(ms);
  }
}

void IRAM_ATTR onButton() {
  unsigned long now = millis();
  if (now - buttonAt > 250) buttonPressed = true;  // debounce
  buttonAt = now;
}

// ---------------------------------------------------------------- Camera

bool tryPreset(const CamPreset& p, bool psram) {
  camera_config_t c = {};
  c.ledc_channel = LEDC_CHANNEL_0;
  c.ledc_timer = LEDC_TIMER_0;
  c.pin_d0 = p.y2;
  c.pin_d1 = p.y3;
  c.pin_d2 = p.y4;
  c.pin_d3 = p.y5;
  c.pin_d4 = p.y6;
  c.pin_d5 = p.y7;
  c.pin_d6 = p.y8;
  c.pin_d7 = p.y9;
  c.pin_xclk = p.xclk;
  c.pin_pclk = p.pclk;
  c.pin_vsync = p.vsync;
  c.pin_href = p.href;
  c.pin_sccb_sda = p.sda;
  c.pin_sccb_scl = p.scl;
  c.pin_pwdn = p.pwdn;
  c.pin_reset = p.reset;
  c.xclk_freq_hz = 20000000;
  c.pixel_format = PIXFORMAT_JPEG;
  c.grab_mode = CAMERA_GRAB_LATEST;  // always send the newest frame, not a stale one
  if (psram) {
    c.frame_size = FRAME_SIZE;
    c.jpeg_quality = JPEG_QUALITY;
    c.fb_count = 2;
    c.fb_location = CAMERA_FB_IN_PSRAM;
  } else {  // a build without PSRAM: small frames in internal RAM so it still works
    c.frame_size = FRAMESIZE_VGA;
    c.jpeg_quality = 14;
    c.fb_count = 1;
    c.fb_location = CAMERA_FB_IN_DRAM;
  }
  esp_err_t err = esp_camera_init(&c);
  if (err != ESP_OK) {
    Serial.printf("  - %s: no camera (0x%x)\n", p.name, err);
    return false;
  }
  return true;
}

void tuneSensor() {
  sensor_t* s = esp_camera_sensor_get();
  if (!s) return;
  bool ov3660 = s->id.PID == OV3660_PID;
  const char* model = ov3660 ? "OV3660" : s->id.PID == OV2640_PID ? "OV2640"
                    : s->id.PID == OV5640_PID ? "OV5640" : "unknown";
  Serial.printf("  sensor %s (PID 0x%x)\n", model, s->id.PID);
  int vflip = 0, hmirror = 0;
  if (ov3660) {
    vflip = 1;                 // OV3660 modules come out upside down (Espressif's example flips it)
    s->set_brightness(s, 1);   // a little brighter
    s->set_saturation(s, -2);  // OV3660 over-saturates; text reads better muted
  }
  if (FLIP_IMAGE) {  // rotate 180
    vflip ^= 1;
    hmirror ^= 1;
  }
  if (MIRROR_IMAGE) hmirror ^= 1;
  s->set_vflip(s, vflip);
  s->set_hmirror(s, hmirror);
  s->set_framesize(s, psramFound() ? FRAME_SIZE : FRAMESIZE_VGA);
  Serial.printf("  vflip=%d hmirror=%d\n", vflip, hmirror);
}

bool startCamera() {
  bool psram = psramFound();
  if (psram) Serial.printf("PSRAM %u KB\n", (unsigned)(ESP.getPsramSize() / 1024));
  else Serial.println("No PSRAM! Build with PSRAM=opi (flash.sh does). Falling back to VGA in RAM.");
  Serial.println("Camera: trying pin presets");
  for (int i = 0; i < PRESET_COUNT; i++) {
    if (CAMERA_PRESET >= 0 && i != CAMERA_PRESET) continue;
    if (tryPreset(PRESETS[i], psram)) {
      board = &PRESETS[i];
      Serial.printf("  + preset %d works: %s\n", i, board->name);
      tuneSensor();
      // The first frames after power-up are dark or green while exposure settles.
      for (int k = 0; k < 3; k++) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (fb) esp_camera_fb_return(fb);
      }
      return true;
    }
    delay(50);
  }
  Serial.println("Camera init failed on every preset. Check the ribbon cable: lift the connector");
  Serial.println("latch, push the ribbon all the way in (contacts facing the board), close the latch.");
  return false;
}

// ---------------------------------------------------------------- Wi-Fi

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (wasConnected) {
    Serial.println("Wi-Fi dropped; reconnecting");
    wasConnected = false;
  }
  Serial.printf("Joining Wi-Fi \"%s\"%s%s\n", WIFI_SSID, strlen(WIFI_SSID2) ? " or " : "", WIFI_SSID2);
  unsigned long start = millis();
  while (wifiMulti.run(5000) != WL_CONNECTED && millis() - start < 20000) {
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    wasConnected = true;
    Serial.printf("\nConnected to \"%s\", IP %s, gateway %s, RSSI %d dBm\n", WiFi.SSID().c_str(),
                  WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str(), WiFi.RSSI());
    Serial.printf("Camera preview: http://%s/\n", WiFi.localIP().toString().c_str());
    blink(2, 120);
  } else {
    Serial.println("\nWi-Fi failed. Is the hotspot on, with Maximize Compatibility, and the");
    Serial.println("Personal Hotspot screen open on the iPhone? Retrying.");
  }
}

// ---------------------------------------------------------------- Server discovery

String normalizeBase(String u) {
  u.trim();
  if (!u.length()) return u;
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
  while (u.endsWith("/")) u.remove(u.length() - 1);
  if (u.endsWith("/api/device/frame")) u.remove(u.length() - strlen("/api/device/frame"));
  // "http://1.2.3.4" with no port means the Next dev server on SERVER_PORT.
  int hostStart = u.indexOf("://") + 3;
  if (u.startsWith("http://") && u.indexOf(':', hostStart) < 0) u += ":" + String(SERVER_PORT);
  return u;
}

bool beginRequest(const String& url) {
  if (url.startsWith("https://")) return http.begin(tls, url);
  return http.begin(plain, url);
}

// GET <base>/api/features. True if it's a SightLine server.
bool probe(const String& base, uint32_t timeoutMs) {
  if (!base.length()) return false;
  if (!beginRequest(base + "/api/features")) return false;
  http.setTimeout(timeoutMs);
  http.setConnectTimeout(timeoutMs);
  int code = http.GET();
  String body = code == 200 ? http.getString() : "";
  http.end();
  if (code != 200 || body.indexOf("\"hat\"") < 0) {
    Serial.printf("  - %s: %s\n", base.c_str(),
                  code > 0 ? ("HTTP " + String(code)).c_str() : http.errorToString(code).c_str());
    return false;
  }
  Serial.printf("  + %s is SightLine\n", base.c_str());
  if (body.indexOf("\"hat\":false") >= 0) {
    Serial.println("    ...but its hat camera is off: set DEVICE_SHARED_KEY and DATABASE_URL in .env.local");
  }
  return true;
}

// Scan the Wi-Fi subnet for something listening on SERVER_PORT, then probe it.
String scanSubnet() {
  IPAddress me = WiFi.localIP(), mask = WiFi.subnetMask(), gw = WiFi.gatewayIP();
  uint32_t ip = (uint32_t)me[0] << 24 | me[1] << 16 | me[2] << 8 | me[3];
  uint32_t m = (uint32_t)mask[0] << 24 | mask[1] << 16 | mask[2] << 8 | mask[3];
  if (m < 0xFFFFFF00) m = 0xFFFFFF00;  // never scan more than a /24
  uint32_t net = ip & m, last = (net | ~m) - 1;
  Serial.printf("  scanning %u hosts for port %d...\n", (unsigned)(last - net), SERVER_PORT);
  for (uint32_t h = net + 1; h <= last; h++) {
    IPAddress cand(h >> 24, (h >> 16) & 255, (h >> 8) & 255, h & 255);
    if (cand == me || cand == gw) continue;  // the gateway is the iPhone itself
    WiFiClient c;
    if (c.connect(cand, SERVER_PORT, 250)) {
      c.stop();
      String base = "http://" + cand.toString() + ":" + String(SERVER_PORT);
      if (probe(base, 8000)) return base;  // generous: next dev may compile the route first
    }
  }
  return "";
}

bool findServer() {
  Serial.println("Finding the SightLine server");
  String fixed = normalizeBase(SERVER_URL);
  if (fixed.length() && probe(fixed, 8000)) {
    serverBase = fixed;
    return true;
  }
  String cached = prefs.getString("base", "");
  if (cached.length() && cached != fixed && probe(cached, 8000)) {
    serverBase = cached;
    return true;
  }
  if (strlen(SERVER_HOST)) {
    IPAddress ip = MDNS.queryHost(SERVER_HOST, 2500);
    if (ip != IPAddress(0, 0, 0, 0)) {
      Serial.printf("  mDNS: %s.local is %s\n", SERVER_HOST, ip.toString().c_str());
      String base = "http://" + ip.toString() + ":" + String(SERVER_PORT);
      if (probe(base, 8000)) {
        serverBase = base;
        prefs.putString("base", serverBase);
        return true;
      }
    } else {
      Serial.printf("  mDNS: no answer for %s.local\n", SERVER_HOST);
    }
  }
  String found = scanSubnet();
  if (found.length()) {
    serverBase = found;
    prefs.putString("base", serverBase);
    return true;
  }
  Serial.printf("No server found. Is `npm run dev -- -H 0.0.0.0` running on the Mac, on the same\n"
                "Wi-Fi, port %d? Retrying.\n", SERVER_PORT);
  return false;
}

// ---------------------------------------------------------------- Frames

void sendFrame(bool button) {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Frame grab failed");
    return;
  }
  unsigned long t = millis();
  String url = serverBase + "/api/device/frame";
  beginRequest(url);
  http.setReuse(true);  // keep the connection open between frames
  http.setConnectTimeout(4000);
  http.setTimeout(20000);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-key", DEVICE_KEY);
  if (button) http.addHeader("x-device-button", "1");
  int code = http.POST(fb->buf, fb->len);
  size_t sent = fb->len;
  esp_camera_fb_return(fb);  // free the buffer before reading the reply

  String reply = code > 0 ? http.getString() : http.errorToString(code);
  http.end();
  Serial.printf("%s%u bytes -> %d in %lums: %s\n", button ? "[button] " : "", (unsigned)sent, code,
                millis() - t, reply.substring(0, 160).c_str());

  if (code == 200) {
    failures = 0;
    blink(reply.indexOf("\"reading\":true") >= 0 ? 3 : 1, 40);  // 3 quick blinks: reading now
    return;
  }
  if (code == 401) Serial.println("  401: DEVICE_KEY in secrets.h doesn't match DEVICE_SHARED_KEY in .env.local");
  if (code == 503) Serial.println("  503: server is missing DEVICE_SHARED_KEY or DATABASE_URL (see reply)");
  if (code == 400) Serial.println("  400: DEVICE_ID must be 3-40 letters, digits or dashes");
  // Connection errors or a wrong server: after 3 in a row, look for the server again.
  if (code < 0 || code == 404 || code == 502) {
    if (++failures >= 3) {
      Serial.println("Server unreachable 3 times; searching again");
      serverBase = "";
      failures = 0;
    }
  }
}

void handlePreview() {
  preview.send(200, "text/html",
               "<!doctype html><meta name=viewport content='width=device-width'>"
               "<title>SightLine hat</title><body style='margin:0;background:#000'>"
               "<img id=i style='width:100%' src='/jpg'><script>"
               "setInterval(()=>{i.src='/jpg?'+Date.now()},1500)</script>");
}

void handleJpg() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    preview.send(503, "text/plain", "no frame");
    return;
  }
  preview.setContentLength(fb->len);
  preview.send(200, "image/jpeg", "");
  preview.client().write(fb->buf, fb->len);
  esp_camera_fb_return(fb);
}

// ---------------------------------------------------------------- Main

void setup() {
  Serial.begin(115200);
#if ARDUINO_USB_CDC_ON_BOOT
  Serial.setTxTimeoutMs(0);  // don't stall when no computer is listening (power bank)
#endif
  unsigned long waitStart = millis();
  while (!Serial && millis() - waitStart < 1500) delay(10);
  Serial.printf("\nSightLine hat camera \"%s\"\n", DEVICE_ID);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(BUTTON_PIN), onButton, FALLING);
  prefs.begin("sightline", false);

  while (!startCamera()) {
    board = &PRESETS[0];
    pinMode(board->led, OUTPUT);
    blink(5, 80);
    delay(3000);
  }
  if (board->led >= 0) {
    pinMode(board->led, OUTPUT);
    ledWrite(false);
  }
  if (board->torch >= 0) {
    pinMode(board->torch, OUTPUT);
    digitalWrite(board->torch, TORCH ? HIGH : LOW);
  }

  tls.setInsecure();  // hackathon shortcut: no certificate check for https:// servers
  WiFi.mode(WIFI_STA);
  WiFi.setHostname(DEVICE_ID);
  WiFi.setSleep(false);  // lower latency
  wifiMulti.addAP(WIFI_SSID, WIFI_PASSWORD);
  if (strlen(WIFI_SSID2)) wifiMulti.addAP(WIFI_SSID2, WIFI_PASSWORD2);
  connectWifi();
  MDNS.begin(DEVICE_ID);
  preview.on("/", handlePreview);
  preview.on("/jpg", handleJpg);
  preview.begin();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWifi();
    if (WiFi.status() != WL_CONNECTED) {
      delay(1000);
      return;
    }
    serverBase = "";  // new network or new DHCP lease: check the server again
  }
  preview.handleClient();
  if (!serverBase.length()) {
    if (!findServer()) {
      for (int i = 0; i < 30; i++) {  // wait ~3 s, keeping the preview responsive
        preview.handleClient();
        delay(100);
      }
      return;
    }
    Serial.printf("Sending frames to %s/api/device/frame every %lu ms\n", serverBase.c_str(), INTERVAL_MS);
  }

  bool button = buttonPressed;
  if (button || millis() - lastShot >= INTERVAL_MS) {
    buttonPressed = false;
    lastShot = millis();
    sendFrame(button);
  }
  delay(10);
}
