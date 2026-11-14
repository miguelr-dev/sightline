import type { Section } from "../modes";

// "Read all" in the result sheet (tested in barcode.test.ts): every non-empty section in order,
// title then body, queued in the speech engine with one owner per section so the matching row
// shows its speaker icon and opens while it's read.

export type ReadAllState = { status: "idle" | "reading"; owners: string[]; current: string | null };
export const initialReadAll: ReadAllState = { status: "idle", owners: [], current: null };

export type ReadAllEvent =
  | { type: "start"; prefix: string; sections: Section[]; more?: { prefix: string; sections: Section[] }[] }
  | { type: "speaking"; owner: string | null } // from the speech engine
  | { type: "stop" }
  | { type: "dismiss" };

export type ReadAllEffect = { type: "stopSpeech" } | { type: "enqueue"; items: { owner: string; text: string }[] };

export function reduceReadAll(s: ReadAllState, e: ReadAllEvent): { state: ReadAllState; effects: ReadAllEffect[] } {
  switch (e.type) {
    case "start": {
      const groups = [{ prefix: e.prefix, sections: e.sections }, ...(e.more ?? [])];
      const items = groups.flatMap((g) =>
        g.sections
          .map((sec, i) => ({ owner: `${g.prefix}-${i}`, text: `${sec.title.trim()}. ${sec.body.trim()}`, body: sec.body.trim() }))
          .filter((x) => x.body)
          .map(({ owner, text }) => ({ owner, text })),
      );
      if (!items.length) return { state: initialReadAll, effects: [] };
      return {
        state: { status: "reading", owners: items.map((x) => x.owner), current: null },
        effects: [{ type: "stopSpeech" }, { type: "enqueue", items }],
      };
    }
    case "speaking":
      if (s.status !== "reading") return { state: s, effects: [] };
      if (e.owner && s.owners.includes(e.owner)) return { state: { ...s, current: e.owner }, effects: [] };
      if (!e.owner && !s.current) return { state: s, effects: [] }; // the previous speech stopping
      // Finished, or something else took over the voice.
      return { state: initialReadAll, effects: [] };
    case "stop":
    case "dismiss":
      return { state: initialReadAll, effects: [{ type: "stopSpeech" }] };
  }
}
