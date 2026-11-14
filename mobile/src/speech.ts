import { createAudioPlayer, setAudioModeAsync, type AudioPlayer, type AudioStatus } from "expo-audio";
import * as Speech from "expo-speech";
import { File, Paths } from "expo-file-system";
import { speakClip } from "./api";
import { ClipCache } from "./logic/clipCache";
import { speakableUnits } from "./logic/speechText";

// Speech output. ElevenLabs voices through /api/speak, played with expo-audio, one sentence-sized
// chunk at a time with the next chunk fetched while the current one plays. Falls back to the
// on-device voice (expo-speech) when the route is missing, slow or failing.

const FIRST_CHUNK = 140; // a short first clip comes back from the server sooner
const CHUNK = 300;
const CACHE_LIMIT = 40;
const COOLDOWN_MS = 30_000;

function chunk(text: string, max: number, firstMax = max): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    const limit = out.length ? max : firstMax;
    if ((cur + s).length > limit && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      for (const w of s.split(/\s+/)) {
        if ((cur + " " + w).length > max && cur) {
          out.push(cur.trim());
          cur = "";
        }
        cur += (cur ? " " : "") + w;
      }
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [text];
}

// kind: "speech" goes through ElevenLabs (or the device voice); "device" always uses the iPhone
// voice (hints); "preview" plays a voice sample. Everything goes through one queue, so nothing
// overlaps and nothing queued is lost.
type Item =
  | { kind: "speech"; text: string; lang: string; owner?: string | null }
  | { kind: "device"; text: string; lang: string }
  | { kind: "preview"; voiceId: string; previewUrl?: string };

function deleteFile(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // Already gone or not ours.
  }
}
// owner: who started the current speech (e.g. a section id), so its UI can show "speaking".
type Listener = (speaking: boolean, owner: string | null) => void;

class SpeechEngine {
  private run = 0;
  private queue: Item[] = [];
  private draining = false;
  private player: AudioPlayer | null = null;
  private finish: (() => void) | null = null;
  private cache = new ClipCache(CACHE_LIMIT, deleteFile);
  private cooldownUntil = 0;
  private listeners = new Set<Listener>();
  owner: string | null = null;
  rate = 1;
  natural = true; // user setting
  voiceId = ""; // "" = the server's default voice
  serverHasVoice: boolean | null = null; // from /api/features; null = unknown, try it

