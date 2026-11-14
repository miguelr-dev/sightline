# SightLine final QA (Sat 14 Nov, 2:10 PM)

This QA pass tested the camera pipeline, answers, web lookup, barcodes, the hat camera, and the requests in the 3-minute judge demo against the dev server on :3000, which runs with real keys. The mobile client was reviewed read-only. Test scripts and raw outputs are in the scratchpad, under `qa/scripts` and `qa/out`.

- **Images:** the 4 `public/demo` images, the real slide photo (`img6657.jpg`), and front photos of Cheerios, Doritos, Advil (in a shopping cart), Oreo and Nutella from Open Food Facts. There's also a Red Bull label, a desk with a laptop, a keyboard close-up, and the same desk with a small Doritos bag on it.
- **Sizes:** the same as the app uses: 512 px at q0.5 for frame-check, and 1024 px at q0.6 for analyze.
- **Cleanup:** every `qa-` device's history was deleted, the QA hats were unpaired, and their hat rows were removed.

## Results by area

| Area | Result | Numbers |
| --- | --- | --- |
| Frame-check key stability (with `lastKey`, as the app sends it) | **Pass** | 50/50 frames kept one key across 5 crops and rotations of 10 items. Without `lastKey`, raw keys varied (for example `advil`, `advil-ibuprofen`, `advil-ibuprofen-tablets`), but all of them matched under `sameItem`. Switching to a different item took 2 frames (correct). |
| Incidental objects | **Pass** | A desk with a laptop, a laptop showing a document, a keyboard close-up, and a desk with a small Doritos bag were all `detected:false` (4/4). The room scene was detected as "Exit sign" (minor). |
| Dark and blurry frames | **Pass** | A black frame gave the hint "Too dark". At 12% brightness, Cheerios and the menu were still read (fine). Blurry menus and medicine gave `ready:false` with hints such as "Hold still". |
| Frame-check latency | **Pass** | 0.7–2.7 s, typically 1.0–1.8 s. |
| Analyze, AUTO | **Pass** | 12/12 chose the right mode: menu for products, translate for the Spanish sign, read for the slide, describe for the room. Cold: 1.6–3.6 s on its own, 7–8 s with 4 requests at once. Cached: about 0.4 s. |
| Spoken length (25-word target) | **Partial** | 41/53 answers were 25 words or fewer. The long ones: the room in Describe/AUTO (48 words), the slide in Read/Describe/Translate (35–41), and Read on the room (32). |
| Content-first openings | **Partial** | 2 slips: Read on the room starts "This is a room…", and Describe on the slide starts "A slide with three bullet points". Describe on Advil adds "The box is resting on a wire shelf." Nutella adds "with a festive knitted sweater design". |
| Allergens and warnings | **Pass** | Every medicine answer carried "allergy alert, may cause stomach bleeding". Answers to "Is this gluten free?" and "Does this have nuts?" were correct. |
| Read verbatim | **Fail** | Read on the Spanish sign gives an English translation ("Warning sign: Sidewalk work ahead…") instead of "PRECAUCIÓN. Obras en la acera…". Read on the menu paraphrases and says "$7.50". |
| Translate | **Pass** | French, Japanese and Spanish were entirely in the target language. Section titles were in English for 2 of 6 French answers (minor). |
| Ask while looking | **Pass** | 12/12 utterances were interpreted correctly ("what does this say", "is this gluten free", "translate this to French", "search for this" and "look this up" set `autoLookup:true`, "how many can I take a day"). |
| Web lookup | **Pass, slow** | Medicine puts the recall first: Advil got the FDA Family Dollar recall notice. Cold: 4.6–9.1 s (Advil 9.1 s, Cheerios 8.5 s). Warm: 76–142 ms. A sign with no query is skipped. Spoken length was 24–46 words (target about 35). Harbor Table still resolves to the real restaurant in Maine. |
| Barcode | **Pass, with data problems** | Diet Coke, Nutella, Cheerios, Oreo and Doritos were found in 0.2–0.9 s, and cached hits took 0.08–0.5 s (once 1.8 s). A bad check digit, 5 digits or letters gave HTTP 400 with a spoken message. An unknown code gave "couldn't find" in 3.5 s cold and 0.2 s warm. An unknown drug UPC took **5.9 s**. Spanish output: 2.7 s, fully translated. |
| Ask your history | **Pass** | 1.2–4.5 s. Recall, warnings, salmon price, counts and "Did I scan any Pepsi?" (none) were all correct. A Spanish question got an English answer, because the app sends no `language`. |
| Hat | **Pass** | 2 pollers: B got 409 `paired-elsewhere` on every poll while A held the hat. A command before any frame gave `no-frame`, and one from B gave `unpaired`. Auto-read happened on the 2nd ready frame. The button read on its own frame (answer in 1.4 s). Voice commands answered in 1.1–3.9 s ("vegan?", "translate to French", "cheapest dessert"). The command was rejected 16 s after the last frame (`no-frame`). Unpair by the non-owner returned false, unpair by the owner returned true, then B paired. |
| Mobile checks | **Pass** | Mobile `npm test`: 102/102. `tsc --noEmit`: clean. `expo-doctor`: 20/20. Root `npm test`: 196/196. Root `npm run lint`: clean. |
| Mobile code review | **Fail (barcode + Detect)** | The details are under the defects below. Contract fields, the silent web card, AUTO fallback, accessibility labels and gestures all pass. |
| Demo dry run (3 runs) | **Pass** | Total server time: 18.2 s, 10.5 s and 17.7 s. Each step finished in under 4 s except the cold web lookup (5.0 s; it's a silent card, so the user doesn't wait for it) and one ask-history call (4.5 s). |

