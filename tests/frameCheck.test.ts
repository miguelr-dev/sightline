import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/claude")>();
  return { ...actual, askJson: vi.fn() };
});

import {
  CATEGORY_MODE,
  checkFrame,
  incidentalKey,
  normalizeKey,
  stabilizeKey,
} from "@/lib/frameCheck";
import { askJson } from "@/lib/claude";

describe("normalizeKey", () => {
  it.each([
    ["kirkland-tropical-energy-drink-can", "kirkland-tropical-energy-drink"],
    ["Kirkland Tropical Energy Package", "kirkland-tropical-energy"],
    ["red-bull-package", "red-bull"],
    ["demo-prin-medicine-box", "demo-prin-medicine"],
    ["the-harbor-table-menu", "harbor-table-menu"],
    ["laptop-screen-screen", "laptop-screen"],
    ["nutter-butter-cookies-front-bottle", "nutter-butter-cookies"],
    ["a-very-long-name-with-many-words", "very-long-name-many"],
    ["can-package-box", ""],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeKey(raw)).toBe(expected);
  });
});

describe("stabilizeKey: a near-match maps back to the last key", () => {
  it.each([
    ["kirkland-energy-drink", "kirkland-tropical-energy-drink", "kirkland-tropical-energy-drink"],
    ["tropical-energy", "kirkland-tropical-energy-drink", "kirkland-tropical-energy-drink"],
    ["red-bull", "kirkland-tropical-energy-drink", "red-bull"],
    ["red-bull", "", "red-bull"],
    ["", "red-bull", ""],
  ])("%s with last %s -> %s", (key, last, expected) => {
    expect(stabilizeKey(key, last)).toBe(expected);
  });
});

describe("suggestedMode comes from the category, in code", () => {
  it.each([
    ["packaged_item", "menu"],
    ["menu", "menu"],
    ["foreign_text", "translate"],
    ["document", "read"],
    ["sign", "read"],
    ["scene", "describe"],
  ] as const)("%s -> %s", (category, mode) => {
    expect(CATEGORY_MODE[category]).toBe(mode);
  });
});

describe("incidentalKey: everyday tech and furniture are never targets", () => {
  it.each([
    ["laptop-screen", true],
    ["laptop-keyboard", true],
    ["desk-monitor", true],
    ["computer-mouse", true],
    ["harbor-table-menu", false],
    ["red-bull", false],
    ["presentation-slide", false],
  ])("%s -> %s", (key, expected) => {
    expect(incidentalKey(key)).toBe(expected);
  });
});

describe("checkFrame", () => {
  const model = (r: Record<string, unknown>) =>
    vi.mocked(askJson).mockResolvedValue({
      detected: true,
      label: "Kirkland energy drink",
      category: "packaged_item",
      ready: true,
      confidence: 0.9,
      key: "kirkland-energy-drink-can",
      hint: "",
      ...r,
    });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the last key when the model names the same item differently", async () => {
    model({});
    const { result } = await checkFrame("/9j/abc", "read", undefined, {
      lastKey: "kirkland-tropical-energy-drink",
      lastLabel: "Kirkland energy drink",
    });
    expect(result.key).toBe("kirkland-tropical-energy-drink");
    expect(result.suggestedMode).toBe("menu");
  });

  it("tells the model the last key and asks it to repeat it for the same item", async () => {
    model({});
    await checkFrame("/9j/abc", "read", undefined, { lastKey: "red-bull", lastLabel: "Red Bull" });
    const system = vi.mocked(askJson).mock.calls[0][1].system;
    expect(system).toContain('"red-bull"');
    expect(system).toMatch(/same item.*return exactly/i);
  });

  it("maps the category to the mode no matter what mode the user is in", async () => {
    model({ category: "foreign_text", key: "precaucion-obras" });
    const { result } = await checkFrame("/9j/abc", "menu");
    expect(result.suggestedMode).toBe("translate");
  });

  it("never detects a laptop or keyboard in general use", async () => {
    model({ key: "laptop-screen-screen", label: "Laptop keyboard and screen", category: "document" });
    const { result } = await checkFrame("/9j/abc", "read");
    expect(result).toMatchObject({ detected: false, ready: false });
    expect(result.key).toBeUndefined();
    expect(result.label).toBeUndefined();
  });

  it("isn't detected when the model says it's a scene with no target", async () => {
    model({ detected: false, ready: false, category: "scene", key: "", label: "" });
    const { result } = await checkFrame("/9j/abc", "read");
    expect(result.detected).toBe(false);
  });

  it("logs the last key on the frame-check line", async () => {
    model({});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await checkFrame("/9j/abc", "read", "phone", { lastKey: "red-bull" });
    expect(log.mock.calls.flat().join(" ")).toMatch(/lastKey=red-bull/);
    log.mockRestore();
  });
});
