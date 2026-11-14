// Non-visual feedback: short beeps and haptics.

let audioCtx: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!audioCtx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Call from a user gesture so later beeps are allowed to play. */
export function unlockAudio() {
  ctx();
}

function tone(freq: number, startOffset: number, duration: number) {
  const c = ctx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const t = c.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** One short low beep: capture started. */
export function beepStart() {
  tone(660, 0, 0.12);
}

/** Two rising beeps: result ready. */
export function beepDone() {
  tone(660, 0, 0.1);
  tone(990, 0.13, 0.14);
}

/** Low descending beeps: something went wrong. */
export function beepError() {
  tone(440, 0, 0.14);
  tone(300, 0.17, 0.2);
}

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    // Not supported (e.g. iOS Safari); ignore.
  }
}
