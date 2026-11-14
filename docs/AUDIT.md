# SightLine QA and audit (Sat 14 Nov, afternoon)

Independent pass over the server routes, web app, mobile client (read-only) and track fit. All tests ran against the dev server on :3000 with real keys, a fresh device ID (`audit-…`) and fresh hat IDs (`audithat-…`). Every test row was deleted afterwards (`DELETE /api/history` for scans; direct SQL for `device_events`, `device_state` and `device_pairs`, because hat rows have no cleanup route).

## 1. End-to-end results

Images: the four `public/demo/` images plus a real phone photo of a projected slide, downscaled to 1024 px like the clients do.

| Area | What was tested | Result |
| --- | --- | --- |
| Analyze, 4 modes x 5 images | Read, Describe, Menu / Label, Translate (into French, Japanese, English, Spanish) | **Pass, 20/20.** Answers lead with the content. Warnings and allergens come through: "Warning: may cause stomach bleeding, and has an allergy alert. Do not take more than 6 tablets in 24 hours." Sections fit the item (Uses / Directions / Warnings / Expires; Starters / Mains / Desserts; Translation / Original text). |
| Spoken length | Target of about 30 words | 13 of 20 answers were 30 words or less. The other 7 ran 36 to 42 words: the room scene in Read, Describe, Menu and Translate; Read and Translate on the slide (Read is meant to read short text in full); and Describe on the medicine (40). Japanese is fine. |
| Content slips | | Read mode misspelled "Pain **Reveiler**" (a Haiku transcription slip). Translate on the room scene opened with "La imagen muestra…", which the prompt forbids. The Spanish translation of the slide used English section titles. On the Spanish sign, Translate returned `itemKind: place` and the query "Calle Mayor street sign", so a pointless web lookup runs. |
| Follow-ups | "How much is the salmon?" (en/es), "Is there anything vegan?" in Translate→German | Pass. All correct, in the right language. |
| Analyze failure paths | Bad JSON, no image, short image, 6 MB image, 30 MB body, bad mode, garbage base64, PNG bytes, unknown language, no device header | Pass. Every error gets a short spoken message and no stack traces. PNG input used to fail ("couldn't read that photo"); **fixed**, it now works. |
| Lookup | Medicine from a scan, restaurant, Advil (cold), energy drink in Spanish, no query (Claude proposes one), empty body, junk fields | Pass. Recall first: "There is a recall involving Advil… FDA classified it Class II." "I didn't find a recall for DEMO-PRIN…". The Spanish summary was in Spanish. **Problem:** the fictional Harbor Table menu matches a real Harbor Table in Maine, and the summary contradicts the menu's hours. |
| Caches | Cold vs warm | Analyze: about 2.3 s cold, about 120 ms warm. Lookup: 4.5 to 7.6 s cold, about 75 ms warm. A repeat reuses the same `scanId`, except when the repeat lands before the first `after()` insert finishes (2 of 20); that adds a duplicate history row (minor). |
| History | Own device, another device, no header, bad ID, `limit=abc`, DELETE with and without a header | Pass. Device scoping holds (another device sees 0 rows and deletes 0). |
| Ask your history | Recall, warnings, salmon price, "what did I scan today", Spanish question, prompt injection, missing item, another device | **Two bugs, fixed.** (1) "What did I scan today?" said "eight items" when there were 22, because the model read the size of the recent-scans list as a count. (2) A Spanish question said "no veo ninguna medicina": the scans are indexed in English and the agent never searched. Both are correct now: "32 scans today", and the Spanish question finds the ibuprofen. The prompt injection was refused and stayed scoped to the device. |
| Hat camera | Raw JPEG POSTed twice, then polled `next`; pairing; dedupe; button; failure paths | Pass after a fix. **Bug, fixed:** the frame check returns a different key for the *same* photo ("precaucion-calle-mayor-sign", then "calle-mayor-precaucion-sign"), so the two-frames-in-a-row rule never fired on the sign. Keys are now compared as word sets. Failure paths: missing ID (400), wrong or missing key (401), non-JPEG (415), tiny or 6 MB body (413), wrong pair code (403), no phone header (400). All pass. |
| Speak | en, es, `voiceId` Alice, unknown voice, injected voiceId, empty, bad JSON, 5 MB body | Pass. An unknown voice falls back to the default voice. **Fixed:** that fallback now keeps the language lock, and a 5 MB body is refused (413) instead of being sent to ElevenLabs as 1,000 characters. |
| Voices | 3 calls | Pass. 8 curated voices with previews. |
| Transcribe | Round trip of the synthesized mp3, tiny, 3.5 MB, garbage | Pass. "Harbour Table lunch menu served 11:00 a.m. to 3:00 p.m.…". Garbage input gets 502 `upstream`. |
| Frame check | Good frames, bad JSON, no image, huge, garbage | Pass. |
| Web: landing `/` | Render, console, axe (WCAG A/AA/AAA plus best-practice) at 390 and 1440 px | Renders, console clean. axe found **11 AAA contrast failures** (grey `#55555a` on `#f5f5f7`, 6.8:1). **Fixed** by changing the grey to `#505055` (7.4:1); axe now finds 0 violations. |
| Web: `/app` | Start, Menu mode, upload `menu.jpg`, typed follow-up, axe at each step | Pass. Analyze answered in 3.4 s and the lookup followed by itself. The live regions read the answer and then "From the web". The follow-up answered "24 dollars". axe: 0 violations on the start screen, the main screen and with a result. Console clean. |
| Build and lint | `npm run lint`, `npm run build` | Both pass. A build earlier in the session failed on another agent's half-written `tests/frameStore.test.ts`; it passes now that `lib/frameStore.ts` exists. |
| Secrets in the bundle | Searched `.next/static` and `.next/dev/static` for every `.env.local` value and for key-name markers | 0 hits. No client file imports a server module, and there are no `NEXT_PUBLIC_` variables. |

