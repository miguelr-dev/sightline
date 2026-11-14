#!/usr/bin/env bash
# One command to build and flash the SightLine hat camera, then watch its log.
#
#   ./hardware/flash.sh                 # find the board, compile, upload, open the serial monitor
#   ./hardware/flash.sh --compile-only  # just check that it builds
#   ./hardware/flash.sh --monitor       # skip flashing, just open the serial monitor
#   ./hardware/flash.sh --port /dev/cu.usbmodem1101
#
# Board settings (ESP32S3 Dev Module): OPI PSRAM, 8 MB flash, USB CDC on boot. They work for the
# NULLLAB ESP32-S3 CAM, Freenove ESP32-S3 CAM and XIAO ESP32S3 Sense alike.
# Never prints DEVICE_SHARED_KEY.

set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKETCH="$ROOT/hardware/xiao-cam"
SECRETS="$SKETCH/secrets.h"
BUILD="$HOME/Library/Caches/sightline-hat-build"
FQBN="esp32:esp32:esp32s3:PSRAM=opi,FlashSize=8M,PartitionScheme=default_8MB,CDCOnBoot=cdc,USBMode=hwcdc,UploadMode=default,UploadSpeed=921600"

COMPILE_ONLY=0
MONITOR_ONLY=0
PORT=""
while [ $# -gt 0 ]; do
  case "$1" in
    --compile-only) COMPILE_ONLY=1 ;;
    --monitor) MONITOR_ONLY=1 ;;
    --port) PORT="$2"; shift ;;
    *) echo "Unknown option: $1"; exit 2 ;;
  esac
  shift
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31mFAILED: %s\033[0m\n' "$*"; exit 1; }

# ---- 1. Toolchain ----
if ! command -v arduino-cli >/dev/null; then
  say "Installing arduino-cli (one time)"
  brew install arduino-cli || fail "brew install arduino-cli"
fi
if ! arduino-cli core list 2>/dev/null | grep -q '^esp32:esp32'; then
  say "Installing the ESP32 board package (one time, a few minutes)"
  arduino-cli config init >/dev/null 2>&1
  arduino-cli config add board_manager.additional_urls https://espressif.github.io/arduino-esp32/package_esp32_index.json
  arduino-cli core update-index && arduino-cli core install esp32:esp32 || fail "ESP32 core install"
fi

# ---- 2. secrets.h ----
if [ "$MONITOR_ONLY" = 0 ]; then
  if [ ! -f "$SECRETS" ]; then
    cp "$SKETCH/secrets.h.example" "$SECRETS"
    chmod 600 "$SECRETS"
    echo "Created hardware/xiao-cam/secrets.h"
  fi
  # Fill DEVICE_KEY from .env.local and SERVER_HOST from this Mac's Bonjour name. Wi-Fi is asked for
  # once if it's still the placeholder. Node does the editing so no value is echoed or mangled.
  if grep -q '"your-phone-hotspot"' "$SECRETS" && [ -t 0 ]; then
    read -r -p "iPhone hotspot name (SSID, exactly as shown in Wi-Fi settings): " SL_SSID
    read -r -s -p "Hotspot password: " SL_PASS; echo
    export SL_SSID SL_PASS
  fi
  SL_HOST="$(scutil --get LocalHostName 2>/dev/null || true)" \
  SL_ENV="$ROOT/.env.local" SL_SECRETS="$SECRETS" node -e '
    const fs = require("fs");
    const file = process.env.SL_SECRETS;
    let s = fs.readFileSync(file, "utf8");
    const q = (v) => JSON.stringify(v);  // a C string literal for plain text
    const set = (name, value) => {
      const re = new RegExp(`^#define ${name} .*$`, "m");
      s = re.test(s) ? s.replace(re, () => `#define ${name} ${q(value)}`) : s + `\n#define ${name} ${q(value)}\n`;
    };
    let key = "";
    try {
      const env = fs.readFileSync(process.env.SL_ENV, "utf8");
      const m = env.match(/^DEVICE_SHARED_KEY=(.*)$/m);
      if (m) key = m[1].trim().replace(/^["\x27]|["\x27]$/g, "");
    } catch {}
    const cur = (s.match(/^#define DEVICE_KEY "(.*)"$/m) || [])[1];
    if (!key) console.log("WARNING: DEVICE_SHARED_KEY not found in .env.local; DEVICE_KEY left as is.");
    else if (cur !== key) { set("DEVICE_KEY", key); console.log("DEVICE_KEY set from .env.local"); }
    else console.log("DEVICE_KEY matches .env.local");
    if (process.env.SL_HOST && /"your-mac-name"/.test(s)) set("SERVER_HOST", process.env.SL_HOST);
    if (process.env.SL_SSID) { set("WIFI_SSID", process.env.SL_SSID); set("WIFI_PASSWORD", process.env.SL_PASS || ""); }
    fs.writeFileSync(file, s, { mode: 0o600 });
    const get = (n) => (s.match(new RegExp(`^#define ${n} "(.*)"$`, "m")) || [])[1] ?? "?";
    console.log(`Wi-Fi "${get("WIFI_SSID")}", device "${get("DEVICE_ID")}", server ${get("SERVER_URL") || "auto"}, mDNS "${get("SERVER_HOST")}.local"`);
  ' || fail "updating secrets.h"
  if grep -q '"your-phone-hotspot"' "$SECRETS"; then
    echo "WARNING: WIFI_SSID is still the placeholder. Edit hardware/xiao-cam/secrets.h."
  fi
fi

# ---- 3. Compile ----
if [ "$MONITOR_ONLY" = 0 ]; then
  say "Compiling (first build ~1 min, then ~10 s)"
  mkdir -p "$BUILD"
  arduino-cli compile --fqbn "$FQBN" --build-path "$BUILD" "$SKETCH" 2>&1 | grep -vE '^\s*$' | tail -4
  [ "${PIPESTATUS[0]}" = 0 ] || fail "compile (see errors above)"
  [ "$COMPILE_ONLY" = 1 ] && { echo "Build OK."; exit 0; }
fi

# ---- 4. Find the board ----
find_port() {
  ls /dev/cu.usbmodem* /dev/cu.usbserial* /dev/cu.wchusbserial* /dev/cu.SLAB_USBtoUART* 2>/dev/null | head -1
}
wait_port() {  # $1 = seconds
  local n=0
  while [ $n -lt $(( $1 * 2 )) ]; do
    local p; p="$(find_port)"
    [ -n "$p" ] && { echo "$p"; return 0; }
    sleep 0.5; n=$((n + 1))
  done
  return 1
}
if [ -z "$PORT" ]; then
  PORT="$(find_port)"
  if [ -z "$PORT" ]; then
    say "No board on USB yet"
    echo "Plug the board into the Mac with the USB-C cable (a data cable, not charge-only)."
    echo "If it's plugged in and nothing shows up: unplug it, HOLD BOOT, plug it back in, release BOOT."
    PORT="$(wait_port 90)" || fail "no serial port after 90 s. Try another cable or USB port (see MORNING.md)."
  fi
fi
echo "Board on $PORT"

# ---- 5. Upload ----
if [ "$MONITOR_ONLY" = 0 ]; then
  say "Uploading"
  if ! arduino-cli upload --fqbn "$FQBN" --build-path "$BUILD" -p "$PORT" "$SKETCH"; then
    say "Upload couldn't connect. Put the board in download mode:"
    echo "  1. HOLD the BOOT button."
    echo "  2. Tap RESET (or unplug and replug the cable) while still holding BOOT."
    echo "  3. Release BOOT."
    [ -t 0 ] && read -r -p "Press Enter when done... "
    PORT="$(wait_port 30)" || fail "board not found in download mode"
    echo "Board on $PORT"
    arduino-cli upload --fqbn "$FQBN" --build-path "$BUILD" -p "$PORT" "$SKETCH" \
      || fail "upload. Try a different cable/port, then run this script again."
    echo
    echo "Uploaded. Press RESET on the board once to start the new firmware (download mode doesn't auto-restart)."
  fi
  echo "Flashed OK."
fi

# ---- 6. Serial monitor ----
say "Serial monitor (Ctrl-C to quit). Expect: preset works -> Connected -> + http://... is SightLine -> bytes -> 200"
sleep 2
PORT="$(wait_port 15)" || fail "board didn't come back on USB after reset; press RESET"
exec arduino-cli monitor -p "$PORT" --config baudrate=115200 --quiet
