import type { DeviceEvent } from "../modes";

// Pure logic for talking to the hat camera (tested in hatCommands.test.ts). The UI only
// dispatches actions and runs the returned effects.

// ---- routing ------------------------------------------------------------------------------------

// Questions about earlier scans rather than what's in front of the camera.
export const HISTORY_QUESTION =
  /^\s*(what (did|have) i (scan|scanned|see|seen|read)|remind me|earlier|yesterday|last time)\b/i;

export type Route = { kind: "ask"; question: string } | { kind: "hat"; text: string } | { kind: "empty" };

/**
 * Where a typed or spoken request goes. `source` is accepted so callers can't accidentally
 * branch on it: typed and spoken input take exactly the same path.
 */
export function routeInput(
  raw: string,
  opts: { askAvailable: boolean; source?: "typed" | "voice" },
): Route {
  const text = raw.replace(/\s+/g, " ").trim();
  if (!text) return { kind: "empty" };
  if (opts.askAvailable && HISTORY_QUESTION.test(text)) return { kind: "ask", question: text };
  return { kind: "hat", text };
}

// ---- command tracking ---------------------------------------------------------------------------

export const COMMAND_TIMEOUT_MS = 12_000;
export const TIMEOUT_MESSAGE = "Your hat camera didn't answer. Try again.";

export function rejectionMessage(reason: string): string {
  switch (reason) {
    case "no-frame":
      return "No picture from your hat camera. Is it on?";
    case "unpaired":
      return "This phone isn't paired with the hat camera. Check the pair code in Settings.";
    case "unavailable":
      return "Talking to the hat camera isn't available on this server yet.";
    case "offline":
      return "I can't reach the SightLine server. Check the connection and try again.";
    case "bad-command":
      return "Sorry, I didn't understand that. Try saying read this, or describe what's in front of me.";
    default:
      return "Your hat camera couldn't do that. Please try again.";
  }
}

export type Pending = {
  localId: number;
  text: string;
  sentAt: number;
  phase: "sending" | "waiting" | "status";
  commandId?: string;
};

export type CommandState = { current: Pending | null };

export const initialCommandState: CommandState = { current: null };

export type CommandAction =
  | { type: "send"; localId: number; text: string; at: number }
  | { type: "accepted"; localId: number; commandId: string }
  | { type: "rejected"; localId: number; reason: string }
  | { type: "event"; event: DeviceEvent }
  | { type: "tick"; at: number };

export type Effect =
  | { type: "stopSpeech" }
  | { type: "speak"; text: string }
  | { type: "showAnswer"; event: DeviceEvent }
  | { type: "passthrough"; event: DeviceEvent };

function commandIdOf(e: DeviceEvent): string | undefined {
  const id = e.payload.commandId;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

/** Is this event about the pending command, an older one, or not about a command at all? */
export function matchEvent(e: DeviceEvent, state: CommandState): "current" | "stale" | "unrelated" {
  if (e.kind !== "answer" && e.kind !== "status") return "unrelated";
  // Web lookup data for an answer already shown: matched by scanId elsewhere, not by command.
  if (e.payload.update === "lookup") return "unrelated";
  const id = commandIdOf(e);
  if (!id) return "unrelated";
  return state.current?.commandId === id ? "current" : "stale";
}

export function reduceCommand(state: CommandState, action: CommandAction): { state: CommandState; effects: Effect[] } {
  const cur = state.current;
  switch (action.type) {
    case "send":
      // A new command always silences whatever is playing first, and replaces any pending one.
      return {
        state: { current: { localId: action.localId, text: action.text, sentAt: action.at, phase: "sending" } },
        effects: [{ type: "stopSpeech" }],
      };
    case "accepted":
      if (!cur || cur.localId !== action.localId || cur.phase !== "sending") return { state, effects: [] };
      return { state: { current: { ...cur, phase: "waiting", commandId: action.commandId } }, effects: [] };
    case "rejected":
      if (!cur || cur.localId !== action.localId) return { state, effects: [] };
      return { state: { current: null }, effects: [{ type: "speak", text: rejectionMessage(action.reason) }] };
    case "event": {
      const e = action.event;
      const m = matchEvent(e, state);
      if (m === "unrelated") return { state, effects: e.kind === "answer" ? [{ type: "passthrough", event: e }] : [] };
      if (m === "stale") return { state, effects: [] };
      if (e.kind === "answer") return { state: { current: null }, effects: [{ type: "showAnswer", event: e }] };
      const text = typeof e.payload.text === "string" ? e.payload.text.trim() : "";
      return {
        state: { current: { ...cur!, phase: "status" } },
        effects: text ? [{ type: "speak", text }] : [],
      };
    }
    case "tick":
      if (!cur || cur.phase === "status" || action.at - cur.sentAt < COMMAND_TIMEOUT_MS) return { state, effects: [] };
      return { state: { current: null }, effects: [{ type: "speak", text: TIMEOUT_MESSAGE }] };
  }
}
