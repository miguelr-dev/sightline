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
import {
  CameraIcon,
  CheckIcon,
  ImageIcon,
  LogoMark,
  MicIcon,
  MODE_ICONS,
  ReplayIcon,
  SendIcon,
  SpeakerIcon,
  SpeakerOffIcon,
  StopIcon,
  UploadIcon,
} from "./icons";

const INTRO =
  "Welcome to SightLine. Point your camera at something and tap Capture at the bottom of the screen. I'll read it, describe it, or translate it for you.";
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

// Shared styling. Every control is at least 64px tall with a thick border and a
// visible focus ring; colors are AAA contrast on black.
const btn =
  "inline-flex min-h-16 min-w-16 items-center justify-center gap-2 rounded-2xl border-2 px-4 " +
  "text-lg font-bold leading-tight transition-colors " +
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] " +
  "disabled:cursor-not-allowed disabled:opacity-60";
const btnDark = `${btn} border-white/85 bg-black text-white hover:bg-white/10`;
const btnOn = `${btn} border-[var(--accent)] bg-[var(--accent)] text-black hover:bg-[var(--accent-strong)]`;
const panel = "rounded-3xl border border-white/20 bg-[var(--surface)]";
const sectionLabel = "text-base font-bold uppercase tracking-wider text-[var(--muted)]";
const field =
  "min-h-16 rounded-2xl border-2 border-white/85 bg-black px-4 text-lg text-white " +
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]";

