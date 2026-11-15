// What the Recent sheet shows (tested in recent.test.ts). scans null = couldn't be loaded.

export const HISTORY_UNAVAILABLE = "History is unavailable right now";

export function recentView(scans: readonly unknown[] | null, loading: boolean): "loading" | "unavailable" | "empty" | "list" {
  if (!scans) return loading ? "loading" : "unavailable";
  return scans.length ? "list" : "empty";
}
