# SightLine regression check (Sat 14 Nov, evening)

This was a report-only pass before the Sun 15 Nov demo. No tracked files were edited. It checked:

- the server on `:3000`, which runs with real keys;
- the Expo Go app, reviewed read-only, with its iOS bundle fetched from Metro.

Out of scope: `/new` (the landing page), `hardware/` and the hat routes.

Scripts and raw output are in the scratchpad at `regress/`: `harness.py`, `run1.json` to `run3.json`, `speak.mts`, `chunk.mts` and `lk.py`. Requests were built the way `mobile/src/api.ts` builds them: a 1024 px JPEG at quality 60, base64, with a fresh `regress-…` device id on each run. Each run changed one pixel, so every photo answer was cold. History was deleted after every run, and a check after each delete confirmed 0 scans.

## Gates

| Gate | Result | Time |
| --- | --- | --- |
| root `npx eslint .` | **PASS**, exit 0, no warnings | 12.7 s |
| root `npx tsc --noEmit` | **PASS**, exit 0 | 9.7 s |
| root `npm test` | **PASS**, exit 0, 344/344 tests in 24 files | 9.3 s |
| mobile `npx tsc --noEmit` | **PASS**, exit 0 | 11.4 s |
| mobile `npm test` | **PASS**, exit 0, 190/190 tests in 12 files | 7.0 s |
| mobile `npx expo-doctor` | **PASS**, exit 0, 20/20 checks | 10.6 s |
| iOS bundle (Metro `:8081`, `platform=ios`, hermes) | **PASS**, HTTP 200, 4.77 MB, no transform or resolve errors | 4.1 s |
| `next build` | **Skipped**, because it would share `.next` with the running dev server | n/a |

## Live demo script, run 3 times (P = pass, F = fail; time in seconds)

| Step | Run 1 | Run 2 | Run 3 | Notes |
| --- | --- | --- | --- | --- |
| AUTO, Kirkland can back (`kirkland_back3.jpg`) | P 3.44 | F 2.84 | F 2.17 | Mode `menu` every time, and the caffeine warning is spoken. The printed barcode 196633831439 was read and found. **F: a "Not visible" section came back under a different title** (D2). |
| AUTO, Kirkland can front (`public/new/kirkland.webp`) | P 2.42 | F 2.49 | P 1.90 | Brand "Kirkland Signature" each run; 15 words. F: same as D2 ("Size and price … Price not visible"). In a repeat call, run 3 also gave "Ingredients and nutrition: … aren't visible". |
| AUTO, menu (`demo/menu.jpg`) | P 2.37 | P 2.26 | P 2.01 | Mode `menu`, 26 words, "ask about allergens" every time. |
| AUTO, Spanish sign | P 1.97 | P 1.82 | P 2.29 | Mode `translate`, content first, no "Not visible". |
| AUTO, medicine label | P 2.77 | P 2.16 | P 2.57 | Warnings and expiry are spoken. |
| Extras (run 1): `new/menu`, `new/sign`, `pills`, `new/barcode` | P 1.9–2.5 | n/a | n/a | Pills: the strength isn't readable, so it gives a retake tip instead of guessing. |
| AUTO repeat of the same photo (cache) | P 0.07 | P 0.09 | P 0.26 | `cached:true` |
| `GET /api/barcode` 044000046316 (Nutter Butter) | P 1.01 | P 0.11 | P 0.08 | "Contains gluten, peanuts and soy." |
| `GET /api/barcode` 049000028911 (Diet Coke) | **F** 0.07 | **F** 0.08 | **F** 0.07 | **"12-pack of 12 fl oz"** (D3) |
| `GET /api/barcode` 300450406026 (Tylenol) | P 0.43 | P 0.09 | P 0.07 | The recall comes first: "recalled November 2025 for defective container". |
| `GET /api/barcode` 12345 (invalid) | P 0.01 | P 0.01 | P 0.01 | 400 `bad-code` |
| `/api/lookup` Kirkland front (brand sent) | **F** 0.10 (cached) | **F** 5.41 | **F** 0.08 (cached) | Sources are all Kirkland and there's no Celsius. **No hero image** (D4). |
| `/api/lookup` Kirkland back (barcode query) | P 5.07 | P 0.07 | P 0.08 | Open Food Facts image of the exact product; Kirkland sources; no Celsius. |
| Book page (rendered page 42) | P 2.37 | P 2.44 | P 2.33 | Full text, 6 sentences, 16-hex signature, `complete:true`, page "42" |
| Book question ("Where was the key hidden?") | P 2.50 | P 1.71 | P 1.98 | "under the third stone of the old lighthouse wall" |
| Menu conversation, turn 1 | P 2.66 | P 1.87 | P 2.44 | Lists the vegetarian dishes. |
| Menu conversation, turn 2 ("which is cheapest") | P 2.62 | P 2.05 | P 1.63 | Uses turn 1 correctly. |
| Menu conversation, turn 3 ("does that one have allergens") | P 2.46 | P 1.60 | P 1.89 | Run 1 asked back "Which dish do you mean?" (D18). |
| Looking: "what does this sign say" | P 2.10 | P 1.27 | P 1.45 | Read mode; **verbatim Spanish, not translated** (D7) |
| Looking: "translate this to French" | P 2.30 | P 1.71 | P 2.41 | `interpreted {translate, French}` |
| Looking: "search for this" | P 0.08 | P 0.09 | P 0.08 | `autoLookup:true`, served from the cache |
| `/api/ask` "What have I scanned so far?" | P 4.92 | P 2.83 | P 4.46 | |
| `/api/ask` "warnings on the energy drink" | P 2.46 | P 1.57 | P 2.32 | Gives the right caffeine warning. |
| `/api/ask` "What did the Spanish sign say?" | P 2.13 | P 2.06 | P 1.87 | Gives the original and its meaning. |
| `/api/speak` with the unit and number text | P 0.45 | P 0.44 | P 0.38 | 200 `audio/mpeg`, about 144 KB |
| `DELETE /api/history` | P 0.07 | P 0.08 | P 0.08 | 0 scans afterwards |
| **Total** | **28/30** | **22/26** | **23/26** | Every failure is D2, D3 or D4. |