// One-line summaries for the onboarding screen.
const MODE_SHORT: Record<Mode, string> = {
  read: "Reads text aloud",
  describe: "Says what you're showing",
  menu: "Menus, products, medicine",
  translate: "Signs and menus abroad",
};

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
      <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-10 px-6 py-10 lg:max-w-2xl">
        <div className="flex flex-col gap-5">
          <LogoMark size={72} />
          <div className="flex flex-col gap-2">
            <h1 className="text-5xl font-bold tracking-tight lg:text-6xl">SightLine</h1>
            <p className="text-2xl font-bold text-[var(--accent)] lg:text-3xl">
              Point your camera. Hear the world.
            </p>
          </div>
          <div className="flex flex-col gap-1 text-xl leading-relaxed lg:text-2xl">
            <p>
              <span className="font-bold">Can&apos;t see it?</span> SightLine reads text and describes
              things out loud.
            </p>
            <p>
              <span className="font-bold">Can&apos;t read it?</span> SightLine translates signs, menus,
              and labels when you travel.
            </p>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" aria-label="What SightLine can do">
            {MODES.map((m) => {
              const ModeIcon = MODE_ICONS[m];
              return (
                <li key={m} className={`${panel} flex items-center gap-3 px-4 py-3`}>
                  <span className="text-[var(--accent)]">
                    <ModeIcon size={28} />
                  </span>
                  <span className="text-lg">
                    <span className="font-bold">{MODE_LABELS[m]}</span>
                    <span className="block text-base text-[var(--muted)]">{MODE_SHORT[m]}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-lg leading-relaxed text-[var(--muted)]">
            When you tap Start, your browser will ask to use the camera. Each photo is sent to an AI
            model to be described. SightLine doesn&apos;t save your photos.
          </p>
        </div>
        <button type="button" onClick={begin} className={`${btnOn} min-h-24 text-2xl`}>
          <CameraIcon size={30} />
          Start SightLine
        </button>
      </main>
    );
  }

  // ---------- Main screen ----------
  const cameraStatus =
    camera === "on" ? "Camera on" : camera === "starting" ? "Starting camera…" : "Camera off";
  const showLastPhoto = camera !== "on" && lastImage;
  const ResultIcon = result ? MODE_ICONS[result.mode] : null;

  return (
    <div className="relative isolate h-dvh overflow-hidden bg-black">
      <div className="mx-auto flex h-dvh max-w-2xl flex-col gap-3 px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] lg:grid lg:max-w-[1600px] lg:grid-cols-[minmax(0,1.5fr)_minmax(440px,1fr)] lg:grid-rows-[auto_minmax(0,1fr)_auto] lg:gap-5 lg:px-8 lg:pb-8 lg:pt-6">
        <header className={`${panel} flex shrink-0 items-center justify-between gap-3 p-3 lg:col-span-2 lg:px-5`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden sm:block">
              <LogoMark size={40} />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold leading-tight">SightLine</h1>
              <p className="flex items-center gap-2 text-base text-[var(--muted)]">
                <span
                  aria-hidden="true"
                  className={`inline-block h-2.5 w-2.5 rounded-full ${
                    camera === "on" ? "bg-[var(--live)]" : "border-2 border-[var(--muted)]"
                  }`}
                />
                {cameraStatus}
                <span className="hidden text-[var(--muted)] lg:inline">
                  <span aria-hidden="true"> · </span>Point your camera. Hear the world.
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={toggleAutoSpeak}
            aria-pressed={autoSpeak}
            className={`${autoSpeak ? btnOn : btnDark} shrink-0`}
          >
            {autoSpeak ? <SpeakerIcon /> : <SpeakerOffIcon />}
            <span className="flex flex-col items-start leading-tight lg:flex-row">
              <span className="text-base lg:text-lg">Auto-speak</span>
              <span>
                <span className="hidden lg:inline">:{"\u00a0"}</span>
                {autoSpeak ? "On" : "Off"}
              </span>
            </span>
          </button>
        </header>

        {/* Camera. Full-screen backdrop on phones; a framed viewer on wide screens. */}
        <div
          aria-hidden="true"
          className="fixed inset-0 -z-10 bg-black lg:relative lg:inset-auto lg:z-auto lg:col-start-1 lg:row-start-2 lg:overflow-hidden lg:rounded-3xl lg:border lg:border-white/20"
        >
          <video
            ref={videoRef}
            className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${
              camera === "on" ? "opacity-90 lg:opacity-100" : "opacity-0"
            }`}
            playsInline
            muted
            autoPlay
          />
          {showLastPhoto && (
            // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL
            <img
              src={`data:image/jpeg;base64,${lastImage}`}
              alt=""
              className="absolute inset-0 h-full w-full object-cover opacity-30 lg:object-contain lg:px-10 lg:pb-10 lg:pt-24 lg:opacity-100"
            />
          )}
          {!showLastPhoto && camera !== "on" && (
            <div className="absolute inset-0 hidden flex-col items-center justify-center gap-3 text-center text-[var(--muted)] lg:flex">
              <ImageIcon size={56} />
              <p className="text-2xl font-bold text-white">Camera is off</p>
              <p className="text-lg">Upload a photo to try SightLine.</p>
            </div>
          )}
          {/* Viewfinder corners and a status chip, wide screens only. */}
          <div className="pointer-events-none absolute inset-6 hidden lg:block">
            <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-white/80" />
            <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-white/80" />
            <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-white/80" />
            <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-white/80" />
          </div>
          <div className="absolute left-1/2 top-8 hidden -translate-x-1/2 items-center gap-2 rounded-full bg-black/85 px-4 py-2 text-lg font-bold lg:flex">
            {camera === "on" ? (
              <>
                <span className="h-3 w-3 rounded-full bg-[var(--live)]" />
                Live
              </>
            ) : showLastPhoto ? (
              <>
                <ImageIcon size={20} />
                Last photo
              </>
            ) : null}
          </div>
        </div>

        <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:col-start-2 lg:row-span-2 lg:row-start-2 lg:gap-4">
          <nav aria-label="Mode" className={`${panel} shrink-0 p-3 lg:p-4`}>
            <h2 className={sectionLabel}>Mode</h2>
            <div className="mt-2 grid grid-cols-2 gap-2 lg:gap-3">
              {MODES.map((m) => {
                const on = mode === m;
                const ModeIcon = MODE_ICONS[m];
                return (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={on}
                    aria-describedby={`hint-${m}`}
                    onClick={() => chooseMode(m)}
                    className={`${on ? btnOn : btnDark} relative flex-col gap-0.5 px-2 py-1.5 lg:min-h-20 lg:gap-1 lg:py-2 lg:text-xl ${
                      on ? "border-4" : ""
                    }`}
                  >
                    {on && (
                      <span className="absolute right-2 top-2 hidden rounded-full bg-black p-0.5 text-[var(--accent)] lg:block">
                        <CheckIcon size={16} />
                      </span>
                    )}
                    {/* Phones show a check in place of the mode icon when selected. */}
                    {on && <CheckIcon size={22} className="lg:hidden" />}
                    <ModeIcon size={28} className={`h-[22px] w-[22px] lg:h-7 lg:w-7 ${on ? "hidden lg:block" : ""}`} />
                    <span className="whitespace-nowrap">{MODE_LABELS[m]}</span>
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
                  className={`${field} flex-1 font-bold`}
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
            className={`${panel} flex min-h-44 shrink-0 grow flex-col gap-3 p-4 lg:p-6`}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="result-heading" className={sectionLabel}>
                {result?.question ? "Answer" : "Result"}
              </h2>
              {result && ResultIcon && !busy && (
                <span className="flex items-center gap-1.5 rounded-full border border-white/40 px-3 py-1 text-base font-bold">
                  <ResultIcon size={18} />
                  {MODE_LABELS[result.mode]}
                </span>
              )}
            </div>

            {result?.question && !busy && (
              <p className="text-lg text-[var(--muted)]">
                You asked: <span className="font-bold text-white">“{result.question}”</span>
              </p>
            )}

            <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
              {busy && (
                <p className="flex items-center gap-3 text-2xl font-bold lg:text-3xl">
                  <span
                    aria-hidden="true"
                    className="inline-block h-7 w-7 rounded-full border-4 border-[var(--accent)] border-t-transparent motion-safe:animate-spin"
                  />
                  {status}
                </p>
              )}
              {!busy && status && <p className="text-xl">{status}</p>}
              {!busy && result && (
                <p
                  className={`text-2xl font-bold leading-snug lg:text-3xl lg:leading-snug ${
                    result.error ? "border-l-8 border-[var(--danger)] pl-3" : ""
                  }`}
                  lang={result.langCode}
                >
                  {result.error && <span className="text-[var(--danger)]">Error: </span>}
                  {result.spokenText}
                </p>
              )}
              {!busy && !result && !status && (
                <p className="text-xl leading-relaxed text-[var(--muted)] lg:text-2xl">
                  Choose a mode, point your camera at something, and tap Capture.
                </p>
              )}
            </div>

            {result?.details && !busy && (
              <details className="group rounded-2xl border-2 border-white/40">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-4 text-lg font-bold focus-visible:outline focus-visible:outline-4 focus-visible:outline-[var(--focus)] [&::-webkit-details-marker]:hidden">
                  More details
                  <span aria-hidden="true" className="text-2xl transition-transform group-open:rotate-90">
                    ›
                  </span>
                </summary>
                <p className="whitespace-pre-wrap px-4 pb-4 text-lg leading-relaxed">{result.details}</p>
              </details>
            )}

            {lastImage && (
              // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL
              <img
                src={`data:image/jpeg;base64,${lastImage}`}
                alt="The last photo you took"
                className="h-24 w-auto self-start rounded-xl border-2 border-white/40 object-cover lg:hidden"
              />
            )}
          </section>

          {result && (
            <section aria-labelledby="playback-heading" className={`${panel} flex shrink-0 flex-col gap-3 p-3 lg:p-4`}>
              <h2 id="playback-heading" className={sectionLabel}>
                Playback
              </h2>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={replay} className={btnDark} disabled={busy}>
                  <ReplayIcon />
                  Replay
                </button>
                <button type="button" onClick={stopSpeech} className={btnDark}>
                  <StopIcon />
                  Stop
                </button>
              </div>
              <div role="group" aria-labelledby="speed-label" className="flex items-center gap-3">
                <span id="speed-label" className="text-lg font-bold">
                  Speed
                </span>
                <div className="grid flex-1 grid-cols-4 gap-1.5 rounded-2xl border-2 border-white/40 p-1">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={rate === s}
                      aria-label={`${s} times speed`}
                      onClick={() => chooseRate(s)}
                      className={`${btn} min-w-0 px-1 ${
                        rate === s
                          ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                          : "border-transparent text-white hover:bg-white/10"
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}

          {lastImage && (
            <section aria-labelledby="ask-heading" className={`${panel} flex shrink-0 flex-col gap-3 p-3 lg:p-4`}>
              <h2 id="ask-heading" className={sectionLabel}>
                Ask about this photo
              </h2>
              {canListen && (
                <button
                  type="button"
                  onClick={() => listen("question")}
                  aria-pressed={listening === "question"}
                  className={listening === "question" ? btnOn : btnDark}
                  disabled={busy || listening === "command"}
                >
                  <MicIcon />
                  {listening === "question" ? "Listening… tap to cancel" : "Ask with your voice"}
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
                  placeholder={canListen ? "Or type a question" : "Type a question"}
                  autoComplete="off"
                  className={`${field} min-w-0 flex-1 placeholder:text-neutral-300`}
                />
                <button type="submit" className={btnDark} disabled={busy || !question.trim()}>
                  <SendIcon />
                  Ask
                </button>
              </form>
            </section>
          )}
        </main>

        <div className="flex shrink-0 flex-col gap-2 pb-[env(safe-area-inset-bottom)] lg:col-start-1 lg:row-start-3 lg:flex-row lg:gap-3 lg:pb-0">
          <div className={`grid gap-2 lg:flex lg:gap-3 ${canListen ? "grid-cols-2" : "grid-cols-1"}`}>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className={`${btnDark} lg:min-h-24 lg:px-6`}
              disabled={busy}
            >
              <UploadIcon />
              Upload photo
            </button>
            {canListen && (
              <button
                type="button"
                onClick={() => listen("command")}
                aria-pressed={listening === "command"}
                className={`${listening === "command" ? btnOn : btnDark} lg:min-h-24 lg:px-6`}
                disabled={busy || listening === "question"}
              >
                <MicIcon />
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
            className={`${btnOn} min-h-24 gap-4 text-3xl shadow-[0_0_0_4px_rgba(0,0,0,0.6)] lg:flex-1`}
          >
            {busy ? (
              <span
                aria-hidden="true"
                className="inline-block h-9 w-9 rounded-full border-4 border-black border-t-transparent motion-safe:animate-spin"
              />
            ) : (
              <CameraIcon size={40} />
            )}
            <span className="flex flex-col items-start">
              {busy ? "Working…" : "Capture"}
              <span className="text-lg font-bold">{MODE_LABELS[mode]} mode</span>
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
