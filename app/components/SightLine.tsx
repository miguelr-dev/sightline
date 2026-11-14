"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MODES,
  MODE_HINTS,
  MODE_LABELS,
  LANGUAGES,
  findLanguage,
  type AnalyzeResponse,
  type Mode,
} from "@/lib/modes";
import { captureVideoFrame, fileToBase64 } from "@/lib/image";
import { beepDone, beepError, beepStart, unlockAudio, vibrate } from "@/lib/feedback";
import { useSpeech } from "@/lib/useSpeech";
import { listenOnce, parseCommand, recognitionSupported, type Listener } from "@/lib/voice";

const INTRO =
  "Welcome to SightLine. Point your camera at something and tap Capture at the bottom of the screen, and I'll tell you what's there.";
const HELP =
  "You can say: read this, describe, what's on the menu, translate to Spanish, repeat, or stop. Or ask a question about the last photo.";
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const MIN_GAP_MS = 1500; // ignore accidental double captures
const REQUEST_TIMEOUT_MS = 45_000;

type CameraState = "off" | "starting" | "on" | "unavailable";
type Result = AnalyzeResponse & { mode: Mode; langCode: string; question?: string };

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked; preferences just won't persist.
  }
}

// Shared button styling: 64px minimum target, thick border, visible focus.
const btn =
  "min-h-16 min-w-16 rounded-2xl border-2 px-4 text-lg font-bold leading-tight " +
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] " +
  "disabled:opacity-60 disabled:cursor-not-allowed";
const btnDark = `${btn} border-white bg-black text-white hover:bg-neutral-800`;
const btnOn = `${btn} border-[var(--accent)] bg-[var(--accent)] text-black`;

