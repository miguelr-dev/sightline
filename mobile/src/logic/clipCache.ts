// Small LRU for speech clip files: keeps the most recent `cap` clips for Replay and deletes the
// file of anything it drops, so the cache folder doesn't grow forever.
export class ClipCache {
  private map = new Map<string, string>();
  constructor(
    private cap: number,
    private onDelete: (uri: string) => void,
  ) {}

  get size() {
    return this.map.size;
  }

  get(key: string): string | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key); // move to most recent
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, uri: string) {
    const old = this.map.get(key);
    if (old !== undefined) {
      this.map.delete(key);
      if (old !== uri) this.onDelete(old);
    }
    this.map.set(key, uri);
    while (this.map.size > this.cap) {
      const [k, v] = this.map.entries().next().value as [string, string];
      this.map.delete(k);
      this.onDelete(v);
    }
  }

  clear() {
    for (const v of this.map.values()) this.onDelete(v);
    this.map.clear();
  }
}