## 2. Latency (median of about 3 runs, laptop to Anthropic, ElevenLabs, Bright Data and Neon)

| Route | Before | After | Notes |
| --- | --- | --- | --- |
| analyze, cold (1024 px, Menu mode) | 2.1–2.5 s | 2.2–2.4 s | Bound by the model; Japanese Translate took 5.7 s. |
| analyze, warm hit (with device header) | 160 ms | **118 ms** | The history lookup now runs alongside the cache read. |
| First DB call on a cold server instance | **~1.0 s** of schema setup | **~90 ms** | 15 DDL statements now go in one transaction (one HTTP round trip). Before, a cold Vercel function could time out the 1.5 s cache read, so even a cached photo paid for a full Claude call. |
| frame-check (512 px) | 1.2–1.5 s | same | |
| lookup, cold | 4.5–7.6 s | same | Bright Data takes 1.8–4.4 s (one empty reply was rescued by the hedge) and the Claude summary 1.8–3.0 s. Cutting sections from 5 to 3 saved only about 15% of tokens, which is within the noise, so I didn't change it. |
| lookup, warm | 90 ms | 73 ms | |
| ask | 2.2 s | 2.2–2.7 s | Always 1 turn (checked with a temporary header). The spread is model variance plus a larger test history. |
| speak | 200 ms to first byte, about 380 ms total for 110 characters | same | |
| transcribe | 800 ms | same | |
| voices | 97 ms first, 5 ms cached | same | |
| history GET / features / device/next | 85 / 5 / 88 ms | same | |
| Hat: second frame's reply, then the answer event | 1.4 s, then about 2.5 s | Answer posted before the scan row is written | About 4 to 5 s from the second frame to the phone speaking. |

**Biggest remaining wins (not done, too big for now):**
1. Stream `/api/analyze` and start speaking as soon as `spokenText` closes in the partial JSON. This would cut perceived latency a lot on long Read and Menu answers.
2. Hat: read on the *first* ready frame when confidence is 0.9 or higher (saves about 1.5 s). Or start the read in parallel with the second frame check.
3. Warm the Vercel functions just before judging (`/api/features` plus one analyze), and pre-warm lookups for the demo items, which stay cached for 24 hours.

## 3. Fixes made

I made no commits. Another session committed most of these fixes in `49df43b` ("audit fixes"). `app/layout.tsx` and this file are still uncommitted.