export default function SightLine() {
  const [started, setStarted] = useState(false);
  const [camera, setCamera] = useState<CameraState>("off");
  const [mode, setMode] = useState<Mode>("describe");
  const [language, setLanguage] = useState("English");
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [rate, setRateState] = useState(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [listening, setListening] = useState<null | "command" | "question">(null);
  const [canListen, setCanListen] = useState(false);
  const [question, setQuestion] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const lastSendRef = useRef(0);
  const listenerRef = useRef<Listener | null>(null);

  const speech = useSpeech();
  const { speak, stop: stopSpeech, setRate } = speech;

  // Latest state for async callbacks (voice results, fetch completions).
  const latest = useRef({ mode, language, autoSpeak, result, lastImage, camera });
  useEffect(() => {
    latest.current = { mode, language, autoSpeak, result, lastImage, camera };
  });

  // Load saved preferences after mount so server and client render the same HTML.
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- one-time read of saved prefs and browser support */
    setAutoSpeak(readPref("sl.autoSpeak", true));
    const r = readPref("sl.rate", 1);
    setRateState(r);
    setRate(r);
    setLanguage(readPref("sl.language", "English"));
    setCanListen(recognitionSupported());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [setRate]);

  /** Speak if auto-speak is on. Screen reader users can turn it off and rely on the live region. */
  const say = useCallback(
    (text: string, lang = "en-US") => {
      if (latest.current.autoSpeak) speak(text, lang);
    },
    [speak],
  );

  // ---------- Camera ----------
  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera("unavailable");
      setStatus("This browser can't use the camera. Use Upload photo instead.");
      return;
    }
    setCamera("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCamera("on");
    } catch {
      setCamera("unavailable");
      const msg = "Camera is not available. You can upload a photo instead.";
      setStatus(msg);
      say(msg);
    }
  }, [say]);

  useEffect(() => {
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  // Attach the stream if the video element mounts after the stream is ready.
  useEffect(() => {
    if (started && videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [started, camera]);

  // ---------- Analyze ----------
  const analyze = useCallback(
    async (image: string, opts: { mode: Mode; language: string; question?: string }) => {
      const now = Date.now();
      if (busyRef.current || now - lastSendRef.current < MIN_GAP_MS) return;
      busyRef.current = true;
      lastSendRef.current = now;
      setBusy(true);

      stopSpeech();
      beepStart();
      vibrate(50);
      const looking = opts.question ? "Thinking…" : "Looking…";
      setStatus(looking);
      say(opts.question ? "Thinking" : "Looking");

      const langCode =
        opts.mode === "translate"
          ? (findLanguage(opts.language)?.code ?? "en-US")
          : "en-US";

      let data: AnalyzeResponse;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        const res = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image, ...opts }),
          signal: controller.signal,
        });
        data = (await res.json()) as AnalyzeResponse;
        if (!res.ok) data.error = true;
      } catch (e) {
        data = {
          spokenText:
            e instanceof DOMException && e.name === "AbortError"
              ? "That took too long. Please try again."
              : "Sorry, I couldn't reach SightLine. Check your connection and try again.",
          details: "",
          error: true,
        };
      } finally {
        clearTimeout(timer);
      }

      const speakLang = data.error ? "en-US" : langCode;
      setResult({ ...data, mode: opts.mode, langCode: speakLang, question: opts.question });
      setStatus("");
      if (data.error) {
        beepError();
        vibrate([120, 60, 120]);
      } else {
        beepDone();
        vibrate([40, 40, 40]);
      }
      say(data.spokenText, speakLang);

      busyRef.current = false;
      setBusy(false);
    },
    [say, stopSpeech],
  );

  const capture = useCallback(
    (override?: { mode?: Mode; language?: string }) => {
      unlockAudio();
      if (busyRef.current) return;
      const m = override?.mode ?? latest.current.mode;
      const lang = override?.language ?? latest.current.language;
      const video = videoRef.current;
      if (latest.current.camera !== "on" || !video) {
        const msg = "The camera is off. Use the Upload photo button instead.";
        setStatus(msg);
        say(msg);
        return;
      }
      let image: string;
      try {
        image = captureVideoFrame(video);
      } catch {
        const msg = "The camera isn't ready yet. Please try again in a second.";
        setStatus(msg);
        say(msg);
        return;
      }
      setLastImage(image);
      void analyze(image, { mode: m, language: lang });
    },
    [analyze, say],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      unlockAudio();
      try {
        const image = await fileToBase64(file);
        setLastImage(image);
        void analyze(image, { mode: latest.current.mode, language: latest.current.language });
      } catch {
        const msg = "I couldn't open that file. Please choose a photo.";
        setStatus(msg);
        say(msg);
      }
    },
    [analyze, say],
  );

  const ask = useCallback(
    (text: string) => {
      const q = text.trim();
      const img = latest.current.lastImage;
      if (!q) return;
      if (!img) {
        const msg = "Take a photo first, then ask about it.";
        setStatus(msg);
        say(msg);
        return;
      }
      setQuestion("");
      void analyze(img, {
        mode: latest.current.result?.mode ?? latest.current.mode,
        language: latest.current.language,
        question: q,
      });
    },
    [analyze, say],
  );

  const replay = useCallback(() => {
    const r = latest.current.result;
    if (r) speak(r.spokenText, r.langCode);
  }, [speak]);

  // ---------- Voice ----------
  const chooseMode = useCallback(
    (m: Mode, announce = true) => {
      setMode(m);
      if (announce) say(`${MODE_LABELS[m]} mode.`);
    },
    [say],
  );

  const chooseLanguage = useCallback((name: string) => {
    setLanguage(name);
    writePref("sl.language", name);
  }, []);

  const handleCommand = useCallback(
    (heard: string) => {
      const cmd = parseCommand(heard);
      switch (cmd.type) {
        case "stop":
          stopSpeech();
          setStatus("Stopped.");
          return;
        case "repeat":
          if (latest.current.result) replay();
          else say("There's nothing to repeat yet.");
          return;
        case "help":
          setStatus(HELP);
          say(HELP);
          return;
        case "capture":
          setMode(cmd.mode);
          if (cmd.language) chooseLanguage(cmd.language);
          capture({ mode: cmd.mode, language: cmd.language });
          return;
        case "question":
          if (latest.current.lastImage) ask(cmd.text);
          else {
            const msg = `I heard "${heard}", but that's not a command. ${HELP}`;
            setStatus(msg);
            say(msg);
          }
      }
    },
    [ask, capture, chooseLanguage, replay, say, stopSpeech],
  );

  const listen = useCallback(
    (kind: "command" | "question") => {
      unlockAudio();
      if (listenerRef.current) {
        listenerRef.current.stop();
        listenerRef.current = null;
        setListening(null);
        return;
      }
      stopSpeech();
      setStatus(kind === "command" ? "Listening for a command…" : "Listening for your question…");
      vibrate(30);
      setListening(kind);
      listenerRef.current = listenOnce({
        onResult: (text) => {
          setStatus(`Heard: ${text}`);
          if (kind === "command") handleCommand(text);
          else ask(text);
        },
        onError: (reason) => {
          const msg =
            reason === "not-allowed" || reason === "service-not-allowed"
              ? "Microphone access is blocked. You can type your question instead."
              : "I didn't hear anything. Tap the button and try again.";
          setStatus(msg);
          say(msg);
        },
        onEnd: () => {
          listenerRef.current = null;
          setListening(null);
        },
      });
      if (!listenerRef.current) setListening(null);
    },
    [ask, handleCommand, say, stopSpeech],
  );

  // ---------- Settings ----------
  const toggleAutoSpeak = () => {
    const next = !autoSpeak;
    setAutoSpeak(next);
    writePref("sl.autoSpeak", next);
    if (!next) stopSpeech();
    else speak("Auto speak on.");
  };

  const chooseRate = (r: number) => {
    setRateState(r);
    setRate(r);
    writePref("sl.rate", r);
    if (latest.current.result) replay();
  };

  const begin = () => {
    unlockAudio();
    setStarted(true);
    speak(INTRO);
    void startCamera();
  };

  // ---------- Onboarding ----------
  if (!started) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-10">
        <div className="flex flex-col gap-4">
          <h1 className="text-5xl font-extrabold tracking-tight">SightLine</h1>
          <p className="text-2xl font-semibold text-[var(--accent)]">
            Point your camera. Hear the world.
          </p>
          <p className="text-xl leading-relaxed">
            SightLine reads text, describes what&apos;s around you, explains menus and labels, and
            translates signs, out loud.
          </p>
          <p className="text-lg leading-relaxed text-[var(--muted)]">
            When you tap Start, your browser will ask to use the camera. Photos are sent to an AI
            model to be described and are not stored.
          </p>
        </div>
        <button type="button" onClick={begin} className={`${btnOn} min-h-24 text-2xl`}>
          Start SightLine
        </button>
      </main>
    );
  }

  // ---------- Main screen ----------
  const cameraStatus =
    camera === "on"
      ? "Camera on"
      : camera === "starting"
        ? "Starting camera…"
        : "Camera off: upload a photo instead";

  return (
    <div className="relative min-h-dvh overflow-hidden bg-black">
      {/* Live preview. Hidden from screen readers: it has no information they can use. */}
      <video
        ref={videoRef}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-90"
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />

      <div className="relative mx-auto flex min-h-dvh max-w-2xl flex-col gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3 rounded-2xl bg-black/85 p-3">
          <div>
            <h1 className="text-2xl font-extrabold">SightLine</h1>
            <p className="text-base text-[var(--muted)]">
              <span aria-hidden="true">{camera === "on" ? "● " : "○ "}</span>
              {cameraStatus}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAutoSpeak}
            aria-pressed={autoSpeak}
            className={autoSpeak ? btnOn : btnDark}
          >
            Auto-speak: {autoSpeak ? "On" : "Off"}
          </button>
        </header>

        <nav aria-label="Mode" className="rounded-2xl bg-black/85 p-3">
          <h2 className="sr-only">Mode</h2>
          <div className="grid grid-cols-2 gap-2">
            {MODES.map((m) => {
              const on = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  aria-describedby={`hint-${m}`}
                  onClick={() => chooseMode(m)}
                  className={`${on ? btnOn : btnDark} min-h-20 text-xl ${on ? "border-4" : ""}`}
                >
                  <span aria-hidden="true">{on ? "✓ " : ""}</span>
                  {MODE_LABELS[m]}
                  <span id={`hint-${m}`} className="sr-only">
                    {MODE_HINTS[m]}
                  </span>
                </button>
              );
            })}
          </div>
          {mode === "translate" && (
            <div className="mt-3 flex items-center gap-3">
              <label htmlFor="language" className="text-lg font-bold">
                Translate to
              </label>
              <select
                id="language"
                value={language}
                onChange={(e) => chooseLanguage(e.target.value)}
                className="min-h-16 flex-1 rounded-2xl border-2 border-white bg-black px-3 text-lg font-bold text-white focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              >
                {LANGUAGES.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </nav>

        <section
          aria-labelledby="result-heading"
          className="flex min-h-40 flex-1 flex-col gap-3 overflow-y-auto rounded-2xl bg-black/90 p-4"
        >
          <h2 id="result-heading" className="text-lg font-bold text-[var(--muted)]">
            {result?.question ? `Answer to: “${result.question}”` : "Result"}
          </h2>

          <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
            {busy && (
              <p className="flex items-center gap-3 text-2xl font-bold">
                <span
                  aria-hidden="true"
                  className="inline-block h-6 w-6 rounded-full border-4 border-white border-t-transparent motion-safe:animate-spin"
                />
                {status}
              </p>
            )}
            {!busy && status && <p className="text-xl">{status}</p>}
            {!busy && result && (
              <p
                className="text-2xl leading-snug font-semibold"
                lang={result.langCode}
              >
                {result.error && <span className="font-extrabold">Error: </span>}
                {result.spokenText}
              </p>
            )}
            {!busy && !result && !status && (
              <p className="text-xl text-[var(--muted)]">
                Choose a mode, point your camera, and tap Capture.
              </p>
            )}
          </div>

          {result?.details && !busy && (
            <details className="rounded-xl border-2 border-white/60 p-3">
              <summary className="flex min-h-12 cursor-pointer items-center text-lg font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-[var(--focus)]">
                More details
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-lg leading-relaxed">{result.details}</p>
            </details>
          )}

          {lastImage && (
            // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL
            <img
              src={`data:image/jpeg;base64,${lastImage}`}
              alt="The last photo you took"
              className="h-24 w-auto self-start rounded-lg border-2 border-white/60 object-cover"
            />
          )}
        </section>

        {result && (
          <section aria-label="Playback" className="flex flex-col gap-2 rounded-2xl bg-black/85 p-3">
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={replay} className={btnDark} disabled={busy}>
                <span aria-hidden="true">↻ </span>Replay
              </button>
              <button type="button" onClick={stopSpeech} className={btnDark}>
                <span aria-hidden="true">■ </span>Stop
              </button>
            </div>
            <div role="group" aria-labelledby="speed-label" className="flex items-center gap-2">
              <span id="speed-label" className="text-lg font-bold">
                Speed
              </span>
              <div className="grid flex-1 grid-cols-4 gap-2">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={rate === s}
                    aria-label={`${s} times speed`}
                    onClick={() => chooseRate(s)}
                    className={`${rate === s ? btnOn : btnDark} px-1`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {lastImage && (
          <section aria-label="Ask about this photo" className="flex flex-col gap-2 rounded-2xl bg-black/85 p-3">
            {canListen && (
              <button
                type="button"
                onClick={() => listen("question")}
                aria-pressed={listening === "question"}
                className={listening === "question" ? btnOn : btnDark}
                disabled={busy || listening === "command"}
              >
                <span aria-hidden="true">🎤 </span>
                {listening === "question" ? "Listening… tap to cancel" : "Ask about this"}
              </button>
            )}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                ask(question);
              }}
            >
              <label htmlFor="question" className="sr-only">
                Type a question about the photo
              </label>
              <input
                id="question"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={canListen ? "Or type a question" : "Ask about this photo"}
                autoComplete="off"
                className="min-h-16 min-w-0 flex-1 rounded-2xl border-2 border-white bg-black px-4 text-lg text-white placeholder:text-neutral-300 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
              />
              <button type="submit" className={btnDark} disabled={busy || !question.trim()}>
                Ask
              </button>
            </form>
          </section>
        )}

        <div className="sticky bottom-0 flex flex-col gap-2 pb-[env(safe-area-inset-bottom)]">
          <div className={`grid gap-2 ${canListen ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={btnDark}
              disabled={busy}
            >
              <span aria-hidden="true">⬆ </span>Upload photo
            </button>
            {canListen && (
              <button
                type="button"
                onClick={() => listen("command")}
                aria-pressed={listening === "command"}
                className={listening === "command" ? btnOn : btnDark}
                disabled={busy || listening === "question"}
              >
                <span aria-hidden="true">🎤 </span>
                {listening === "command" ? "Listening…" : "Voice command"}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => capture()}
            aria-busy={busy}
            className={`${btnOn} min-h-28 text-3xl`}
          >
            {busy ? "Working…" : `Capture`}
            <span className="block text-lg font-semibold">
              {MODE_LABELS[mode]} mode
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
