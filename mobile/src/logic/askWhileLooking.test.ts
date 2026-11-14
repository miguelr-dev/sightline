import { describe, expect, it } from "vitest";
import {
  buildLookingRequest,
  fallbackFor,
  initialCaption,
  initialSilence,
  reduceCaption,
  trackSilence,
  statusLine,
  type CaptionState,
} from "./askWhileLooking";

describe("buildLookingRequest: utterance → /api/analyze body", () => {
  it("sends the fresh image, the current mode and the transcript as utterance", () => {
    expect(buildLookingRequest({ image: "IMG", mode: "describe", language: "Spanish", utterance: "  what does this sign say ", supportsUtterance: true })).toEqual({
      image: "IMG",
      mode: "describe",
      utterance: "what does this sign say",
    });
  });

  it("includes the target language in Translate mode only", () => {
    expect(buildLookingRequest({ image: "I", mode: "translate", language: "French", utterance: "translate this", supportsUtterance: true })).toEqual({
      image: "I",
      mode: "translate",
      language: "French",
      utterance: "translate this",
    });
  });

  it("falls back to `question` for a server that doesn't understand utterance", () => {
    expect(buildLookingRequest({ image: "I", mode: "read", language: "Spanish", utterance: "is this gluten free", supportsUtterance: false })).toEqual({
      image: "I",
      mode: "read",
      question: "is this gluten free",
    });
  });

  it("caps the utterance at 300 characters", () => {
    const body = buildLookingRequest({ image: "I", mode: "read", language: "", utterance: "x".repeat(400), supportsUtterance: true });
    expect(body.utterance).toHaveLength(300);
  });
});

describe("fallbackFor: did the server ignore the utterance?", () => {
  it("accepts an answer that says how it interpreted the utterance", () => {
    expect(fallbackFor({ spokenText: "It says Exit.", details: "", interpreted: { mode: "read" } })).toBe("ok");
  });

  it("retries as a question when an older server answered without `interpreted`", () => {
    expect(fallbackFor({ spokenText: "This is a hallway.", details: "" })).toBe("retry-as-question");
  });

  it("never retries an error", () => {
    expect(fallbackFor({ spokenText: "Sorry.", details: "", error: true })).toBe("ok");
  });
});

describe("caption state machine", () => {
  const step = (s: CaptionState, ...events: Parameters<typeof reduceCaption>[1][]) => {
    let cur = s;
    const fx: string[] = [];
    for (const e of events) {
      const r = reduceCaption(cur, e);
      cur = r.state;
      fx.push(...r.effects.map((x) => x.type));
    }
    return { state: cur, effects: fx };
  };

  it("idle → listening → transcribing → asking → answered → idle", () => {
    let r = step(initialCaption, { type: "press" });
    expect(r.state.phase).toBe("listening");
    r = step(r.state, { type: "release" });
    expect(r.state.phase).toBe("transcribing");
    r = step(r.state, { type: "transcribed", text: "What does this sign say?" });
    expect(r.state).toMatchObject({ phase: "asking", text: "What does this sign say?" });
    r = step(r.state, { type: "interpreted", interpreted: { mode: "read", question: "What does this sign say?" } });
    expect(r.state.status).toBe("Reading…");
    r = step(r.state, { type: "answered" });
    expect(r.state.phase).toBe("answered");
    expect(r.effects).toContain("announce");
    r = step(r.state, { type: "faded" });
    expect(r.state.phase).toBe("idle");
  });

  it("an empty transcript or a failure ends in error, then idle", () => {
    let r = step(initialCaption, { type: "press" }, { type: "release" }, { type: "transcribed", text: "  " });
    expect(r.state.phase).toBe("error");
    r = step(r.state, { type: "faded" });
    expect(r.state.phase).toBe("idle");
    r = step(initialCaption, { type: "press" }, { type: "release" }, { type: "transcribed", text: "what is this" }, { type: "failed", message: "No connection" });
    expect(r.state).toMatchObject({ phase: "error", status: "No connection" });
  });

  it("stop-speech-on-mic: pressing the mic always stops speech first", () => {
    const r = reduceCaption(initialCaption, { type: "press" });
    expect(r.effects[0]).toEqual({ type: "stopSpeech" });
    const again = reduceCaption({ phase: "answered", text: "x", status: "" }, { type: "press" });
    expect(again.effects[0]).toEqual({ type: "stopSpeech" });
    expect(again.state.phase).toBe("listening");
  });

  it("the caption never asks for anything to be spoken", () => {
    const all = step(
      initialCaption,
      { type: "press" },
      { type: "release" },
      { type: "transcribed", text: "what's this" },
      { type: "interpreted", interpreted: { mode: "describe" } },
      { type: "answered" },
    );
    expect(all.effects).not.toContain("speak");
  });

  it("ignores stray events in the wrong phase", () => {
    expect(reduceCaption(initialCaption, { type: "release" }).state.phase).toBe("idle");
    expect(reduceCaption(initialCaption, { type: "answered" }).state.phase).toBe("idle");
  });
});

describe("statusLine", () => {
  it("describes what's happening as short text", () => {
    expect(statusLine({ mode: "read" })).toBe("Reading…");
    expect(statusLine({ mode: "describe" })).toBe("Looking…");
    expect(statusLine({ mode: "menu" })).toBe("Reading the label…");
    expect(statusLine({ mode: "translate", language: "French" })).toBe("Translating to French…");
    expect(statusLine({ mode: "read", question: "is this gluten free" })).toBe("Checking…");
    expect(statusLine(undefined)).toBe("Looking…");
  });
});

describe("silence detection (tap-to-talk stops on its own)", () => {
  it("stops after ~1.2 s of quiet once speech has been heard", () => {
    let s = initialSilence;
    const feed = (db: number, at: number) => {
      const r = trackSilence(s, db, at);
      s = r.state;
      return r.stop;
    };
    expect(feed(-60, 0)).toBe(false); // quiet before speaking: keep waiting
    expect(feed(-60, 2000)).toBe(false);
    expect(feed(-20, 2200)).toBe(false); // speaking
    expect(feed(-55, 2400)).toBe(false);
    expect(feed(-55, 3500)).toBe(false);
    expect(feed(-55, 3600)).toBe(true);
  });

  it("a word in the middle resets the quiet timer", () => {
    let s = initialSilence;
    for (const [db, at] of [[-20, 0], [-55, 500], [-25, 1500], [-55, 1600]] as const) s = trackSilence(s, db, at).state;
    expect(trackSilence(s, -55, 2700).stop).toBe(false);
    expect(trackSilence(s, -55, 2800).stop).toBe(true);
  });

  it("gives up if nothing is ever said", () => {
    expect(trackSilence(initialSilence, -60, 0).stop).toBe(false);
    let s = trackSilence(initialSilence, -60, 0).state;
    expect(trackSilence(s, -60, 7000).stop).toBe(true);
  });

  it("ignores missing metering (not every device reports it)", () => {
    expect(trackSilence(initialSilence, undefined, 5000).stop).toBe(false);
  });
});
