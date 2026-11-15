import { describe, expect, it } from "vitest";
import { dismissCard, initialAutoState, lastSeen, matchKey, reduceFrame, resumeAfterSheet, sameItem, type AutoState } from "@/lib/detect";
import type { FrameCheck } from "@/lib/detect";

const seen = (key: string, extra: Partial<FrameCheck> = {}): FrameCheck => ({
  ready: true,
  detected: true,
  key,
  label: key === "nb" ? "Nutter Butter Bites package" : `Item ${key}`,
  suggestedMode: "menu",
  confidence: 0.95,
  ...extra,
});
const nothing = (hint?: string): FrameCheck => ({ ready: false, detected: false, ...(hint ? { hint } : {}) });

function run(frames: FrameCheck[], start: AutoState = initialAutoState, t0 = 0) {
  let s = start;
  const outs = [];
  for (let i = 0; i < frames.length; i++) {
    const r = reduceFrame(s, frames[i], t0 + i * 1400);
    s = r.state;
    outs.push(r);
  }
  return { state: s, outs };
}

describe("auto mode never reads by itself", () => {
  it("even ready, confident, repeated frames only show the card", () => {
    const { outs } = run([seen("nb"), seen("nb"), seen("nb"), seen("nb")]);
    for (const o of outs) expect(o).not.toHaveProperty("read");
    expect(outs.every((o) => o.card?.key === "nb")).toBe(true);
  });
});

describe("detection card", () => {
  it("appears after a single detected frame, with label and suggested mode", () => {
    const { outs } = run([seen("nb")]);
    expect(outs[0].card).toEqual({ key: "nb", label: "Nutter Butter Bites package", mode: "menu", confidence: 0.95 });
    expect(outs[0].appeared).toBe(true);
  });

  it("does not announce again while the same thing stays in view", () => {
    const { outs } = run([seen("nb"), seen("nb"), seen("nb")]);
    expect(outs.map((o) => o.appeared)).toEqual([true, false, false]);
  });

  it("needs the new key on 2 frames in a row before switching to a different item", () => {
    const { outs } = run([seen("nb"), seen("exit"), seen("nb"), seen("exit"), seen("exit")]);
    expect(outs.map((o) => o.card?.key)).toEqual(["nb", "nb", "nb", "nb", "exit"]);
    expect(outs[4].appeared).toBe(true);
  });

  it("signals 'nothing detected' so the card can fade, and a fresh item then shows at once", () => {
    const { outs } = run([seen("nb"), nothing(), seen("exit")]);
    expect(outs[1].card).toBeNull();
    expect(outs[2].card?.key).toBe("exit");
    expect(outs[2].appeared).toBe(true);
  });

  it("ignores a detected frame without a key or with an unknown mode", () => {
    const r = reduceFrame(initialAutoState, { ready: false, detected: true, label: "Something" }, 0);
    expect(r.card).toBeNull();
    const m = reduceFrame(initialAutoState, seen("x", { suggestedMode: "dance" }), 0);
    expect(m.card?.mode).toBeNull();
  });

});

describe("fuzzy keys (same item, different wording)", () => {
  it("matchKey keeps the distinctive words, sorted", () => {
    expect(matchKey("calle-mayor-precaucion-sign")).toBe("calle-mayor-precaucion");
    expect(matchKey("precaucion-calle-mayor-sign")).toBe("calle-mayor-precaucion");
    expect(matchKey("menu-sign")).toBe("menu-sign"); // only type words: keep them
  });

  it("sameItem when two keys share a distinctive word", () => {
    expect(sameItem("kirkland-tropical-energy-drink", "energy-drink-can")).toBe(true);
    expect(sameItem("precaucion-calle-mayor-sign", "calle-mayor-precaucion-sign")).toBe(true);
    expect(sameItem("nutter-butter-package", "laptop-keyboard")).toBe(false);
    expect(sameItem("harbor-table-menu", "lunch-menu")).toBe(false); // "menu" alone is a type word
  });

  it("the card keeps its label while the same item's key wobbles", () => {
    const { outs } = run([
      seen("kirkland-tropical-energy-drink", { label: "Kirkland tropical energy drink" }),
      seen("energy-drink-can", { label: "Energy drink can" }),
    ]);
    expect(outs[1].card?.label).toBe("Kirkland tropical energy drink");
    expect(outs[1].appeared).toBe(false);
  });

  it("a different item still needs 2 frames, and wobbling keys for it count as the same", () => {
    const { outs } = run([seen("nb"), seen("calle-mayor-sign"), seen("mayor-calle-precaucion")]);
    expect(outs.map((o) => o.card?.key)).toEqual(["nb", "nb", "mayor-calle-precaucion"]);
  });

  it("lastSeen reports the card's key and label for the next frame-check", () => {
    const { state } = run([seen("nb")]);
    expect(lastSeen(state)).toEqual({ lastKey: "nb", lastLabel: "Nutter Butter Bites package" });
    expect(lastSeen(initialAutoState)).toEqual({});
  });
});

describe("rescanning and dismissing", () => {
  it("after a result sheet closes, the same item is offered again at once", () => {
    let s = run([seen("nb")]).state;
    s = resumeAfterSheet(s);
    const r = reduceFrame(s, seen("nb"), 5000);
    expect(r.card?.key).toBe("nb");
    expect(r.appeared).toBe(true);
  });

  it("× hides only that item, for about 5 s", () => {
    let s = run([seen("nb")]).state;
    s = dismissCard(s, "nb", 1000);
    expect(reduceFrame(s, seen("nb"), 2000).card).toBeNull();
    expect(reduceFrame(s, seen("energy-drink-can"), 2000).card?.key).toBe("energy-drink-can");
    const later = reduceFrame(s, seen("nb"), 6100);
    expect(later.card?.key).toBe("nb");
    expect(later.appeared).toBe(true);
  });

  it("× also hides the same item under a slightly different key", () => {
    const s = dismissCard(run([seen("nutter-butter-bites")]).state, "nutter-butter-bites", 0);
    expect(reduceFrame(s, seen("nutter-butter-package"), 1000).card).toBeNull();
  });
});

describe("hints", () => {
  it("speaks a hint only after it repeats for 3 s, and at most every 5 s", () => {
    let s = initialAutoState;
    const at = [0, 1500, 3000, 4500, 6000, 8100];
    const spoken = at.map((t) => {
      const r = reduceFrame(s, nothing("Hold still"), t);
      s = r.state;
      return r.speakHint ?? null;
    });
    expect(spoken).toEqual([null, null, "Hold still", null, null, "Hold still"]);
  });

  it("never speaks a hint while something is detected", () => {
    let s = initialAutoState;
    const r1 = reduceFrame(s, { ...seen("nb"), ready: false, hint: "Hold still" }, 0);
    s = r1.state;
    const r2 = reduceFrame(s, { ...seen("nb"), ready: false, hint: "Hold still" }, 4000);
    expect(r1.speakHint).toBeUndefined();
    expect(r2.speakHint).toBeUndefined();
  });
});
