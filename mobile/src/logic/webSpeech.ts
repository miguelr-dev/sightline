// When the "From the web" summary is spoken (tested in modeStrip.test.ts). On the phone camera,
// lookups run on their own and the card appears, but it stays silent unless the user asked for a
// lookup or taps Listen. The hat camera is hands-free (no screen to tap), so its web summary is
// spoken automatically right after the answer, through the same queue (closing the result stops it).

export type WebTrigger = "automatic" | "hatUpdate" | "autoLookup" | "lookupButton" | "hatLookupCommand";

export function webSpeechPolicy(trigger: WebTrigger): "speak" | "silent" {
  return trigger === "automatic" ? "silent" : "speak";
}

/** The web card's Listen/Stop button. */
export function listenAction(s: { speakingOwner: string | null }, webOwner: string): "speak" | "stop" {
  return s.speakingOwner === webOwner ? "stop" : "speak";
}
