import { describe, expect, it } from "vitest";
import {
  COMMAND_TIMEOUT_MS,
  TIMEOUT_MESSAGE,
  initialCommandState,
  matchEvent,
  reduceCommand,
  rejectionMessage,
  routeInput,
  type CommandState,
} from "./hatCommands";
import type { DeviceEvent } from "../modes";

const answer = (commandId?: string, spokenText = "This is a lunch menu."): DeviceEvent => ({
  id: "10",
  createdAt: "2026-11-15T03:00:00.000Z",
  kind: "answer",
  payload: { spokenText, ...(commandId ? { commandId, command: { type: "read" } } : {}) },
});
const status = (commandId: string, text: string): DeviceEvent => ({
  id: "11",
  createdAt: "2026-11-15T03:00:01.000Z",
  kind: "status",
  payload: { commandId, text },
});

function sent(at = 1000, text = "read this menu"): CommandState {
  let s = reduceCommand(initialCommandState, { type: "send", localId: 1, text, at }).state;
  s = reduceCommand(s, { type: "accepted", localId: 1, commandId: "c1" }).state;
  return s;
}

describe("routeInput: transcript to ask vs hat command", () => {
  it("sends history questions to /api/ask", () => {
    for (const q of ["what did I scan earlier", "What have I scanned today?", "remind me what the salmon cost", "Earlier I saw a sign", "yesterday's menu", "last time I was here"]) {
      expect(routeInput(q, { askAvailable: true })).toEqual({ kind: "ask", question: q.trim() });
    }
  });

  it("sends everything else to the hat", () => {
    for (const t of ["read this menu", "what does this sign say", "search for this", "describe what's in front of me", "translate this to Spanish"]) {
      expect(routeInput(t, { askAvailable: true })).toEqual({ kind: "hat", text: t });
    }
  });

  it("sends history questions to the hat when ask is unavailable", () => {
    expect(routeInput("what did I scan earlier", { askAvailable: false })).toEqual({ kind: "hat", text: "what did I scan earlier" });
  });

  it("ignores empty or whitespace-only input", () => {
    expect(routeInput("   ", { askAvailable: true })).toEqual({ kind: "empty" });
  });

  it("typed and spoken input take the identical path", () => {
    for (const t of ["read this menu", "what did I scan earlier", "  translate this to Spanish  "]) {
      expect(routeInput(t, { askAvailable: true, source: "typed" })).toEqual(routeInput(t, { askAvailable: true, source: "voice" }));
    }
  });
});

