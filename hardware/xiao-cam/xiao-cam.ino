// SightLine hat camera: Seeed XIAO ESP32S3 Sense.
// Grabs a JPEG about every 1.5 s and POSTs it to SightLine's /api/device/frame. The paired phone
// speaks what the server finds. Press BOOT (GPIO0) to read whatever is in view right now.
//
// Arduino IDE 2: board "XIAO_ESP32S3", Tools > PSRAM > "OPI PSRAM". See README.md.

#include "esp_camera.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ---- Settings: put real values in secrets.h (git-ignored), or edit the defaults here. ----
#if __has_include("secrets.h")
#include "secrets.h"
#endif
#ifndef WIFI_SSID
#define WIFI_SSID "your-phone-hotspot"
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD "hotspot-password"
#endif
#ifndef SERVER_URL
#define SERVER_URL "https://your-app.vercel.app/api/device/frame"
#endif
#ifndef DEVICE_ID
#define DEVICE_ID "hat-01"  // letters, digits and dashes; the phone pairs with this name
#endif
#ifndef DEVICE_KEY
#define DEVICE_KEY "same-as-DEVICE_SHARED_KEY-on-the-server"
#endif
#ifndef FRAME_SIZE
#define FRAME_SIZE FRAMESIZE_SVGA  // 800x600. FRAMESIZE_XGA reads small text better but is slower.
#endif
#ifndef FLIP_IMAGE
#define FLIP_IMAGE 0  // set to 1 if the camera is mounted upside down
#endif

const unsigned long INTERVAL_MS = 1500;
const int BUTTON_PIN = 0;  // BOOT button, LOW when pressed
const int LED_PIN = 21;    // XIAO ESP32S3 user LED, active LOW

// ---- XIAO ESP32S3 Sense camera pins (CAMERA_MODEL_XIAO_ESP32S3 in Espressif's camera_pins.h) ----
#define PWDN_GPIO_NUM -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 10
#define SIOD_GPIO_NUM 40
#define SIOC_GPIO_NUM 39
#define Y9_GPIO_NUM 48
#define Y8_GPIO_NUM 11
#define Y7_GPIO_NUM 12
#define Y6_GPIO_NUM 14
#define Y5_GPIO_NUM 16
#define Y4_GPIO_NUM 18
#define Y3_GPIO_NUM 17
#define Y2_GPIO_NUM 15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM 47
#define PCLK_GPIO_NUM 13

WiFiClientSecure tls;  // for https:// (Vercel)
WiFiClient plain;      // for http:// (a laptop on the same hotspot)
HTTPClient http;
const bool USE_TLS = String(SERVER_URL).startsWith("https://");
unsigned long lastShot = 0;

void blink(int times, int ms) {
  for (int i = 0; i < times; i++) {
    digitalWrite(LED_PIN, LOW);  // on
    delay(ms);
    digitalWrite(LED_PIN, HIGH);  // off
    if (i + 1 < times) delay(ms);
  }
}

bool startCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAME_SIZE;
  config.jpeg_quality = 12;  // 10-12: sharp enough for text, small enough to send quickly
  config.fb_count = 2;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.grab_mode = CAMERA_GRAB_LATEST;  // always send the newest frame, not a stale one

  if (!psramFound()) {
    Serial.println("No PSRAM. In Arduino IDE set Tools > PSRAM > OPI PSRAM.");
    return false;
  }
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed: 0x%x\n", err);
    return false;
  }
  if (FLIP_IMAGE) {
    sensor_t* s = esp_camera_sensor_get();
    s->set_vflip(s, 1);
    s->set_hmirror(s, 1);
  }
  return true;
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  Serial.printf("Joining Wi-Fi \"%s\"", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);  // lower latency
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000) {
    delay(300);
    Serial.print(".");
  }
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\nConnected, IP %s\n", WiFi.localIP().toString().c_str());
    blink(2, 120);
  } else {
    Serial.println("\nWi-Fi failed; retrying. Is the hotspot on with Maximize Compatibility?");
  }
}

void sendFrame(bool button) {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("Frame grab failed");
    return;
  }
  unsigned long t = millis();
  if (USE_TLS) http.begin(tls, SERVER_URL);
  else http.begin(plain, SERVER_URL);
  http.setReuse(true);  // keep the TLS connection open between frames
  http.setTimeout(15000);
  http.addHeader("Content-Type", "image/jpeg");
  http.addHeader("x-device-id", DEVICE_ID);
  http.addHeader("x-device-key", DEVICE_KEY);
  if (button) http.addHeader("x-device-button", "1");
  int code = http.POST(fb->buf, fb->len);
  size_t sent = fb->len;
  esp_camera_fb_return(fb);  // free the buffer before waiting on the reply text

  String reply = code > 0 ? http.getString() : http.errorToString(code);
  http.end();
  Serial.printf("%s %u bytes -> %d in %lums: %s\n", button ? "[button]" : "", (unsigned)sent, code,
                millis() - t, reply.c_str());
  if (code == 200) {
    blink(reply.indexOf("\"reading\":true") >= 0 ? 3 : 1, 40);  // 3 quick blinks: reading it now
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, HIGH);
  delay(500);
  Serial.println("\nSightLine hat camera");
  while (!startCamera()) {
    blink(5, 80);
    delay(3000);
  }
  tls.setInsecure();  // hackathon shortcut: no certificate pinning
  connectWifi();
}

void loop() {
  connectWifi();
  if (WiFi.status() != WL_CONNECTED) {
    delay(1000);
    return;
  }
  bool button = digitalRead(BUTTON_PIN) == LOW;
  if (button || millis() - lastShot >= INTERVAL_MS) {
    lastShot = millis();
    sendFrame(button);
    if (button) {
      while (digitalRead(BUTTON_PIN) == LOW) delay(10);  // wait for release
    }
  }
  delay(20);
}
