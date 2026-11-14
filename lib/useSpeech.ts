"use client";

import { useCallback, useEffect, useState } from "react";

// Speech output. Uses ElevenLabs voices through /api/speak when the server has a key,
// and falls back to the browser's speechSynthesis when it doesn't, when a request fails,
// or when the phone is offline.

const ELEVEN_CHUNK = 300; // characters per /api/speak request
const BROWSER_CHUNK = 180; // Chrome stops long utterances after ~15 seconds
const FETCH_TIMEOUT_MS = 8_000;
const CACHE_LIMIT = 40; // recent audio clips kept for Replay and speed changes
const COOLDOWN_MS = 30_000; // after repeated failures, use the browser voice for a while

// Split into sentence-sized chunks.
function chunk(text: string, max: number): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      // Very long sentence: split on commas or spaces.
      const words = s.split(/(?<=,)\s+|\s+/);
      for (const w of words) {
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
  return out;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
  const prefix = lang.split("-")[0].toLowerCase();
  const family = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const pool = exact.length ? exact : family;
  return pool.find((v) => v.localService) ?? pool[0];
}

/** A tiny silent WAV, played from a user gesture so iOS lets this element play later. */
function silentWavUrl(): string {
  const samples = 800; // 0.1 s at 8 kHz
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + samples * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, 8000, true);
  v.setUint32(28, 16000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

type Item = { text: string; lang: string };
type Run = {
  id: number;
  cancelled: Promise<void>;
  cancel: () => void;
  controllers: Set<AbortController>;
};

export type SpeakOptions = {
  /** Wait for whatever is speaking now to finish instead of interrupting it. */
  queue?: boolean;
};

class SpeechEngine {
  rate = 1;
  private run: Run | null = null;
  private runCounter = 0;
  private queue: Item[] = [];
  private playing = false;
  private audio: HTMLAudioElement | null = null;
  private unlocked = false;
  private cache = new Map<string, string>();
  private eleven: boolean | null = null; // null = unknown, false = not configured on the server
  private natural = true; // Settings > Natural voice; off uses the browser's own voice
  private voiceId = ""; // Settings > Voice; "" = the server's default voice
  private failures = 0;
  private cooldownUntil = 0;

  constructor(private onSpeaking: (speaking: boolean) => void) {}

  private getAudio(): HTMLAudioElement | null {
    if (!this.audio && typeof Audio !== "undefined") {
      this.audio = new Audio();
      this.audio.preload = "auto";
    }
    return this.audio;
  }

  /** Call from a tap. Unlocks the audio element and speechSynthesis for iOS Safari. */
  unlock() {
    if (this.unlocked || typeof window === "undefined") return;
    this.unlocked = true;
    const a = this.getAudio();
    if (a) {
      try {
        a.src = silentWavUrl();
        void a.play().catch((e: unknown) => {
          // Only retry on the next tap if the browser actually refused.
          if (e instanceof DOMException && e.name === "NotAllowedError") this.unlocked = false;
        });
      } catch {
        this.unlocked = false;
      }
    }
    if ("speechSynthesis" in window) {
      try {
        const u = new SpeechSynthesisUtterance(" ");
        u.volume = 0;
        window.speechSynthesis.speak(u);
      } catch {
        // ignore
      }
    }
  }

  setElevenAvailable(available: boolean) {
    this.eleven = available;
  }

  /** Settings > Natural voice. Off: the browser voice only (free, works offline). */
  setNatural(natural: boolean) {
    this.natural = natural;
  }

  /** Settings > Voice. "" = the server's default voice. */
  setVoice(voiceId: string) {
    this.voiceId = voiceId;
  }

  setRate(rate: number) {
    this.rate = rate;
    if (this.audio && !this.audio.paused) this.audio.playbackRate = rate;
  }

  private elevenUsable(): boolean {
    return (
      this.natural &&
      this.eleven !== false &&
      Date.now() >= this.cooldownUntil &&
      typeof Audio !== "undefined" &&
      (typeof navigator === "undefined" || navigator.onLine !== false)
    );
  }

  private noteFailure() {
    this.failures++;
    if (this.failures >= 2) {
      this.cooldownUntil = Date.now() + COOLDOWN_MS;
      this.failures = 0;
    }
  }

  private isCurrent(run: Run) {
    return this.run?.id === run.id;
  }

  /** Fetch one chunk of ElevenLabs audio as an object URL, or null on any failure. */
  private async fetchClip(run: Run, text: string, lang: string, prev: string, next: string) {
    const voiceId = this.voiceId;
    const key = `${voiceId}|${lang}|${text}`;
    const cached = this.cache.get(key);
    if (cached) return cached;
    const controller = new AbortController();
    run.controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch("/api/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang, previousText: prev, nextText: next, ...(voiceId ? { voiceId } : {}) }),
        signal: controller.signal,
      });
      if (res.status === 503) {
        this.eleven = false; // no key on the server
        return null;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "").includes("audio")) {
        this.noteFailure();
        return null;
      }
      const blob = await res.blob();
      if (blob.size < 200) {
        this.noteFailure();
        return null;
      }
      this.failures = 0;
      this.eleven = true;
      const url = URL.createObjectURL(blob);
      this.cache.set(key, url);
      while (this.cache.size > CACHE_LIMIT) {
        const oldest = this.cache.keys().next().value as string;
        URL.revokeObjectURL(this.cache.get(oldest)!);
        this.cache.delete(oldest);
      }
      return url;
    } catch {
      // Count timeouts and network errors, not our own Stop.
      if (this.isCurrent(run)) this.noteFailure();
      return null;
    } finally {
      clearTimeout(timer);
      run.controllers.delete(controller);
    }
  }

  /** Play one clip. Resolves true when it finished (or was stopped), false if it failed. */
  private playClip(run: Run, url: string): Promise<boolean> {
    const a = this.getAudio();
    if (!a) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        a.removeEventListener("ended", onEnded);
        a.removeEventListener("error", onError);
        resolve(ok);
      };
      const onEnded = () => finish(true);
      const onError = () => finish(false);
      a.addEventListener("ended", onEnded);
      a.addEventListener("error", onError);
      void run.cancelled.then(() => finish(true));
      a.src = url;
      a.defaultPlaybackRate = this.rate;
      a.playbackRate = this.rate;
      a.play().catch(() => finish(false)); // autoplay blocked or unplayable audio
    });
  }

  /** Browser speechSynthesis. Resolves when the last chunk ends or the run is stopped. */
  private browserSpeak(run: Run, text: string, lang: string): Promise<void> {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) {
      return Promise.resolve();
    }
    const synth = window.speechSynthesis;
    const parts = chunk(text, BROWSER_CHUNK);
    const voice = pickVoice(lang);
    return new Promise<void>((resolve) => {
      let left = parts.length;
      void run.cancelled.then(() => resolve());
      for (const part of parts) {
        const u = new SpeechSynthesisUtterance(part);
        u.lang = lang;
        if (voice) u.voice = voice;
        u.rate = this.rate;
        u.onend = u.onerror = () => {
          if (--left <= 0) resolve();
        };
        synth.speak(u);
      }
    });
  }

  private async speakItem(run: Run, item: Item) {
    if (!this.elevenUsable()) {
      await this.browserSpeak(run, item.text, item.lang);
      return;
    }
    const parts = chunk(item.text, ELEVEN_CHUNK);
    const load = (i: number) =>
      this.fetchClip(run, parts[i], item.lang, parts[i - 1] ?? "", parts[i + 1] ?? "");
    let pending: Promise<string | null> | null = load(0);
    for (let i = 0; i < parts.length; i++) {
      const url: string | null = await pending!;
      if (!this.isCurrent(run)) return;
      // Fetch the next chunk while this one plays.
      pending = i + 1 < parts.length ? load(i + 1) : null;
      const ok = url ? await this.playClip(run, url) : false;
      if (!this.isCurrent(run)) return;
      if (!ok) {
        // ElevenLabs failed: say the rest with the browser voice.
        await this.browserSpeak(run, parts.slice(i).join(" "), item.lang);
        return;
      }
    }
  }

  private async drain(run: Run) {
    this.playing = true;
    this.onSpeaking(true);
    while (this.queue.length && this.isCurrent(run)) {
      await this.speakItem(run, this.queue.shift()!);
    }
    if (this.isCurrent(run)) {
      this.playing = false;
      this.run = null;
      this.onSpeaking(false);
    }
  }

  private halt() {
    const run = this.run;
    if (run) {
      run.controllers.forEach((c) => c.abort());
      run.cancel();
    }
    this.run = null;
    this.queue = [];
    this.playing = false;
    if (this.audio) this.audio.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  stop() {
    this.halt();
    this.onSpeaking(false);
  }

  speak(text: string, lang = "en-US", opts: SpeakOptions = {}) {
    if (typeof window === "undefined" || !text) return;
    const item = { text, lang };
    if (opts.queue && this.playing && this.run) {
      this.queue.push(item);
      return;
    }
    this.halt();
    this.queue = [item];
    let cancel = () => {};
    const cancelled = new Promise<void>((r) => (cancel = r));
    const run: Run = { id: ++this.runCounter, cancelled, cancel, controllers: new Set() };
    this.run = run;
    void this.drain(run);
  }

  /** Plays a ready-made audio file, such as a voice's sample in Settings. Stops anything speaking. */
  playUrl(url: string) {
    if (typeof window === "undefined") return;
    this.halt();
    let cancel = () => {};
    const cancelled = new Promise<void>((r) => (cancel = r));
    const run: Run = { id: ++this.runCounter, cancelled, cancel, controllers: new Set() };
    this.run = run;
    this.playing = true;
    this.onSpeaking(true);
    void this.playClip(run, url).then(() => {
      if (!this.isCurrent(run)) return;
      this.playing = false;
      this.run = null;
      this.onSpeaking(false);
    });
  }

  dispose() {
    this.halt();
    this.cache.forEach((url) => URL.revokeObjectURL(url));
    this.cache.clear();
  }
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [engine] = useState(() => new SpeechEngine(setSpeaking));

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Voices load asynchronously in some browsers; touching them starts the load.
    window.speechSynthesis.getVoices();
    const onVoices = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", onVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
    };
  }, []);

  useEffect(() => () => engine.dispose(), [engine]);

  const speak = useCallback(
    (text: string, lang = "en-US", opts?: SpeakOptions) => engine.speak(text, lang, opts),
    [engine],
  );
  const stop = useCallback(() => engine.stop(), [engine]);
  const setRate = useCallback((rate: number) => engine.setRate(rate), [engine]);
  const unlock = useCallback(() => engine.unlock(), [engine]);
  const setElevenAvailable = useCallback(
    (available: boolean) => engine.setElevenAvailable(available),
    [engine],
  );

  const setNatural = useCallback((natural: boolean) => engine.setNatural(natural), [engine]);
  const setVoice = useCallback((voiceId: string) => engine.setVoice(voiceId), [engine]);
  const playUrl = useCallback((url: string) => engine.playUrl(url), [engine]);

  return { speaking, speak, stop, setRate, unlock, setElevenAvailable, setNatural, setVoice, playUrl };
}
