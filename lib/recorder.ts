// Voice commands without SpeechRecognition (e.g. iOS Safari added to the home screen):
// record a short clip with MediaRecorder and transcribe it with ElevenLabs Scribe on the server.

import type { Listener } from "./voice";

const MAX_MS = 7_000; // hard stop
const SILENCE_MS = 1_200; // stop this long after the user stops talking
const NO_SPEECH_MS = 4_000; // give up if nothing is said
const LEVEL = 0.02; // RMS level that counts as speech

export function recorderSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function pickMimeType(): string | undefined {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg"];
  return types.find((t) => {
    try {
      return MediaRecorder.isTypeSupported(t);
    } catch {
      return false;
    }
  });
}

/**
 * Record one phrase and transcribe it. Same callback shape as listenOnce in voice.ts.
 * Call from a tap so the microphone prompt is allowed.
 */
export function recordOnce(opts: {
  onResult: (text: string) => void;
  onError: (reason: string) => void;
  onEnd?: () => void;
  onTranscribing?: () => void;
}): Listener {
  let cancelled = false;
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioCtx: AudioContext | null = null;
  let raf = 0;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let ended = false;
  let heardSpeech = false;

  const cleanup = () => {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    stream?.getTracks().forEach((t) => t.stop());
    void audioCtx?.close().catch(() => {});
  };
  const end = () => {
    if (ended) return;
    ended = true;
    cleanup();
    opts.onEnd?.();
  };
  const stopRecording = () => {
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      opts.onError(name === "NotAllowedError" || name === "SecurityError" ? "not-allowed" : "start-failed");
      end();
      return;
    }
    if (cancelled) {
      end();
      return;
    }

    const mimeType = pickMimeType();
    try {
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    } catch {
      opts.onError("start-failed");
      end();
      return;
    }
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = async () => {
      cleanup();
      if (cancelled) return end();
      if (!heardSpeech || !chunks.length) {
        opts.onError("no-speech");
        return end();
      }
      opts.onTranscribing?.();
      const type = recorder?.mimeType || mimeType || "audio/webm";
      const blob = new Blob(chunks, { type });
      try {
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": type },
          body: blob,
          signal: AbortSignal.timeout(15_000),
        });
        const data = (await res.json().catch(() => ({}))) as { text?: string };
        if (cancelled) return end();
        const text = (data.text ?? "").trim();
        if (res.ok && text) opts.onResult(text);
        else opts.onError(res.ok ? "no-speech" : "network");
      } catch {
        if (!cancelled) opts.onError("network");
      }
      end();
    };
    recorder.start();

    // Simple end-of-speech detection from the microphone level.
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      audioCtx = new Ctor();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      let lastLoud = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (const v of data) sum += v * v;
        const rms = Math.sqrt(sum / data.length);
        const now = performance.now();
        if (rms > LEVEL) {
          heardSpeech = true;
          lastLoud = now;
        }
        if (heardSpeech && now - lastLoud > SILENCE_MS) return stopRecording();
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      timers.push(
        setTimeout(() => {
          if (!heardSpeech) stopRecording();
        }, NO_SPEECH_MS),
      );
    } catch {
      // No level meter: just record for a fixed time and send it.
      heardSpeech = true;
      timers.push(setTimeout(stopRecording, 4_000));
    }
    timers.push(setTimeout(stopRecording, MAX_MS));
  })();

  return {
    stop: () => {
      // Tapping again while recording sends what was said so far; cancel otherwise.
      if (recorder && recorder.state === "recording") {
        heardSpeech = true;
        stopRecording();
      } else {
        cancelled = true;
        stopRecording();
        end();
      }
    },
  };
}