  async init() {
    // Clips from earlier sessions are never reused: clear them out.
    try {
      for (const entry of Paths.cache.list()) {
        if (entry instanceof File && /\/speak-[^/]+\.mp3$/.test(entry.uri)) deleteFile(entry.uri);
      }
    } catch {
      // Listing the cache folder isn't essential.
    }
    try {
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "duckOthers", allowsRecording: false });
    } catch {
      // Not fatal: speech still works, it may just respect the silent switch.
    }
  }

  subscribe(l: Listener) {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  private emit(v: boolean) {
    if (!v) this.owner = null;
    const owner = this.owner;
    this.listeners.forEach((l) => l(v, owner));
  }

  /** Speak now, interrupting anything playing. With queue: true, play after what's playing. */
  speak(text: string, lang = "en-US", opts: { queue?: boolean; owner?: string } = {}) {
    const t = text.trim();
    if (!t) return;
    if (!opts.queue) this.stop();
    this.queue.push({ kind: "speech", text: t, lang, owner: opts.owner ?? null });
    if (!this.draining) void this.drain();
  }

  /** Read several pieces in order, each with its own owner (Read all). Stops what's playing. */
  speakAll(items: { owner: string; text: string }[], lang = "en-US") {
    this.stop();
    for (const it of items) if (it.text.trim()) this.queue.push({ kind: "speech", text: it.text.trim(), lang, owner: it.owner });
    if (!this.draining) void this.drain();
  }

  /** Short prompts (auto-capture hints) use the on-device voice: instant, no network. */
  hint(text: string, lang = "en-US") {
    this.stop();
    this.queue.push({ kind: "device", text, lang });
    void this.drain();
  }

  /** Voice picker preview: stops what's playing, then plays the sample through the queue. */
  preview(voiceId: string, previewUrl?: string) {
    this.stop();
    this.queue.push({ kind: "preview", voiceId, previewUrl });
    void this.drain();
  }

  private async playPreview(run: number, voiceId: string, previewUrl?: string) {
    let ok = false;
    if (previewUrl) ok = await this.playFile(run, previewUrl, 200);
    if (!ok && run === this.run) {
      const { uri } = await speakClip({
        text: "Hi, I'm the SightLine voice. Point your camera and I'll tell you what I see.",
        lang: "en-US",
        previousText: "",
        nextText: "",
        voiceId: voiceId || undefined,
      });
      if (uri && run === this.run) {
        await this.playFile(run, uri, 90);
        deleteFile(uri);
      }
    }
  }

  /** Stop only if this owner started what's playing (e.g. collapsing the section being read). */
  stopIfOwner(owner: string) {
    if (this.owner === owner) this.stop();
  }

  stop() {
    this.run++;
    this.owner = null;
    this.queue = [];
    this.finish?.();
    this.finish = null;
    try {
      this.player?.pause();
    } catch {}
    Speech.stop();
    if (this.draining) {
      this.draining = false;
      this.emit(false);
    }
  }

  setRate(rate: number) {
    this.rate = rate;
    try {
      if (this.player) this.player.setPlaybackRate(rate, "high");
    } catch {}
  }

  private useNatural() {
    return this.natural && this.serverHasVoice !== false && Date.now() > this.cooldownUntil;
  }

  private async drain() {
    const run = this.run;
    this.draining = true;
    this.emit(true);
    while (this.queue.length && run === this.run) {
      const item = this.queue.shift()!;
      // Each item names its owner (e.g. a section being read) so the UI can mark it.
      const owner = item.kind === "speech" ? (item.owner ?? null) : null;
      if (owner !== this.owner) {
        this.owner = owner;
        this.emit(true);
      }
      if (item.kind === "preview") await this.playPreview(run, item.voiceId, item.previewUrl);
      else if (item.kind === "speech" && this.useNatural()) await this.sayNatural(run, item);
      else await this.sayDevice(run, item.text, item.lang);
    }
    if (run === this.run) {
      this.draining = false;
      this.emit(false);
    }
  }

  private async clip(text: string, lang: string, prev: string, next: string): Promise<string | null> {
    const voice = this.voiceId;
    const key = `${voice}|${lang}|${text}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const { uri, status } = await speakClip({ text, lang, previousText: prev, nextText: next, voiceId: voice || undefined });
    if (!uri) {
      if (status === 404 || status === 503) this.serverHasVoice = false; // no route, or no key
      return null;
    }
    this.cache.set(key, uri); // drops (and deletes) the oldest clip past the limit
    return uri;
  }

  private async sayNatural(run: number, item: { text: string; lang: string }) {
    const parts = chunk(item.text, CHUNK, FIRST_CHUNK);
    // Fetch the first two clips at once and stay two ahead, so playback starts as soon as the
    // first short clip lands and never waits between chunks.
    const fetches: Promise<string | null>[] = [];
    const get = (i: number) =>
      (fetches[i] ??= this.clip(parts[i], item.lang, parts[i - 1] ?? "", parts[i + 1] ?? ""));
    get(0);
    if (parts.length > 1) get(1);
    for (let i = 0; i < parts.length; i++) {
      const uri = await get(i);
      if (run !== this.run) return;
      if (i + 2 < parts.length) get(i + 2);
      if (!uri) {
        this.cooldownUntil = Date.now() + COOLDOWN_MS;
        await this.sayDevice(run, parts.slice(i).join(" "), item.lang);
        return;
      }
      const played = await this.playFile(run, uri, parts[i].length);
      if (!played && run === this.run) {
        this.cooldownUntil = Date.now() + COOLDOWN_MS;
        await this.sayDevice(run, parts.slice(i).join(" "), item.lang);
        return;
      }
    }
  }

  /** Resolves true when the clip finished, false if it never started playing. */
  private playFile(run: number, uri: string, chars: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (run !== this.run) return resolve(true);
      let started = false;
      const done = (ok: boolean) => {
        clearTimeout(startGuard);
        clearTimeout(endGuard);
        sub?.remove();
        if (this.finish === stopHook) this.finish = null;
        resolve(ok);
      };
      const stopHook = () => done(true);
      this.finish = stopHook;
      if (!this.player) this.player = createAudioPlayer(null, { updateInterval: 250 });
      const player = this.player;
      const sub = player.addListener("playbackStatusUpdate", (s: AudioStatus) => {
        if (s.playing) started = true;
        if (s.didJustFinish) done(true);
      });
      // If the clip never starts (bad file, audio session trouble), fall back.
      const startGuard = setTimeout(() => {
        if (!started) done(false);
      }, 4000);
      // Upper bound so a missed "finished" event can't hang the queue.
      const endGuard = setTimeout(() => done(true), 6000 + (chars * 110) / Math.max(0.5, this.rate));
      try {
        player.replace({ uri });
        player.setPlaybackRate(this.rate, "high");
        player.play();
      } catch {
        done(false);
      }
    });
  }

  private sayDevice(run: number, text: string, lang: string): Promise<void> {
    return new Promise((resolve) => {
      if (run !== this.run) return resolve();
      const done = () => {
        if (this.finish === done) this.finish = null;
        resolve();
      };
      this.finish = done;
      Speech.speak(speakableUnits(text, lang), {
        language: lang,
        rate: this.rate,
        onDone: done,
        onStopped: done,
        onError: done,
      });
    });
  }
}

export const speech = new SpeechEngine();