| File | Change |
| --- | --- |
| `lib/http.ts` (new) | `readBody`/`readJson` with a byte cap that applies while the body streams in, plus `imageMediaType` (JPEG, PNG, WebP or GIF from the magic bytes). |
| `app/api/{analyze,frame-check,lookup,ask,speak,transcribe,device/frame}/route.ts` | Every POST now has a size limit (413 with a spoken message), so `next dev` no longer buffers a body of any size. Ask says "That question is too long". Speak keeps `language_code` when it falls back to the default voice. |
| `lib/analyze.ts`, `lib/frameCheck.ts` | The correct `media_type` for PNG, WebP and GIF. The `recentScanId` lookup runs in parallel with the cache read. New `persist: "defer"` mode. |
| `lib/db.ts` | Schema setup runs in one transaction (about 1 s down to about 90 ms per cold instance). New `countScans`. Hat streak and read-claim compare keys by word overlap (`&&`). |
| `lib/hat.ts` | `matchKey` / `sameTarget`: keys become word sets, without type words or words under 3 letters. |
| `app/api/device/frame/route.ts` | Uses match keys, so the same target is counted and deduplicated across frames even when its key wobbles. The answer event is posted at the same time as the scan write. |
| `app/api/ask/route.ts` | Sends `scansToday`/`totalScans` from a count query (in the user's time zone). Tells the agent to search in English and to search before saying something isn't there. |
| `app/components/landing/landing.css` | `--ink-2` is now `#505055`, which meets AAA on the grey sections. |
| `app/layout.tsx` | `metadataBase` comes from `VERCEL_PROJECT_PRODUCTION_URL`, so `og:image` is no longer `http://localhost:3000/…` when deployed (Devpost and Slack previews). |
| `docs/HARDWARE.md` | The board header is `x-device-id`, not `x-sightline-device`. |

Note: other agents edited `lib/db.ts`, `app/api/device/frame/route.ts`, `lib/modes.ts`, `app/api/features/route.ts` and `scripts/db-setup.mjs` at the same time (the `status` event kind, `frameStore`, `hatCommands`). The edits sit side by side, and lint, the type check and the build pass on the combined tree.

## 4. Open issues, ranked

| # | Severity | Issue | Suggested fix |
| --- | --- | --- | --- |
| 1 | High (demo) | The Harbor Table web lookup describes a *real* restaurant in Maine with different hours. A judge sees "From the web" contradict the menu. | For the Bright Data moment, use a real product, ideally an OTC medicine box with a known recall (Advil returned a Class II recall). Or turn Auto lookup off for the fictional menu. |
| 2 | High (mobile) | `useAutoCapture` needs the *identical* key on two frames in a row, both to show the detection card and to auto-read. Keys wobble even on the same image (see the hat bug), so auto-read can fail to fire, and re-arming can read the same item twice. | Port `matchKey`/`sameTarget` from `lib/hat.ts` into `mobile/src/useAutoCapture.ts`. |
| 3 | High (mobile) | `npx tsc --noEmit` in `mobile/` fails right now: `App.tsx:876` passes `commandsOn` to `HatView`, and `Demo` has no `hatAsking`. This looks like work in progress from the other agent. | Finish or revert it before the Expo bundle is demoed. |
| 4 | Medium | Hat pairing: every poll from any phone with the pair code re-pairs the hat (`pairHat` on owner mismatch). Two pollers, such as `sim-board --watch` and the iPhone, will flap, and hat scans land in the wrong history. | Run only one poller during the demo. Better: pair only when the phone isn't already paired, or on an explicit pair action. |
| 5 | Medium | Spoken answers in Describe and Read often run 36 to 42 words. Read mode can misspell words ("Reveiler"). | Tighten the prompt ("at most 25 words for scenes") and bump `PROMPT_VERSION`. Doing that now would throw away the warm demo caches, so do it before re-warming, or leave it. Use Menu / Label mode for the medicine demo. |
| 6 | Medium | Translate on a generic sign can set `itemKind: place` and run a useless lookup ("Calle Mayor street sign"). | Prompt: in Translate mode, use `none` unless a business is named. |
| 7 | Low | A cached repeat that arrives before the first answer's `after()` insert gets a new `scanId`, which adds a duplicate history row. | Fine for the demo. |
| 8 | Low | When `/api/lookup` proposes the query itself (no `webQuery`), Claude writes a slightly different query each time, so the cache never hits (5.7 s on the repeat). | Cache the proposal by a hash of the context. |
| 9 | Low | After any database error, `withDb` turns the database off for 60 s (`BACKOFF_MS`) for *every* query, including a single bad query. | Only back off on connection or timeout errors. |
| 10 | Low | There's no cleanup route for hat rows (`device_events` grows without limit). | A TTL delete in `after()` on `/api/device/next`, for example events older than 1 day. |
| 11 | Low (mobile) | `getHistory` reads `x.image`, but the server sends `imageUrl`. `lookup()` never sends `language`, so web summaries in Translate mode are in English (the web app sends it). Auto-capture never sends `key` to analyze. | Contract fixes in `mobile/src/api.ts` and `App.tsx`. |
| 12 | Low (mobile) | `speech.preview()` sets `draining` but never drains the queue, so a `speak(…, {queue:true})` during a preview is lost until the next speak. `hint()` can overlap queued speech. Every speech clip is written as a new mp3 to the cache folder and never deleted. `transcribe()` and `clearHistory()` have no timeout. | Small fixes in `src/speech.ts` and `src/api.ts`. |

Checked with no problem found: all SQL is parameterized through Neon's tagged templates (the only `db.query` calls take the static schema). The Ask tools run fixed queries scoped to the device ID, and returned scan IDs are filtered to ones the tools actually returned. The hat key comparison is constant-time (sha256 and `timingSafeEqual`). The pair code is an HMAC. The `voiceId` regex blocks path injection.

## 5. Track audit

Scores out of 5, against idea / demo / technical complexity / completion.

| Track | Demoable feature that hits it | Strength | Single best improvement |
| --- | --- | --- | --- |
| **Best Overall** | A $15 hat camera reads a label hands-free, and the phone speaks the answer, the allergens or warnings, and then the web recall check. Then "What were the warnings on what I scanned?" | Idea 5, demo 4 (if the hotspot holds), complexity 5 (vision, structured output, a tool-use agent, hardware and an event queue), completion 4. **Strong.** | Rehearse one unbroken 3-minute run: hat button press → answer → web recall → Ask your history. Record it tonight as the fallback video. |
| **ElevenLabs** | Flash v2.5 voice for every answer (about 200 ms to first byte, chunked and prefetched), 13 languages with `language_code` locked, a voice picker, and Scribe for voice commands and questions. | **Medium–strong.** Text-to-speech and speech-to-text are used well, but they're "standard" uses. There's no conversational agent. | Show it live: translate the Spanish sign into French or Japanese in a native voice, then ask a spoken question (Scribe). Mention the ~200 ms first audio and the chunk prefetch. |
| **Bright Data: Data for Good** | A SERP check after every medicine or food scan: FDA recalls first, allergens for restaurants, sources and a product photo on screen. | **Medium–strong** if demoed with a real medicine that has a real recall. **Weak** with the fictional menu (wrong restaurant). | Demo a real OTC box. Optional small upgrade: add a second, recall-only query (`<name> recall site:fda.gov`) for medicine, so "no recall found" is backed by FDA itself. |
| **Neon: Database / Agent Backend** | The analysis and lookup caches (repeats in about 100 ms), per-device history, a `tsvector` with a GIN index for full-text search, a Claude tool-use agent over Neon, and hat state with atomic read claims plus an event queue the phone polls. | **Strong.** Neon is load-bearing: the hat can't work without it, and the agent's memory lives there. | During Q&A, show the Neon console: the `scans` rows appear as you scan, and the `device_events` queue fills. Say "the agent can only run 3 fixed, parameterized, device-scoped queries." |

**Other tracks:**
- **GoDaddy Registry domain: yes, cheap and legitimate.** Register a free MLH domain (for example `sightline.tech`) and point it at Vercel. It takes about 15 minutes, and a nice name also helps the Devpost link.
- **Vultr: possible but weak.** It would mean hosting `next start` on a Vultr VM instead of Vercel (about 30 to 45 minutes, plus a TLS setup the ESP32 has to trust). It wouldn't change the product, so it's not worth it this late.
- **MLH Gemini: no.** Swapping one call to Gemini wouldn't be a "best use", and it adds risk.
- **Tiger Data: no.** It would duplicate Neon.
- **Solana: no fit.**
- **SpaceX AI A-Team:** the criteria come from the Saturday talk and Slack. Check them; there's no code change to make.

## 6. Demo-readiness (3 minutes at the table)

| Risk | What happens | Mitigation |
| --- | --- | --- |
| Venue Wi-Fi or hotspot | The ESP32 needs 2.4 GHz WPA2. eduroam and UCSD-Guest block it. The phone has to reach the server. | iPhone hotspot with **Maximize Compatibility** on and an ASCII name. Keep a second teammate's hotspot ready. Have `hardware/sim-board.mjs` as the fallback for the board, plus the recorded video. |
| Vercel cold start | The first call after idle pays the function start and the Neon connection (now about 0.4 s, down from about 1.4 s, which could miss the cache). | Two minutes before each judge, open `/api/features` and run one analyze and one lookup (a warm-up `curl` script). |
| First live capture is slow | 2 to 3 s to the answer, and 4 to 5 s for the hat (two frames plus the read). | Use the hat **button** (it reads on that frame) instead of waiting for auto-read. Keep talking while it says "Looking". |
| Bright Data latency | Cold lookups take 4.5 to 7.6 s. Bright Data sometimes returns empty (the hedge retries). The hard cap is 15 s. | Pre-warm the lookups for the exact demo items (cached for 24 hours). The answer never waits for the web, so narrate the first answer while the web summary arrives. |
| Wrong web facts | Harbor Table resolves to a real restaurant in Maine. | Use a real product box for the web part (see issue 1). |
| Pairing flaps | A second poller steals the hat. | Only the demo iPhone polls. Don't run `sim-board --watch` at the same time. |
| Expo Go | It must stay in the foreground, and the mobile type check is currently failing (work in progress). | Lock the screen orientation, turn off auto-lock and keep the app open. Check `npx tsc --noEmit` and do a fresh `expo start` after the other agent finishes. |
| Noise | The judge can't hear the phone. | Volume at maximum, a Bluetooth speaker or the phone held up, and the answer is on screen in large type. |
| Production deploy drift | The judged URL may run old code or be missing env vars (`DEVICE_SHARED_KEY`, `BRIGHTDATA_SERP_ZONE`). | Redeploy after the last commit (before 12:00 Sunday) and check that `/api/features` on production returns all `true`. |
