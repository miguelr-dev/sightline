import { describe, expect, it } from "vitest";
import { STRIP_MODES, STRIP_MODES as STRIP_MODES_WITH_BARCODE, DEFAULT_STRIP_MODE, analyzeModeFor, barcodeAction, detectAllowedIn, autoRetry, headerLabel, cardSubtitle, frameCheckMode } from "./modeStrip";
import { webSpeechPolicy, listenAction } from "./webSpeech";

describe("mode strip model", () => {
  it("has AUTO first, and AUTO is the default", () => {
    expect(STRIP_MODES[0]).toBe("auto");
    expect(DEFAULT_STRIP_MODE).toBe("auto");
  });

  it("sends mode auto when the server supports it, otherwise the fallback chain", () => {
    expect(analyzeModeFor("menu", { autoSupported: true })).toBe("menu");
    expect(analyzeModeFor("auto", { autoSupported: true })).toBe("auto");
    expect(analyzeModeFor("auto", { autoSupported: false, suggested: "menu" })).toBe("menu");
    expect(analyzeModeFor("auto", { autoSupported: false })).toBe("describe");
    expect(analyzeModeFor("auto", { autoSupported: false, suggested: null })).toBe("describe");
  });

  it("retries without auto only when an older server rejected it", () => {
    expect(autoRetry({ sent: "auto", status: 400, error: true })).toBe(true);
    expect(autoRetry({ sent: "auto", status: 200, error: false })).toBe(false);
    expect(autoRetry({ sent: "auto", status: 502, error: true })).toBe(false); // a real failure, not a rejection
    expect(autoRetry({ sent: "menu", status: 400, error: true })).toBe(false);
  });

  it("labels the result header with what AUTO picked", () => {
    expect(headerLabel("auto", { mode: "menu" })).toBe("Auto · Menu / Label");
    expect(headerLabel("auto", undefined)).toBe("Auto");
    expect(headerLabel("read", undefined)).toBe("Read");
    expect(headerLabel("translate", undefined, "French")).toBe("Translate to French");
  });

  it("the detection card in AUTO names the suggested mode, or none", () => {
    expect(cardSubtitle("auto", "menu")).toBe("Menu / Label");
    expect(cardSubtitle("auto", null)).toBeNull();
    expect(cardSubtitle("read", "menu")).toBe("Menu / Label");
  });

  it("frame-check gets a real mode even in AUTO", () => {
    expect(frameCheckMode("auto")).toBe("read");
    expect(frameCheckMode("translate")).toBe("translate");
  });
});

describe("web card speech policy", () => {
  it("is silent by default when the lookup ran on its own (phone, barcode or hat)", () => {
    expect(webSpeechPolicy("automatic")).toBe("silent");
    expect(webSpeechPolicy("hatUpdate")).toBe("silent");
  });
  it("speaks when the user explicitly asked for a lookup", () => {
    expect(webSpeechPolicy("autoLookup")).toBe("speak"); // "search for this"
    expect(webSpeechPolicy("lookupButton")).toBe("speak");
    expect(webSpeechPolicy("hatLookupCommand")).toBe("speak");
  });
  it("Listen speaks the card; tapping again while it speaks stops it", () => {
    expect(listenAction({ speakingOwner: null }, "web-3")).toBe("speak");
    expect(listenAction({ speakingOwner: "r-3-0" }, "web-3")).toBe("speak");
    expect(listenAction({ speakingOwner: "web-3" }, "web-3")).toBe("stop");
  });
});

describe("BARCODE mode", () => {
  it("is in the strip right after AUTO", () => {
    expect(STRIP_MODES_WITH_BARCODE).toEqual(["auto", "barcode", "read", "describe", "menu", "translate"]);
  });
  it("auto-opens and speaks a confirmed barcode only in BARCODE mode", () => {
    expect(barcodeAction("barcode")).toBe("openAndSpeak");
    for (const m of ["auto", "read", "describe", "menu"] as const) expect(barcodeAction(m)).toBe("showCard");
    expect(barcodeAction("translate")).toBe("off");
  });
  it("pauses frame-check and the Detect card in BARCODE mode", () => {
    expect(detectAllowedIn("barcode")).toBe(false);
    expect(detectAllowedIn("auto")).toBe(true);
    expect(detectAllowedIn("read")).toBe(true);
  });
  it("the shutter in BARCODE mode reads the package as Menu / Label", () => {
    expect(analyzeModeFor("barcode", { autoSupported: true })).toBe("menu");
  });
});
