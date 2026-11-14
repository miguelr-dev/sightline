import { describe, expect, it } from "vitest";
import { matchKey, sameTarget } from "@/lib/hat";

// The hat's frames-in-a-row count and 2-minute read claim compare match keys (QA #4).
describe("hat match keys ignore generic product words", () => {
  it.each([
    ["monster-energy-drink", "red-bull-energy-drink", false],
    ["oreo-cookies", "nutter-butter-cookies", false],
    ["kirkland-energy-drink", "kirkland-tropical-energy-drink", true],
    ["calle-mayor-precaucion-sign", "precaucion-calle-mayor-sign", true],
  ])("%s vs %s -> %s", (a, b, same) => {
    expect(sameTarget(matchKey(a), matchKey(b))).toBe(same);
  });
});
