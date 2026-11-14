/** Small caption under a section: where its facts came from. */
export function provenanceLabel(p: unknown): string | null {
  if (p === "label") return "On the package";
  if (p === "web") return "Online";
  return null;
}
