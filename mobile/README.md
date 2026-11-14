# SightLine for iPhone (Expo Go)

Native iOS client for SightLine. Runs in **Expo Go** (SDK 58), no build needed. The Next.js app in the
repo root is its backend: every request goes to its `/api/*` routes, so no API keys live in the app.

## Run it

1. Start the backend at the repo root, listening on the network:
   ```bash
   npm run dev -- -H 0.0.0.0
   ```
2. Set the backend URL in `mobile/.env` (gitignored; copy `.env.example`):
   ```bash
   EXPO_PUBLIC_API_URL=http://100.64.19.59:3000   # your Mac's LAN IP: ipconfig getifaddr en0
   ```
3. Start Metro and scan the QR code with the iPhone Camera app (opens Expo Go):
   ```bash
   cd mobile && npx expo start --lan
   ```
   Phone and Mac must be on the same network. Update Expo Go from the App Store first (it must support SDK 58).

## Changing the server without restarting

Settings (gear icon) > Server lets you type any URL, saved on the phone. "Check connection" calls
`/api/features` and shows what the server supports. "Use default" goes back to `EXPO_PUBLIC_API_URL`.
Changing `.env` needs a Metro restart (`npx expo start --lan --clear`).

## Hackathon Wi-Fi

eduroam and UCSD-Guest may block device-to-device traffic, so the phone can't reach the Mac's LAN IP
(or Metro). Options, best first:

- **Backend:** deploy the Next app to Vercel (with the keys set as env vars) and put the
  `https://….vercel.app` URL in Settings > Server. Or tunnel it: `npx localtunnel --port 3000`,
  `cloudflared tunnel --url http://localhost:3000` or `ngrok http 3000`. The app sends the headers
  that skip the ngrok and localtunnel warning pages.
- **Metro:** `npx expo start --tunnel` (uses ngrok via `@expo/ngrok`, installed on first run), or
  share the phone's hotspot with the Mac and use LAN mode.

## Features worth knowing

- **Auto capture** (on by default; toggle top right or in Settings): hold the phone steady about
  0.7 s and the app grabs a silent 512 px frame for `/api/frame-check`. A "ready" frame with a new
  key starts a full read with a haptic tick. Repeated hints ("Move a little closer") are spoken at
  most every 5 s. If the route 404s, Auto switches itself off.
- **Answers** are a short spoken line plus collapsible sections (Nutrition, Warnings, Full text...).
- **From the web** card: hero image, sections and source thumbnails, in every mode.
- **Voice** picker in Settings (`/api/voices`), sent as `voiceId` on `/api/speak`.
- **Recent** (clock icon): the device's scan history from `/api/history`; Settings > Clear history.
  Each install sends a random `x-sightline-device` id with every request.
- Closing a result in any way stops all speech, and late answers or web summaries for it stay silent.

## What's where

- `App.tsx`: camera screen, capture, analyze, follow-ups, voice questions, lookup flow
- `src/api.ts`: `/api/analyze`, `/api/lookup`, `/api/speak`, `/api/transcribe`, `/api/features`
- `src/speech.ts`: ElevenLabs audio via expo-audio, falling back to the iPhone voice (expo-speech)
- `src/useAutoCapture.ts`: steadiness detection (DeviceMotion) and the frame-check loop
- `src/components/`: result, recent, settings and language sheets, disclosures, mode grid, buttons
- `src/demo.ts`: web-only fixture for design screenshots (`screenshots/`); never runs on iOS

## Checks

```bash
npx tsc --noEmit
npx expo-doctor
npx expo export --platform ios   # bundling check
```