## Demo dry run (server calls in order; times are runs 1 / 2 / 3)

1. **Features:** 79 / 78 / 94 ms, all `true`.
2. **Frame-check, twice, on the Red Bull can:** 1.2–2.3 s each. The key was `red-bull` both times, so the card is steady.
3. **Tap the card (analyze AUTO with `key`):** 2.6 / 1.9 / 2.1 s. The answer was "Red Bull Energy Drink, 8.4 fluid ounces, 250 milliliters." (9 words).
4. **Speak the answer:** first byte in 264–332 ms.
5. **Lookup:** 5.0 s cold, 126 ms warm. **The front-of-can photo has no Nutrition section** (only Size and Note). Nutrition is in the web card ("80 mg caffeine, 27 g sugar") and in the barcode result.
6. **Listen to the web summary:** first byte in 224–300 ms.
7. **Barcode 049000028911:** 0.08–1.8 s. **This is Diet Coke, not Coca-Cola, and it says "144 fl oz"** (the 12-pack).
8. **Ask "How much caffeine was in the drink I scanned?":** 2.4 / 2.9 / 4.5 s, correct. In run 1 it said the Red Bull caffeine wasn't known, because the lookup hadn't been saved to the scan yet.
9. **Hat command "what's the cheapest dessert":** 3.9 / 1.1 / 3.3 s. The answer was correct ("Lemon Sorbet at six dollars and fifty cents"), but `mode` is "describe".

## Defects, ranked