describe("reduceCommand: pending, answered, status, timeout", () => {
  it("send puts the command in sending state and stops speech first", () => {
    const r = reduceCommand(initialCommandState, { type: "send", localId: 1, text: "read this", at: 0 });
    expect(r.state.current).toMatchObject({ localId: 1, text: "read this", phase: "sending" });
    expect(r.effects[0]).toEqual({ type: "stopSpeech" });
  });

  it("accepted moves to waiting with the server's commandId", () => {
    const s = sent();
    expect(s.current).toMatchObject({ phase: "waiting", commandId: "c1" });
  });

  it("an accepted reply for an older local send is ignored", () => {
    let s = reduceCommand(initialCommandState, { type: "send", localId: 1, text: "a", at: 0 }).state;
    s = reduceCommand(s, { type: "send", localId: 2, text: "b", at: 10 }).state;
    const r = reduceCommand(s, { type: "accepted", localId: 1, commandId: "old" });
    expect(r.state.current).toMatchObject({ localId: 2, phase: "sending" });
    expect(r.state.current?.commandId).toBeUndefined();
  });

  it("the matching answer event settles the command and shows the answer", () => {
    const ev = answer("c1");
    const r = reduceCommand(sent(), { type: "event", event: ev });
    expect(r.state.current).toBeNull();
    expect(r.effects).toEqual([{ type: "showAnswer", event: ev }]);
  });

  it("a status event for the command is spoken and cancels the timeout", () => {
    let r = reduceCommand(sent(1000), { type: "event", event: status("c1", "No picture from your hat camera. Is it on?") });
    expect(r.effects).toEqual([{ type: "speak", text: "No picture from your hat camera. Is it on?" }]);
    expect(r.state.current).toMatchObject({ phase: "status" });
    r = reduceCommand(r.state, { type: "tick", at: 1000 + COMMAND_TIMEOUT_MS + 1 });
    expect(r.effects).toEqual([]);
  });

  it("an answer still arrives after a status for the same command", () => {
    let s = reduceCommand(sent(), { type: "event", event: status("c1", "Looking now.") }).state;
    const ev = answer("c1");
    const r = reduceCommand(s, { type: "event", event: ev });
    expect(r.effects).toEqual([{ type: "showAnswer", event: ev }]);
    s = r.state;
    expect(s.current).toBeNull();
  });

  it("times out after about 12 s with no answer", () => {
    const s = sent(1000);
    expect(reduceCommand(s, { type: "tick", at: 1000 + COMMAND_TIMEOUT_MS - 1 }).effects).toEqual([]);
    const r = reduceCommand(s, { type: "tick", at: 1000 + COMMAND_TIMEOUT_MS });
    expect(r.state.current).toBeNull();
    expect(r.effects).toEqual([{ type: "speak", text: TIMEOUT_MESSAGE }]);
    expect(TIMEOUT_MESSAGE).toBe("Your hat camera didn't answer. Try again.");
  });

  it("also times out while still sending (server never replied)", () => {
    const s = reduceCommand(initialCommandState, { type: "send", localId: 1, text: "a", at: 0 }).state;
    expect(reduceCommand(s, { type: "tick", at: COMMAND_TIMEOUT_MS }).effects).toEqual([{ type: "speak", text: TIMEOUT_MESSAGE }]);
  });

  it("a rejection is spoken with a helpful message", () => {
    const s = reduceCommand(initialCommandState, { type: "send", localId: 1, text: "a", at: 0 }).state;
    const r = reduceCommand(s, { type: "rejected", localId: 1, reason: "no-frame" });
    expect(r.state.current).toBeNull();
    expect(r.effects).toEqual([{ type: "speak", text: rejectionMessage("no-frame") }]);
    expect(rejectionMessage("no-frame")).toMatch(/hat camera/i);
    expect(rejectionMessage("unpaired")).toMatch(/pair/i);
    expect(rejectionMessage("something-new")).toMatch(/try again/i);
  });

  it("ignores answers for stale commandIds", () => {
    let s = sent(); // c1 pending
    s = reduceCommand(s, { type: "send", localId: 2, text: "describe", at: 5000 }).state;
    s = reduceCommand(s, { type: "accepted", localId: 2, commandId: "c2" }).state;
    const r = reduceCommand(s, { type: "event", event: answer("c1") });
    expect(r.effects).toEqual([]);
    expect(r.state.current).toMatchObject({ commandId: "c2", phase: "waiting" });
  });

  it("ignores a late answer after the command timed out", () => {
    const s = reduceCommand(sent(0), { type: "tick", at: COMMAND_TIMEOUT_MS }).state;
    expect(reduceCommand(s, { type: "event", event: answer("c1") }).effects).toEqual([]);
  });

  it("passes answers without a commandId through (the hat read something on its own)", () => {
    const ev = answer(undefined);
    const r = reduceCommand(sent(), { type: "event", event: ev });
    expect(r.effects).toEqual([{ type: "passthrough", event: ev }]);
    expect(r.state.current).toMatchObject({ commandId: "c1", phase: "waiting" });
  });
});

describe("lookup updates", () => {
  it("web lookup updates pass through even after their command settled", () => {
    const settled = reduceCommand(sent(), { type: "event", event: answer("c1") }).state;
    const update: DeviceEvent = {
      id: "12",
      createdAt: "",
      kind: "answer",
      payload: { commandId: "c1", scanId: "s1", update: "lookup", lookup: { spokenText: "From the web: no recall." } },
    };
    expect(reduceCommand(settled, { type: "event", event: update }).effects).toEqual([{ type: "passthrough", event: update }]);
    expect(matchEvent(update, settled)).toBe("unrelated");
  });
});

describe("matchEvent", () => {
  it("classifies events against the pending command", () => {
    const s = sent();
    expect(matchEvent(answer("c1"), s)).toBe("current");
    expect(matchEvent(status("c1", "x"), s)).toBe("current");
    expect(matchEvent(answer("c0"), s)).toBe("stale");
    expect(matchEvent(answer(undefined), s)).toBe("unrelated");
    expect(matchEvent(answer("c1"), initialCommandState)).toBe("stale");
  });

  it("treats detected and hint events as unrelated", () => {
    const ev: DeviceEvent = { id: "1", createdAt: "", kind: "detected", payload: { label: "Menu", commandId: "c1" } };
    expect(matchEvent(ev, sent())).toBe("unrelated");
  });
});

describe("stop-speech-on-new-command rule", () => {
  it("every new command stops speech before anything else, even with one pending", () => {
    const r = reduceCommand(sent(), { type: "send", localId: 2, text: "search for this", at: 3000 });
    expect(r.effects[0]).toEqual({ type: "stopSpeech" });
    expect(r.state.current).toMatchObject({ localId: 2, phase: "sending" });
  });

  it("settling a command never stops speech (the answer is about to be spoken)", () => {
    const r = reduceCommand(sent(), { type: "event", event: answer("c1") });
    expect(r.effects.some((e) => e.type === "stopSpeech")).toBe(false);
  });
});
