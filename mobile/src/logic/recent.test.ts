import { describe, expect, it } from "vitest";
import { HISTORY_UNAVAILABLE, recentView } from "./recent";

// D13: when the server can't read history (its database is down), Recent says so instead of
// looking empty.

describe("recentView", () => {
  it("shows a spinner while loading the first time", () => {
    expect(recentView(null, true)).toBe("loading");
  });

  it("says history is unavailable when it couldn't be loaded", () => {
    expect(recentView(null, false)).toBe("unavailable");
    expect(HISTORY_UNAVAILABLE).toBe("History is unavailable right now");
  });

  it("an empty list is 'no scans yet', and scans are listed", () => {
    expect(recentView([], false)).toBe("empty");
    expect(recentView([{ id: "1" }], false)).toBe("list");
    expect(recentView([{ id: "1" }], true)).toBe("list"); // refreshing keeps the old list on screen
  });
});
