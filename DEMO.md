# SightLine: 3-minute demo script

## Before you go on stage (10 minutes before)

- [ ] Open the deployed URL on the demo phone, tap **Start SightLine**, and allow the camera. Do one test capture so the camera and speech permissions are already granted.
- [ ] Phone volume at maximum, silent switch off, Do Not Disturb on. Turn off auto-lock.
- [ ] Mirror the phone screen to the projector (QuickTime on a Mac over USB for iPhone, or scrcpy for Android).
- [ ] On the laptop, open the same URL in a second tab as a backup, and open the four test images from `public/demo/` on a second screen or print them:
  - `menu.jpg`: Harbor Table lunch menu
  - `spanish-sign.jpg`: "PRECAUCIÓN, obras en la acera" street sign
  - `medicine-label.jpg`: sample ibuprofen label (clearly marked "demo only")
  - `room.jpg`: living room with a door, couch, table, and a bag on the floor
- [ ] Printed copies are best: a camera pointed at a projector screen picks up glare and moiré.
- [ ] Phone hotspot ready in case venue Wi-Fi is bad.

## Script

**0:00 – 0:25 · The problem**
> "2.2 billion people live with a vision impairment. Menus, medicine labels, and street signs still assume you can see them. SightLine turns any phone browser into a pair of eyes that talks: point your camera, hear the world."

**0:25 – 0:55 · Describe (room)**
1. Show the phone. Point out the one big yellow Capture button at the bottom.
2. Mode is **Describe** (the default). Point at `room.jpg` and tap **Capture**.
3. Let it beep, say "Looking", and read the description. Call out that it mentions the obstacle on the floor first.

**0:55 – 1:35 · Menu + follow-up question**
1. Tap **Menu / Label**. Point at `menu.jpg`, tap **Capture**.
2. It summarizes the menu sections and price range.
3. Tap **Ask about this** and say: *"How much is the salmon?"* It answers "24 dollars" about the same photo, with no new picture.
   - If the room is too loud for the mic, type the question in the box instead.

**1:35 – 2:05 · Translate (voice command)**
1. Tap **Voice command** and say: *"Translate to English."* (Or tap **Translate**, keep English, and tap Capture.)
2. Point at `spanish-sign.jpg`. It reads "Caution: sidewalk work, cross on the other side".
3. Optional flourish: say *"translate to French"* and it answers in a French voice.

**2:05 – 2:35 · Accessibility**
- Turn on VoiceOver (triple-click the side button if you've set up the shortcut) and swipe through: every button is labelled, the mode buttons say "selected", and results are announced.
- Mention: 64 px targets, AAA contrast, beeps and vibration, Auto-speak toggle so it doesn't talk over screen readers, axe-core reports 0 violations.

**2:35 – 3:00 · Wrap up**
> "SightLine is a web app, so there's nothing to install: open a link, add it to your home screen. Next we're working on offline reading, obstacle warnings while walking, and smart glasses. Thank you!"

## Fallback plan

| Problem | What to do |
| --- | --- |
| Venue Wi-Fi is slow or down | Switch the phone to your hotspot. A capture uploads about 150 KB. |
| No internet at all | Play the backup screen recording (TODO: record one the night before with QuickTime: phone screen + audio). |
| Camera won't start or the phone dies | Use the laptop tab: tap **Upload photo** and pick the files from `public/demo/`. Everything else works the same. |
| Mic doesn't hear you | Use the mode buttons and the "Type a question" box instead of voice. |
| Speech is too quiet for the room | Turn Auto-speak on, raise the speed to 1×, and read the on-screen text aloud yourself, or hold the phone to the mic. |
| An answer is wrong or slow | Say "SightLine tells you when it isn't sure, and you can always ask again." Tap **Replay** or recapture. |
| API key or quota problem | The app says "the server's API key was rejected". Check `ANTHROPIC_API_KEY` in Vercel, redeploy, and fall back to the recording. |