**Text sent to ElevenLabs**, from `speakable()` in `lib/speechText.ts` run directly with tsx. The mobile copy gives the same output.

- In: `Fat 0g, Sodium 105mg, 12 fl oz, $7.50, 08/2027.`
- Out: `Fat zero grams, Sodium one hundred five milligrams, twelve fluid ounces, seven dollars and fifty cents, August twenty twenty-seven.` **PASS**

**Timings.**

| Step | Time |
| --- | --- |
| Spoken answers: AUTO, book, follow-ups, ask while looking | 1.3–3.4 s |
| Ask history | 1.6–4.9 s |
| Cold web lookup | 5.1–7.3 s |
| Anything cached | under 0.3 s |
| First speech clip | about 0.4 s |

## Defects, ranked

| # | Sev | Defect | Exact repro | Where |
| --- | --- | --- | --- | --- |
| D1 | **HIGH** | **A server address that changes (hotspot, new Wi-Fi) means about 55 s of silence.** The URL is baked in at Metro start from `EXPO_PUBLIC_API_URL`. The server is checked only at launch or when the URL changes. When the old IP is on another subnet, a capture just shows "busy" until the 55 s abort, then says "That took too long". The barcode card and Detect also stop with no message. | `curl -m 20 http://10.255.255.1:3000/api/features` hangs for the full 20 s (exit 28). An IP on the same subnet fails fast (exit 7). On the phone: launch on Wi-Fi A, then switch the Mac to a hotspot and tap Capture. | `mobile/src/api.ts:99` (55 s), `mobile/App.tsx:268-271` (checked only on a URL change), `mobile/App.tsx:567` (barcode needs `features.barcode === true`) |
| D2 | MED | **"Not visible" sections still get through.** The filter checks titles only, so the model puts the same content under another title. On the can back, the section says "Nutrition … not visible, turn the can" right above "Nutrition, per serving (from barcode)". | AUTO on the 1024 px `kirkland_back3.jpg`: 2 of 3 runs gave "Ingredients and nutrition: Not visible on this label…". | `lib/analyze.ts:200-206` (`EMPTY_SECTION` tests `s.title` only) |
| D3 | MED | **A single Diet Coke can is announced as a 12-pack.** Open Food Facts lists `quantity:"144 fl oz"` and `serving_size:"1 can (354.9 mL)"`, and `unitSize()` turns that into "12-pack of 12 fl oz". This is the cached `b4` answer, and it's the same in all 3 runs. | `curl 'localhost:3000/api/barcode?code=049000028911'` | `lib/barcode.ts:183-201` |
| D4 | MED | **The Kirkland front lookup usually has no product picture.** The image search gets only 300 ms after the summary finishes, and the result is cached for 24 h without the image. In 4 cold tries, 1 had an image, and that one was a `pbs.twimg.com` post. The cached copy used in the demo has none. | POST `/api/lookup` with the query "Kirkland Signature Sparkling Energy Drink Orange 12 oz nutrition facts caffeine sugar price" and `brand:"Kirkland Signature"`: `image` is empty. | `lib/lookup.ts:30` (`IMAGE_GRACE_MS = 300`), `lib/lookup.ts:226` (caches the result without an image) |
| D5 | MED | **The phone's speech splits prices in two.** `chunk()` treats the "." in "6.50" as the end of a sentence. When that falls on the 140-character first-chunk limit, the voice says "…vegetarian for six." and then "fifty dollars." | Run 1, conversation turn 1: "…Lemon Sorbet is also vegetarian for 6.50 dollars." Script: `chunk.mts`. | `mobile/src/speech.ts:18` |
| D6 | MED | **A menu price range is read as a decimal.** "6.50 to 24 dollars" becomes "six point five zero to twenty-four dollars". This happens on the menu's first answer in every run. The "dollars" rule only matches a decimal right before the word "dollars". | `speakable("…desserts, 6.50 to 24 dollars.")` | `lib/speechText.ts:90`, plus the mobile copy |
| D7 | MED | **"What does this sign say" on the Spanish sign reads the Spanish aloud.** It is spoken by an English voice (`language_code:"en"`), with no translation. AUTO alone translates the same sign correctly. | POST `/api/analyze` with `{mode:"auto", utterance:"what does this sign say"}` and the Spanish sign gives `interpreted.mode:"read"` and "Precaución. Obras en la acera…" | `lib/voice.ts:121`, `mobile/App.tsx:1325` |
| D8 | MED | **Book "Ask about this page" ignores book mode and the conversation so far.** `askBook` sends neither `book:true` (which gets the page's exact text) nor `conversation`, so "she", "that" and similar words in a second question aren't resolved. | Code reading | `mobile/App.tsx:1143` |
| D9 | LOW | **Units in capitals aren't spelled out.** "12 FL OZ", "200 MG" and "0G" stay as letters. This affects Read mode and section "Read all", for example the can's Details section. | `speakable("12 FL OZ (355 mL). 200 MG CAFFEINE")` gives "twelve FL OZ … two hundred MG" | `lib/speechText.ts:9-18` (the patterns are case-sensitive) |
| D10 | LOW | **"fl oz." swallows the end of the sentence.** "…twelve fluid ounces No allergens listed." comes out as one run-on sentence. | `speakable` on the Diet Coke answer | `lib/speechText.ts:9,16` (`oz\.?`) |
| D11 | LOW | **Some numbers are read wrongly.** "2000 calorie" becomes "twenty hundred calorie". "9:00 AM" becomes "nine o'clock AM". "619-555-1234" is read as three cardinals. | `speak.mts` | `lib/speechText.ts:96-103` |
| D12 | LOW | **Read mode on a package with a printed barcode isn't word for word.** The barcode identity replaces the transcription, so the Kirkland back in Read says only "Kirkland Energy Drink, Tropical. Not recommended…". | POST `{mode:"read"}` with `kirkland_back3` | `lib/analyze.ts:433` (skips `translate` but not `read`) |
| D13 | LOW | **When Neon is down, the history routes hide it.** GET returns 200 `{scans:[]}` and DELETE returns 200 `{deleted:0}`, so the app says "History cleared" and Recent looks empty. Photo answers still work because DB calls give up after 1.5 s and then pause for 60 s. | Code reading | `app/api/history/route.ts:16,28`, `lib/db.ts:140-156` |
| D14 | LOW | **A BARCODE-mode result drops `brand` and `webQuery`.** A manual "Look up" then says the brand is unconfirmed and shows no picture, even though the barcode named the brand. | Code reading | `mobile/App.tsx:626` |
| D15 | LOW | **BARCODE mode goes silent when a lookup fails.** If `lookupBarcode` fails or takes longer than 12 s, nothing is spoken, and the code isn't tried again while it stays in view. | Code reading. Unknown codes answered in 1.6–4.0 s here, so this is unlikely. | `mobile/App.tsx:588-589`, `mobile/src/logic/barcode.ts` (`confirmed`) |
| D16 | LOW | **A hung ElevenLabs means up to 9 s of silence** before the device voice takes over, which then stays on for 30 s. A 502 or a bad voice id falls back right away (tested: a bad `voiceId` gave 200 with the default voice). | Code reading | `mobile/src/api.ts:163`, `mobile/src/speech.ts:229-245` |
| D17 | LOW | **A manual capture right after closing a sheet doesn't wait for the camera to settle.** Only auto frames wait `CAMERA_SETTLE_MS`, so the first photo could be dark. Not seen on a device. | Code reading | `mobile/App.tsx:837-842` |
| D18 | LOW | **The pronoun follow-up is unreliable.** "Does that one have any allergens?" got "Which dish do you mean?" in 1 of 3 runs, even with the conversation passed. | Run 1, turn 3 | `lib/prompts.ts:129-135` |
| D19 | LOW | **A type is out of date.** The `AnalyzeRequest` type has no `book` or `conversation` fields; the route accepts both. | n/a | `lib/modes.ts:53-60` |

**Mobile review: what passed.**

- **Speech stopping.** Every way out of a sheet calls `silence()`. Speech tokens are taken before any await, so stopping recording respects the token. Recent's close stops recording.
- **Barcodes.**
  - A 12-digit `ean13` is treated as UPC-A.
  - An unconfirmed sighting expires after 700 ms.
  - The card is cleared whenever a sheet opens.
  - BARCODE mode opens and speaks a code once, then holds it for 3 s after the sheet closes.
- **Camera.** The capture card wins over the Detect card. The camera uses `animateShutter={false}`, the photo preset and no shutter sound on auto frames, and dark auto frames are filtered out.
- **VoiceOver.** Every Pressable in the changed components has a label. The brackets are hidden from VoiceOver. Hints are announced, never spoken.
- **Request and response fields.**
  - `brand` and `barcode` are parsed from the analyze reply, and `brand` is passed to `/api/lookup` (`App.tsx:346`).
  - `parseBarcode` is shared between the barcode route and the analyze reply.
  - These are all sent as the server expects: `utterance`, `conversation`, `book`, and `language` only for Translate.

**What failures look like to the user** (D1 covers the server address):

| Failure | What happens |
| --- | --- |
| Bright Data times out | The server stops after a 15 s budget with "The web search took too long". An automatic lookup hides the card quietly; a manual one speaks that message. |
| ElevenLabs fails | The phone's own voice takes over, with units and numbers spelled out. |
| Neon down | Answers still work; history fails as in D13. |

## Demo-readiness

**Verdict: ready, with demo-script workarounds.**

- Every core step passed 3 of 3 times, with answers in 1.3–3.4 s, and all gates are green.
- The failures are content quality (D2, D3, D4) and how things sound (D5, D6). Nothing crashes.

**Before 12:00 PM on Sunday:**

1. **D1:** fix the Mac's IP for the venue, or know where Settings → Server address is. Open the app on the venue network and check that "Can't reach the server" isn't showing.
2. **Barcode scan:** don't scan Diet Coke 049000028911. Use Nutter Butter, Tylenol or the Kirkland back.
3. **Web card:** show it from the Kirkland back (barcode path), not the front, to get the product picture. Or warm a fresh front lookup and check for an image.
4. **Quick fixes:** D2 (also filter on the section body) and D6 or D5 (don't split or decimalize "N.NN") are each a line or two, but they need a commit before the cutoff.
