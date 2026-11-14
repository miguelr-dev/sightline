import { describe, expect, it } from "vitest";
import { MAX_UTTERANCE, interpretUtterance } from "@/lib/utterance";

// "Ask while looking": what the user said as they held up the camera.
describe("interpretUtterance", () => {
  const base = { mode: "describe" as const, language: "Spanish" };

  it.each([
    ["what does this say", { mode: "read" }],
    ["What does this sign say?", { mode: "read" }],
    ["read this", { mode: "read" }],
    ["read this menu", { mode: "menu" }],
    ["what's on the menu", { mode: "menu" }],
    ["describe what's in front of me", { mode: "describe" }],
    ["What’s in front of me?", { mode: "describe" }],
    ["translate this to French", { mode: "translate", language: "French" }],
    ["translate this", { mode: "translate", language: "Spanish" }], // the app's chosen language
    ["what's this", { mode: "describe", question: "what's this" }],
    ["is this gluten free", { mode: "describe", question: "is this gluten free" }],
    ["How much is the salmon?", { mode: "describe", question: "How much is the salmon?" }],
    ["search for this", { mode: "describe", autoLookup: true }],
    ["look it up", { mode: "describe", autoLookup: true }],
    ["is this recalled", { mode: "describe", autoLookup: true }],
  ])("%s", (phrase, expected) => {
    const r = interpretUtterance(phrase, base);
    expect(r).toMatchObject({ utterance: phrase, ...expected });
    if (!("question" in expected)) expect(r?.question).toBeUndefined();
    if (!("autoLookup" in expected)) expect(r?.autoLookup).toBe(false);
    if (expected.mode !== "translate") expect(r?.language).toBe("Spanish");
  });

  it.each([
    ["what did I scan earlier"], // history questions go to /api/ask, not here
    ["stop"],
    ["help"],
  ])("leaves the request alone for %s", (phrase) => {
    const r = interpretUtterance(phrase, base);
    expect(r).toMatchObject({ utterance: phrase, mode: "describe", autoLookup: false });
    expect(r?.question).toBeUndefined();
  });

  it.each([[""], ["   "], [undefined], [42]])("is ignored when empty or not text (%s)", (raw) => {
    expect(interpretUtterance(raw, base)).toBeNull();
  });

  it(`truncates an utterance longer than ${MAX_UTTERANCE} characters`, () => {
    const long = "is there anything without nuts " + "really ".repeat(60);
    const r = interpretUtterance(long, base);
    expect(MAX_UTTERANCE).toBe(300);
    expect(r?.utterance).toHaveLength(300);
    expect(r?.question?.length).toBeLessThanOrEqual(300);
  });
});
