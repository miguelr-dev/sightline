import { describe, expect, it } from "vitest";
import { parseCommand } from "@/lib/voice";

// Spoken commands, including the hat camera's ("search for this", "what does this sign say").
describe("parseCommand", () => {
  const cases: [string, ReturnType<typeof parseCommand>][] = [
    // New for the hat camera
    ["search for this", { type: "lookup" }],
    ["Search for this.", { type: "lookup" }],
    ["look this up", { type: "lookup" }],
    ["search the web", { type: "lookup" }],
    ["What does this sign say?", { type: "capture", mode: "read" }],
    ["what does that say", { type: "capture", mode: "read" }],
    ["What’s in front of me?", { type: "capture", mode: "describe" }],
    ["describe what's in front of me", { type: "capture", mode: "describe" }],
    ["read this menu", { type: "capture", mode: "menu" }],
    ["translate this to English", { type: "capture", mode: "translate", language: "English" }],
    // Existing commands (regressions)
    ["read this", { type: "capture", mode: "read" }],
    ["describe", { type: "capture", mode: "describe" }],
    ["what's on the menu", { type: "capture", mode: "menu" }],
    ["translate to Spanish", { type: "capture", mode: "translate", language: "Spanish" }],
    ["look it up", { type: "lookup" }],
    ["is this recalled", { type: "lookup" }],
    ["stop", { type: "stop" }],
    ["say that again", { type: "repeat" }],
    ["help", { type: "help" }],
    ["What did I scan earlier?", { type: "ask", text: "What did I scan earlier?" }],
    ["How much is the salmon?", { type: "question", text: "How much is the salmon?" }],
  ];

  it.each(cases)("%s", (phrase, expected) => {
    expect(parseCommand(phrase)).toEqual(expected);
  });
});
