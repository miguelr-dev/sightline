# SightLine

**Point your camera. Hear the world.**

SightLine is a mobile-first web app (installable as a PWA) that reads the world out loud. Point your phone at something, tap one big button or say a voice command, and SightLine reads the text aloud, describes what you're holding, explains a menu or medicine label, or translates a sign.

It's built for two kinds of people:

- **Can't see it?** Blind and low-vision people get text and objects read and described out loud.
- **Can't read it?** Travelers get signs, menus, and labels in another language translated into their own, spoken by a voice for that language.

<!-- TODO: add screenshots / a GIF of the app here -->
_Screenshots coming soon._

## The problem

At least 2.2 billion people worldwide have a near or distance vision impairment, according to the World Health Organization ([WHO fact sheet: Blindness and vision impairment](https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment)).
<!-- TODO: confirm this figure against the current WHO fact sheet before presenting, and add a stat closer to our users if we have one. -->

Everyday printed information (menus, medicine labels, street signs, mail) still assumes you can see it, and that you can read the local language. A traveler in a foreign city faces the same wall of unreadable signs and menus that a low-vision person faces every day. Existing tools often need a dedicated app install, a specific phone, or a human volunteer on call. SightLine runs in any modern mobile browser and answers in a few seconds.

## Features

| Mode | What it does |
| --- | --- |
| **Read** | Reads all visible text aloud in natural reading order. |
| **Describe** | Two or three sentences about the scene, most important first: people, obstacles, signs. |
| **Menu / Label** | Summarizes a menu, product, or medicine label: name, key info, prices, warnings, allergens. |
| **Translate** | Reads the text and translates it into your chosen language, spoken by a voice for that language. |

- **One big Capture button**, plus **photo upload** as a fallback (handy on laptops).
- **Natural voice from ElevenLabs**: answers are spoken by an ElevenLabs voice (Flash v2.5, multilingual, so Translate mode works in all 13 languages). If ElevenLabs isn't set up, a request fails, or the phone is offline, SightLine switches to the browser's built-in voice without stopping.
- **Web lookup with Bright Data**: when the photo shows a specific product, medicine, restaurant, book or place, SightLine searches Google through Bright Data's SERP API and then speaks a short "From the web" summary after the first answer, with sources on screen. A recall or FDA safety warning always comes first. For a drink or snack it covers caffeine, sugar and price. For a medicine it says what the medicine treats and whether any recall turned up. For a restaurant it covers cuisine, rating, hours, popular dishes and allergen notes. The first answer never waits for the web. Say "look it up", or tap **Look it up on the web**, to search for any result.
- **Instant repeats and scan history with Neon**: web lookups are cached in Neon Postgres for 24 hours, and so are answers for the exact same photo. A repeat comes back in about 150 ms instead of 5 to 8 seconds. Each device also gets a scan history of what it read and what the web said, through `GET /api/history`. Photos are never stored, only the answer text and web image links.
- **Ask your history**: ask "What were the allergens on the cookies I scanned earlier?", "Was that medicine recalled?" or "What did I scan today?" by voice or by typing. A Claude agent searches your past scans in Neon (full-text search over every answer, section and web summary) and gives a short spoken answer, usually in 2 to 3 seconds.
- **Hat camera**: a $15 Seeed XIAO ESP32S3 Sense on a cap sends a photo about every 1.5 seconds. When the same readable target shows up in two frames in a row, or the user presses the hat's button, the server reads it and looks it up, and the paired phone speaks the answer. The sketch and flashing steps are in [hardware/xiao-cam](hardware/xiao-cam/README.md).
- **Spoken results** with Replay, Stop, and speed control from 0.75× to 1.5×.
- **Ask about this**: ask a follow-up question about the same photo ("How much is the salmon?") by voice or by typing.
- **Voice commands**: "read this", "describe", "what's on the menu", "translate to Spanish", "look it up", "repeat", "stop", "help". Where the browser has no speech recognition (such as iOS Safari added to the home screen), SightLine records the command and transcribes it with ElevenLabs Scribe.
- **Non-visual feedback**: a beep and a vibration when a capture starts, two rising beeps when the answer is ready, low beeps on errors. The app says "Looking" while it works.
- **Installable**: add it to your home screen; it opens full screen like a native app.

