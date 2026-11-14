// When the "From the web" summary is spoken (tested in modeStrip.test.ts). Lookups still run on
// their own and the card appears, but it stays silent unless the user asked for a lookup or
// taps Listen.

export type WebTrigger = "automatic" | "hatUpdate" | "autoLookup" | "lookupButton" | "hatLookupCommand";

export function webSpeechPolicy(trigger: WebTrigger): "speak" | "silent" {
  return trigger === "automatic" || trigger === "hatUpdate" ? "silent" : "speak";
}

/** The web card's Listen/Stop button. */
export function listenAction(s: { speakingOwner: string | null }, webOwner: string): "speak" | "stop" {
  return s.speakingOwner === webOwner ? "stop" : "speak";
}