| # | Sev | Defect and exact repro | Owner |
| --- | --- | --- | --- |
| 1 | **High** | **A barcode seen only once switches Detect off.** `takeFrame` returns null while `barcodeState.pending` is set (`App.tsx:466`). Nothing expires `pending`: the tick only expires `confirmed` (`logic/barcode.ts`, `tick`). **Repro:** Detect on, a barcode passes through view for less than 500 ms, then point at a menu. No card appears until a sheet opens and closes. | Mobile: `src/logic/barcode.ts`, `App.tsx` |
| 2 | **High** | **The barcode card gets stuck, and Detect stays off.** `sheetClosed` clears `confirmed` but leaves `barcodeCard` set, and the "gone" tick needs `confirmed`. **Repro:** the barcode card is showing, open Settings/Recent or tap the shutter, close it, then take the can away. The card stays forever, tapping it reads the old product, and frame-check is blocked. | Mobile: `App.tsx:618-623`, `logic/barcode.ts` |
| 3 | **Med-High** | **A voice question is still answered after Done.** `stopRecording` takes its speech token after `await recorder.stop()`, so the cancel from closing doesn't apply. Recent's onClose never stops recording at all. **Repro:** Result, then Ask by voice, speak, tap Done. The answer is spoken anyway. | Mobile: `App.tsx` around `:863`, `:1195`, `:1579` |
| 4 | **Med** | **Key stabilizing merges different products that share a generic word.** `stabilizeKey` and `sameItem` treat a shared word such as "energy", "drink" or "cookies" as the same item. **Repro:** POST `/api/frame-check` with the Oreo frame and `lastKey:"nutter-butter-cookies"`. It returns `key:"nutter-butter-cookies"`. A Monster can with `lastKey:"red-bull-energy-drink"` returns the Red Bull key. The card keeps the old label ("Nutter Butter cookies") while the user holds Oreos, which matters when comparing two brands in a shop. The hat's 2-minute claim has the same problem. | Server: `lib/frameCheck.ts` (`stabilizeKey`), `lib/hat.ts`. Mobile: `logic/autoCapture.ts`. Drop category words, or require the first (brand) word to match. |
| 5 | **Med** | **A blurry medicine label gets made-up facts.** On a blurred DEMO-PRIN label (1024 px), AUTO answered "**30 tablets**" (it's 50) and left out the warnings, with no retake tip. Doritos: "Best by 14 July **2025**" in AUTO and "**2024**" in Describe, while the printed year is cut off. | Server: `lib/prompts.ts`. For medicine, if a figure isn't sharp, say it can't be read and give a retake tip. Never fill in dates or digits. |
| 6 | **Med** | **Read mode isn't word for word.** The Spanish sign in Read comes out as an English translation. The menu in Read is paraphrased and uses "$". | Server: `lib/prompts.ts` (Read) |
| 7 | **Med** | **Hints are spoken without being asked.** Detect hints ("Too dark", "Move back") and hat hints use the device voice (`App.tsx:464-470`, `:693-697`). This breaks "nothing talks unless asked". The same rule also means a detected item that isn't ready gets no tip ("Hold still, too blurry" is dropped). | Mobile, plus a product decision |
| 8 | **Med** | **Barcode data quality.** The demo code 049000028911 is Diet Coke, described as "144 fl oz" (12-pack). Oreo says "Serving: 3g, 14 calories, 1.2 grams of sugar" (bad Open Food Facts data, spoken as fact). Nutella says "400 g e" (the ℮ symbol). Doritos says "1 grams". | Server: `lib/barcode.ts`. Sanity-check the serving size, strip ℮, fix the plural. **Test the exact can you'll use.** |
| 9 | **Med** | **A drug UPC found in Open Food Facts never reaches openFDA.** Advil 305730150309 gives "Advil 50 tablets. No allergen information." with `itemKind food_drink`, no uses and no recall check. | Server: `lib/barcode.ts` `lookupBarcode`. Try openFDA first when `isDrugUpc`. |
| 10 | Med | **The hat polls in the background, and the backlog is replayed when the app returns.** Old answers can be spoken. | Mobile: `src/useHatCamera.ts` |
| 11 | Med | **Hat auto-reads open the result sheet and speak**, even over Recent or Settings. This is by design for a hands-free hat, but check that it's wanted. | Mobile `App.tsx:721-747` and server `device/frame` |
| 12 | Low | **"Asking your hat…" sticks after a failed command** (a `status` event never clears it). | Mobile: `logic/hatCommands.ts` |
| 13 | Low | **Spoken length:** Describe on a room is 48 words, and the web summaries run 24–46 words. | Server: prompts |
| 14 | Low | **Harbor Table web lookup is still the restaurant in Maine.** | Demo choice: don't use the menu for the web part |
| 15 | Low | **Hat command answers report `mode:"describe"` for a menu question**, and `$6.50` appears in a question answer. | Server: `app/api/device/command/route.ts` |
| 16 | Low | **A Spanish question to Ask history gets an English answer** (the app sends `language` only from Settings). | Mobile `api.ts` (or the server detects the language) |
| 17 | Low | **`npm run sim -- --help` has no help.** It starts streaming frames to **hat-01**. I hit this by accident for about 60 s at 2:04 PM. Its 24 events and 6 `hat-hat-01` scans were deleted. | `hardware/sim-board.mjs` |
| 18 | Low | **Cold lookups take 4.6–9.1 s, and an unknown drug UPC takes 5.9 s.** | Pre-warm the demo items |

## Demo-readiness

**Verdict: ready, if the demo script is adjusted and fixes 1 and 2 land.** The server side handled the full demo 3 times with no failures, and every step the user hears finished in under 4 s.

**Top 3 before tomorrow:**
1. **Mobile:** fix the barcode `pending` and stuck-card bugs (#1 and #2). Either one can quietly switch off Detect in the middle of the demo.
2. **Mobile:** stop voice questions from speaking after Done (#3), and decide whether hints may speak at all (#7).
3. **Demo script and server:**
   - Open **Nutrition in the web card or in the barcode result**, not in the first answer: a front-of-can photo has no Nutrition section.
   - Scan and pre-warm the **exact can** you'll use, because 049000028911 is a Diet Coke 12-pack.
   - Pre-warm the lookups.
   - If there's time, tighten the medicine prompt so it says unreadable instead of guessing (#5).