## Tech stack

- [Next.js](https://nextjs.org/) (App Router) + TypeScript + Tailwind CSS
- Anthropic Claude (vision) via the official [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript), called only from server routes so the API key never reaches the browser. Claude Haiku 5.5 reads photos, writes the web summaries and checks camera frames, all with structured JSON output.
- [ElevenLabs](https://elevenlabs.io/docs) text-to-speech (`eleven_flash_v2_5`) for spoken answers, and Scribe speech-to-text for voice commands where the browser has no `SpeechRecognition`. Both are called only from server routes.
- [Neon](https://neon.tech/) serverless Postgres through `@neondatabase/serverless` (HTTP driver): the lookup cache, the analysis cache, per-device scan history, and the memory behind "Ask your history" (Postgres full-text search). Everything still works without it.
- [Bright Data SERP API](https://docs.brightdata.com/scraping-automation/serp-api) for Google results as JSON. Claude then turns the results into a short spoken summary.
- Browser Web Speech API as the fallback: `speechSynthesis` for speech output, and `SpeechRecognition` for voice commands where it's supported
- `getUserMedia` for the rear camera; frames are downscaled to 1024 px JPEG before upload
- Deployed on [Vercel](https://vercel.com/)

## Architecture

```mermaid
flowchart LR
    subgraph Phone["Phone browser (PWA)"]
        Cam["Rear camera<br/>getUserMedia"] --> Frame["Canvas frame<br/>max 1024px JPEG"]
        Upload["Photo upload"] --> Frame
        Voice["Voice command<br/>SpeechRecognition or<br/>MediaRecorder"] --> UI
        UI["SightLine UI<br/>modes, buttons, live regions"] --> Frame
        UI --> Player["Speech player<br/>audio element, Replay / Stop / Speed<br/>falls back to speechSynthesis"]
    end
    subgraph Vercel["Vercel (server routes)"]
        API["/api/analyze<br/>mode-specific prompt"]
        Speak["/api/speak"]
        STT["/api/transcribe"]
        Lookup["/api/lookup"]
        History["/api/history"]
        Ask["/api/ask<br/>Claude agent, read-only tools:<br/>search_scans, recent_scans, get_scan"]
    end
    DB[("Neon Postgres<br/>lookup_cache, analysis_cache, scans")]
    API <-->|"cache by photo hash,<br/>save scan"| DB
    Lookup <-->|"cache by query,<br/>attach to scan"| DB
    History <--> DB
    UI -->|"what did I scan earlier?"| Ask
    Ask <-->|"full-text search, scoped to the device"| DB
    Ask <-->|"tool-use loop"| Claude
    Frame -->|"POST { image, mode, language, question? }"| API
    API -->|"image + prompt"| Claude["Claude API<br/>vision model"]
    API -->|"{ spokenText, sections, itemKind, webQuery }"| UI
    Player -->|"text chunks"| Speak -->|"text-to-speech"| EL["ElevenLabs<br/>Flash v2.5, Scribe"]
    Speak -->|"mp3"| Player
    Voice -->|"audio clip"| STT -->|"speech-to-text"| EL
    UI -->|"after the first answer:<br/>{ webQuery, itemKind }"| Lookup
    Lookup -->|"Google web + image search"| BD["Bright Data<br/>SERP API"]
    Lookup -->|"top results"| Claude
    Lookup -->|"From the web summary, sections,<br/>sources, item picture"| UI
    App["iPhone app<br/>(mobile/)"] -->|"auto-capture frames"| Frame2["/api/frame-check"] --> Claude
    App -->|"voice picker"| Voices["/api/voices"] --> EL
    Hat["Hat camera<br/>XIAO ESP32S3 Sense"] -->|"raw JPEG every 1.5 s"| DevFrame["/api/device/frame"]
    DevFrame -->|"frame check, then read + lookup<br/>after replying"| Claude
    DevFrame <-->|"hat state, device_events"| DB
    App -->|"poll every 700 ms"| DevNext["/api/device/next"] <--> DB
```

The last photo stays in memory on the phone so follow-up questions can be asked about it. Photos are never stored on the server. With Neon set up, the server keeps the text of answers (for caching and the device's own history) and web image links, and nothing else.

How the voice and web lookup fit together:

- **Answers**: `spokenText` is only the gist (about 30 words; in Read mode, the text itself). Recalls, warnings and allergens are always kept. Everything else comes back as `sections` with titles that fit the item, such as Nutrition, Ingredients and Allergens for a snack, Directions and Warnings for a medicine, or the menu's own headings.
- **Neon caches and history**: `/api/analyze` hashes the photo bytes together with the mode, language, question, model and prompt version (sha256), and answers repeats from `analysis_cache`. `/api/lookup` keys `lookup_cache` on the normalized query, item kind and language. Both caches last 24 hours. When a client sends an `x-sightline-device` header (a random ID it keeps), each answer is saved to `scans`, and `/api/analyze` returns a `scanId`. The web lookup is attached to that same scan when it finishes. Database writes happen after the response is sent, and a database read never holds up an answer for more than 1.5 seconds. If `DATABASE_URL` is missing or Neon fails, SightLine logs once and carries on without it.
- **Ask your history (agent memory)**: `/api/ask` runs Claude Haiku 5.5 in a tool-use loop of up to 5 turns. Before the first turn, the server runs a ranked full-text search on the question (a generated `tsvector` column on `scans` with a GIN index, weighting title, answer, sections and web summary) and fetches the 8 latest scans, in parallel. Most questions are answered in one turn from that. When they aren't, Claude calls `search_scans`, `recent_scans` or `get_scan`. Each tool runs a fixed, parameterized query limited to the caller's device ID, and Claude never writes SQL. The answer lists the scans it used, but only ones the tools actually returned.
- **Hat camera**: `POST /api/device/frame` takes a raw JPEG with `x-device-id` and `x-device-key` (checked in constant time against `DEVICE_SHARED_KEY`). It runs the frame check and replies at once. Per-hat state in Neon (`device_state`) counts how many frames in a row showed the same ready target (confidence 0.7 or higher). It reads on the second such frame, or on `x-device-button: 1`, after replying. An atomic claim stops the same target being read twice within 2 minutes. Detections, framing hints (at most one every 5 seconds), answers and web lookups go to `device_events`. The phone polls `GET /api/device/next?device=&pair=&after=` with its `x-sightline-device` header. The pair code is an 8-character HMAC of the hat ID with the shared key (`npm run device:code -- hat-01`). The first good poll pairs the hat with the phone (`device_pairs`), so hat scans go into that phone's history.
- **Auto-capture** (iPhone app): `/api/frame-check` takes a small frame and answers whether a readable target is fully in view, with a stable key for it and a short framing tip ("Move back a little", "Too dark"). It takes about 1.2 seconds per frame.
- **Speech**: the client splits each answer into sentence-sized chunks of about 300 characters and plays them in order. The next chunk is fetched while the current one plays, so speech starts fast and long text never hits a request limit. Clips are cached for Replay and speed changes, and speed uses the audio element's `playbackRate`. The first tap (Start or Capture) unlocks audio for iOS Safari.
- **Web lookup**: `/api/analyze` returns an `itemKind` (food or drink, product, medicine, restaurant, book, place, or none) and a short `webQuery`. If there is something to search for, the client calls `/api/lookup`, which searches Google through Bright Data, asks Claude for a short spoken summary (about 35 words, in the Translate language when in Translate mode) plus sections, and returns them with the sources and a picture of the item from Google Images. A lookup is capped at about 15 seconds. If Bright Data is slow, a backup search with a slightly broader query starts after 3.5 seconds. A lookup that fails or times out says so in one short sentence.

## Run it locally

Requires Node.js 20 or newer and an Anthropic API key ([console.anthropic.com](https://console.anthropic.com/)). ElevenLabs and Bright Data keys are optional. Without them, SightLine uses the browser's voice and skips the web lookup.

```bash
npm install
cp .env.example .env.local   # then put your key in ANTHROPIC_API_KEY
npm run dev
```

Open http://localhost:3000. Browsers only allow the camera on `localhost` or HTTPS, so to test on a phone either deploy to Vercel or use a tunnel such as `npx localtunnel --port 3000`.

### Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `ANTHROPIC_API_KEY` | Yes | | Server-side only. Never commit it. |
| `ANTHROPIC_MODEL` | No | `claude-haiku-5-5` | Model for reading photos. Haiku 5.5 with thinking off was the fastest model that still read text accurately in our tests (about 2.5 s per photo, against 3.5 s for Opus 5.5). |
| `ANTHROPIC_FAST_MODEL` | No | `claude-haiku-5-5` | Model for web-lookup summaries and auto-capture frame checks. |
| `ELEVENLABS_API_KEY` | No | | Turns on ElevenLabs voices and Scribe voice input. The key needs Text to Speech and Speech to Text access. Without it, SightLine uses the browser's voice. |
| `ELEVENLABS_VOICE_ID` | No | `JBFqnCBsd6RMkjVDRZzb` ("George") | Any voice ID from your ElevenLabs voice library. |
| `ELEVENLABS_MODEL_ID` | No | `eleven_flash_v2_5` | Text-to-speech model. Flash v2.5 has about 100 ms model latency and covers every Translate language. |
| `ELEVENLABS_STT_MODEL_ID` | No | `scribe_v3` | Speech-to-text model for voice commands. Falls back to `scribe_v2` if it's rejected. |
| `BRIGHTDATA_API_KEY` | No | | Turns on the web lookup, together with the zone below. |
| `DATABASE_URL` | No | | Neon Postgres connection string (pooled). Turns on the caches and scan history. Tables are created on first use, or with `npm run db:setup`. |
| `DEVICE_SHARED_KEY` | No | | Shared secret for the hat camera (`x-device-key`), also used to derive pair codes. Needs `DATABASE_URL`. Generate with `openssl rand -hex 24`. |
| `BRIGHTDATA_SERP_ZONE` | No | | The name of your SERP API zone in the Bright Data control panel (for example `serp_api1`). |

## Deploy to Vercel

1. Push this repo to GitHub (already done if you're reading this there).
2. In Vercel, choose **Add New → Project** and import the repo. The Next.js preset is detected automatically.
3. Under **Environment Variables**, add `ANTHROPIC_API_KEY`, and optionally `ELEVENLABS_API_KEY`, `BRIGHTDATA_API_KEY`, `BRIGHTDATA_SERP_ZONE` and `DATABASE_URL` (plus any of the optional settings in the table above).
4. Click **Deploy**. Open the URL on your phone and choose **Add to Home Screen**.

Or from the command line: `npx vercel`, then `npx vercel env add ANTHROPIC_API_KEY`, then `npx vercel --prod`.

## Accessibility

Accessibility is the product, so it was designed in from the start:

- **Screen readers**: every control has a text label; mode and speed buttons expose `aria-pressed`; results are announced through an `aria-live="polite"` region, and web lookup results through a second polite region so the first answer isn't read twice; source links say they open in a new tab; the decorative camera preview is hidden from assistive tech; landmarks (`header`, `nav`, `main`, labelled sections) give a logical order.
- **VoiceOver / TalkBack users**: turn **Auto-speak off** so the app doesn't talk over your screen reader; results are still announced through the live region.
- **Large targets**: every control is at least 64 × 64 px; Capture is the largest element on screen and is always visible.
- **Contrast**: dark theme by default. White on black (21:1) and yellow `#FFD60A` on black (about 14:1) both meet WCAG AAA. Base text size is 18 px and pinch zoom stays enabled.
- **Never color alone**: the selected mode shows a check mark and a thicker border as well as a color change; errors start with the word "Error".
- **Feedback beyond sight**: spoken status, beeps, and vibration (`navigator.vibrate`, where supported; iOS Safari does not support it).
- **Motion**: the loading spinner only animates when `prefers-reduced-motion` is not set.
- **Checked with axe-core** (WCAG 2.2 A, AA, AAA and best-practice rules): 0 violations.
  <!-- TODO: also run a quick manual pass with VoiceOver (iOS) and TalkBack (Android) before the demo. -->

## Team

<!-- TODO: add names, roles, and links -->
- TODO: Name, role
- TODO: Name, role

## What's next

- **Offline mode**: on-device text recognition for Read mode when there's no signal.
- **Navigation and obstacle detection**: continuous mode that warns about steps, poles, and traffic while walking.
- **Wearable glasses**: hands-free capture from smart glasses with audio through bone-conduction speakers.
- Currency recognition, color identification, and saving favorite places' menus.

## License

[MIT](LICENSE)
