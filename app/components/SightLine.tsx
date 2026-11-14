"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  REQUEST_MODES,
  MODE_HINTS,
  MODE_LABELS,
  LANGUAGES,
  findLanguage,
  type AnalyzeResponse,
  type AskResponse,
  type Features,
  type LookupResponse,
  type Mode,
  type RequestMode,
  type Section,
} from "@/lib/modes";
import { captureVideoFrame, fileToBase64 } from "@/lib/image";
import { beepDone, beepError, beepStart, unlockAudio, vibrate } from "@/lib/feedback";
import { useSpeech, type SpeakOptions } from "@/lib/useSpeech";
import { listenOnce, parseCommand, recognitionSupported, type Listener } from "@/lib/voice";
import { recordOnce, recorderSupported } from "@/lib/recorder";
import { Magnifier } from "./Magnifier";

const INTRO =
  "Welcome to SightLine. Point your camera at something and tap Capture at the bottom of the screen, and I'll tell you what's there.";
const HELP =
  "You can say: read this, describe, what's on the menu, translate to Spanish, look it up, what did I scan earlier, repeat, or stop. Or ask a question about the last photo.";
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const MIN_GAP_MS = 1500; // ignore accidental double captures
const REQUEST_TIMEOUT_MS = 45_000;
const LOOKUP_TIMEOUT_MS = 20_000; // the server stops itself at about 15 seconds
const ASK_TIMEOUT_MS = 25_000;
// Camera zoom, as in the iPhone app (mobile/src/logic/zoom.ts): 1×, 2× and 5× chips, or pinch.
const ZOOM_CHIPS = [1, 2, 5] as const;
const MAX_ZOOM = 5;
type HwZoom = { min: number; max: number } | null; // the camera's own zoom range, where the browser exposes it

/** The chip to highlight for zoom `z`, and the label it shows (the exact zoom between chips, like iOS). */
function zoomChips(z: number) {
  const near = ZOOM_CHIPS.reduce((a, c) => (Math.abs(Math.log(z / c)) < Math.abs(Math.log(z / a)) ? c : a), 1 as number);
  const exact = Math.abs(z - near) / near <= 0.08;
  return ZOOM_CHIPS.map((c) => ({ c, on: c === near, text: c === near && !exact ? `${Math.round(z * 10) / 10}×` : `${c}×` }));
}

type CameraState = "off" | "starting" | "on" | "unavailable";
type Result = AnalyzeResponse & { mode: Mode; langCode: string; question?: string };
type WebState =
  | { status: "loading"; query: string }
  | { status: "done"; data: LookupResponse };

function readPref<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
/** A random ID for this browser, sent as x-sightline-device so the server can keep its history. */
function deviceHeader(): Record<string, string> {
  try {
    let id = localStorage.getItem("sl.device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("sl.device", id);
    }
    return { "x-sightline-device": id };
  } catch {
    return {}; // storage blocked: no history, everything else still works
  }
}

function writePref(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked; preferences just won't persist.
  }
}

// White, Apple-style UI matching the iPhone app (mobile/src/theme.ts): black on white, a grey
// surface for controls, black pill buttons, and one red accent for listening. Every text colour
// passes WCAG AA; every control is at least 48px tall.
const focus =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-black";
const pill = `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-5 text-[17px] font-semibold leading-tight ${focus} disabled:cursor-not-allowed disabled:opacity-50`;
const pillBlack = `${pill} bg-black text-white hover:bg-[#2C2C2E]`;
const pillGrey = `${pill} bg-[#F2F2F7] text-black hover:bg-[#E5E5EA]`;
const focusLight =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white";
const caption = "text-[13px] font-semibold uppercase tracking-[0.04em] text-[#55555A]";

function Svg({ children, size = 20 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}
const I = {
  camera: (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M4.5 7h2.8l1.7-2.5h6l1.7 2.5h2.8A1.5 1.5 0 0 1 21 8.5V18a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18V8.5A1.5 1.5 0 0 1 4.5 7z" />
      <circle cx="12" cy="13" r="3.4" fill="#000" />
    </svg>
  ),
  photo: <Svg><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 16l-5-5-9 9" /></Svg>,
  mic: <Svg><rect x="9" y="2.5" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" /></Svg>,
  check: <Svg size={16}><path d="M4.5 12.5l5 5 10-11" /></Svg>,
  chevron: <Svg size={16}><path d="M6 9l6 6 6-6" /></Svg>,
  replay: <Svg size={18}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 3.5v5h5" /></Svg>,
  stop: <svg width={14} height={14} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor" /></svg>,
  globe: <Svg size={18}><circle cx="12" cy="12" r="9.5" /><path d="M2.5 12h19M12 2.5c2.6 2.7 3.9 5.9 3.9 9.5s-1.3 6.8-3.9 9.5c-2.6-2.7-3.9-5.9-3.9-9.5s1.3-6.8 3.9-9.5z" /></Svg>,
  speaker: <Svg size={16}><path d="M4 9h3.5L13 4.5v15L7.5 15H4z" /><path d="M16.5 9a4 4 0 0 1 0 6" /></Svg>,
  speakerOff: <Svg size={16}><path d="M4 9h3.5L13 4.5v15L7.5 15H4z" /><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" /></Svg>,
  send: <Svg size={18}><path d="M12 19V5M6 11l6-6 6 6" /></Svg>,
  magnify: <Svg size={20}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L21 21M10.5 7.5v6M7.5 10.5h6" /></Svg>,
};

/** Item-dependent detail sections as collapsible rows, like the iPhone app. */
function Sections({ sections, fallback }: { sections?: Section[]; fallback?: string }) {
  if (sections?.length) {
    return (
      <div className="flex flex-col">
        {sections.map((s, i) => (
          <details key={`${i}-${s.title}`} className="group border-t border-[#E5E5EA]">
            <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[17px] font-semibold [&::-webkit-details-marker]:hidden ${focus}`}>
              {s.title}
              <span className="transition-transform group-open:rotate-180 motion-reduce:transition-none">{I.chevron}</span>
            </summary>
            <p className="whitespace-pre-wrap pb-3 text-[17px] leading-relaxed">{s.body}</p>
          </details>
        ))}
      </div>
    );
  }
  return fallback ? <p className="whitespace-pre-wrap text-[17px] leading-relaxed">{fallback}</p> : null;
}

const modeLabel = (m: RequestMode) => (m === "auto" ? "Auto" : MODE_LABELS[m]);
const modeHint = (m: RequestMode) => (m === "auto" ? "SightLine picks the best mode for each photo." : MODE_HINTS[m]);

export default function SightLine() {
  const [started, setStarted] = useState(false);
  const [camera, setCamera] = useState<CameraState>("off");
  const [mode, setMode] = useState<RequestMode>("auto"); // Auto first, as in the iPhone app
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
  const [features, setFeatures] = useState<Features | null>(null);
  const [web, setWeb] = useState<WebState | null>(null);
  const [webLang, setWebLang] = useState("en-US"); // voice language for the web summary
  const [recording, setRecording] = useState(false); // voice input via ElevenLabs Scribe
  const [zoom, setZoomState] = useState(1); // 1× to 5×
  const [hwZoom, setHwZoom] = useState<HwZoom>(null);
  const [magnify, setMagnify] = useState(false);
  const [vfCenter, setVfCenter] = useState<string | undefined>(); // CSS zoom centres on the viewfinder

  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null); // the viewfinder: what's inside it is what gets sent
  // The answer sheet shows the latest result until the user taps Done or takes a new photo.
  const [dismissed, setDismissed] = useState<Result | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const lastSendRef = useRef(0);
  const listenerRef = useRef<Listener | null>(null);
  const lookupIdRef = useRef(0);
  const zoomRef = useRef(1);
  const pinchRef = useRef<{ d: number; z: number } | null>(null);

  const speech = useSpeech();
  const { speak, stop: stopSpeech, setRate, unlock: unlockSpeech, setElevenAvailable } = speech;

  // Latest state for async callbacks (voice results, fetch completions).
  const latest = useRef({ mode, language, autoSpeak, result, lastImage, camera, features, web, webLang });
  useEffect(() => {
    latest.current = { mode, language, autoSpeak, result, lastImage, camera, features, web, webLang };
  });

  /** Call from every tap: unlocks beeps and speech audio (iOS Safari needs a gesture). */
  const unlockAll = useCallback(() => {
    unlockAudio();
    unlockSpeech();
  }, [unlockSpeech]);

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

  // Ask the server which optional integrations (ElevenLabs, Bright Data) are configured.
  useEffect(() => {
    let alive = true;
    fetch("/api/features")
      .then((r) => (r.ok ? (r.json() as Promise<Features>) : null))
      .then((f) => {
        if (!alive || !f) return;
        setFeatures(f);
        setElevenAvailable(f.elevenlabs);
        if (f.transcribe && recorderSupported()) setCanListen(true);
      })
      .catch(() => {
        // Offline or older server: the browser voice and no web lookup.
      });
    return () => {
      alive = false;
    };
  }, [setElevenAvailable]);

  /** Speak if auto-speak is on. Screen reader users can turn it off and rely on the live region. */
  const say = useCallback(
    (text: string, lang = "en-US", opts?: SpeakOptions) => {
      if (latest.current.autoSpeak) speak(text, lang, opts);
    },
    [speak],
  );

  // ---------- Web lookup (Bright Data SERP API + Claude summary) ----------
  const runLookup = useCallback(
    async (opts: { auto: boolean; result?: Result }) => {
      // The fresh result is passed in right after a capture, before `latest` has caught up.
      const r = opts.result ?? latest.current.result;
      if (!r || r.error) {
        if (!opts.auto) {
          const msg = "Take a photo first, then I can look it up on the web.";
          setStatus(msg);
          say(msg);
        }
        return;
      }
      if (!latest.current.features?.lookup) {
        if (!opts.auto) {
          const msg = "Web lookup isn't set up on this server.";
          beepError();
          setStatus(msg);
          say(msg);
        }
        return;
      }
      const id = ++lookupIdRef.current;
      const query = r.webQuery ?? "";
      setWeb({ status: "loading", query });
      if (!opts.auto) {
        beepStart();
        vibrate(50);
        say("Checking the web.");
      }

      let data: LookupResponse;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);
      try {
        const res = await fetch("/api/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...deviceHeader() },
          body: JSON.stringify({
            query,
            scanId: r.scanId,
            itemKind: r.itemKind,
            // Translate mode: the web summary comes back in the chosen language.
            language: r.mode === "translate" ? latest.current.language : "English",
            context: { mode: r.mode, spokenText: r.spokenText, details: r.details },
          }),
          signal: controller.signal,
        });
        data = (await res.json()) as LookupResponse;
        if (!res.ok) data.error = true;
      } catch (e) {
        data = {
          spokenText:
            e instanceof DOMException && e.name === "AbortError"
              ? "The web lookup took too long, so I stopped it."
              : "I couldn't reach the web just now.",
          details: "",
          query,
          sources: [],
          error: true,
        };
      } finally {
        clearTimeout(timer);
      }
      if (id !== lookupIdRef.current) return; // a newer photo or lookup replaced this one

      if (data.skipped && (opts.auto || !data.spokenText)) {
        setWeb(null); // nothing to search for: stay quiet after an automatic lookup
        return;
      }
      setWeb({ status: "done", data });
      if (data.error) {
        beepError();
        vibrate([120, 60, 120]);
      } else {
        if (!opts.auto) beepDone(); // don't beep over the first answer
        vibrate([40, 40, 40]);
      }
      // Wait for the first answer (or "Checking the web") to finish, then speak this.
      const webLang = r.mode === "translate" && !data.error ? r.langCode : "en-US";
      setWebLang(webLang);
      say(data.spokenText, webLang, { queue: true });
    },
    [say],
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
      // Use the camera's own zoom where the browser supports it (Chrome on Android); otherwise
      // zoom the preview with CSS. Either way the photo is cropped to the corners on screen.
      const caps = stream.getVideoTracks()[0]?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number; max: number } }) | undefined;
      setHwZoom(caps?.zoom && caps.zoom.max > caps.zoom.min ? { min: caps.zoom.min, max: caps.zoom.max } : null);
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

  const setZoom = useCallback(
    (f: number) => {
      const z = Math.max(1, Math.min(MAX_ZOOM, f));
      zoomRef.current = z;
      setZoomState(z);
      const track = streamRef.current?.getVideoTracks()[0];
      if (hwZoom && track) {
        track
          .applyConstraints({ advanced: [{ zoom: Math.min(hwZoom.max, hwZoom.min * z) } as MediaTrackConstraintSet] })
          .catch(() => setHwZoom(null)); // fall back to CSS zoom
      }
    },
    [hwZoom],
  );

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setVfCenter(`${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px`);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [started]);

  // Back to 1× when the page is hidden, as the iPhone app does when it's backgrounded.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && zoomRef.current !== 1) setZoom(1);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [setZoom]);

  // Attach the stream if the video element mounts after the stream is ready.
  useEffect(() => {
    if (started && videoRef.current && streamRef.current && !videoRef.current.srcObject) {
      videoRef.current.srcObject = streamRef.current;
      void videoRef.current.play().catch(() => {});
    }
  }, [started, camera]);

  // ---------- Analyze ----------
  const analyze = useCallback(
    async (image: string, opts: { mode: RequestMode; language: string; question?: string }) => {
      const now = Date.now();
      if (busyRef.current || now - lastSendRef.current < MIN_GAP_MS) return;
      busyRef.current = true;
      lastSendRef.current = now;
      setBusy(true);

      stopSpeech();
      lookupIdRef.current++; // drop any web lookup for the previous photo
      setWeb(null);
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
          headers: { "Content-Type": "application/json", ...deviceHeader() },
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
      // In Auto the server reports the mode it chose.
      const fresh: Result = { ...data, mode: data.mode ?? (opts.mode === "auto" ? "describe" : opts.mode), langCode: speakLang, question: opts.question };
      setResult(fresh);
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

      // When the photo shows a specific product, medicine, restaurant, book or place, look it up
      // on the web (recalls, nutrition, reviews, hours). Runs after the first answer is out,
      // so it never delays it.
      if (
        !data.error &&
        !opts.question &&
        data.webQuery &&
        data.itemKind &&
        data.itemKind !== "none"
      ) {
        void runLookup({ auto: true, result: fresh });
      }
    },
    [runLookup, say, stopSpeech],
  );

  const capture = useCallback(
    (override?: { mode?: RequestMode; language?: string }) => {
      unlockAll();
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
        // Only what's inside the camera corners is sent.
        image = captureVideoFrame(video, frameRef.current?.getBoundingClientRect() ?? null);
      } catch {
        const msg = "The camera isn't ready yet. Please try again in a second.";
        setStatus(msg);
        say(msg);
        return;
      }
      setLastImage(image);
      setDismissed(latest.current.result);
      void analyze(image, { mode: m, language: lang });
    },
    [analyze, say, unlockAll],
  );

  const onFile = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      unlockAll();
      try {
        const image = await fileToBase64(file);
        setLastImage(image);
        setDismissed(latest.current.result);
        void analyze(image, { mode: latest.current.mode, language: latest.current.language });
      } catch {
        const msg = "I couldn't open that file. Please choose a photo.";
        setStatus(msg);
        say(msg);
      }
    },
    [analyze, say, unlockAll],
  );

  // ---------- Ask your history (Claude agent over the scans saved in Neon) ----------
  const runAsk = useCallback(
    async (text: string) => {
      const q = text.trim();
      if (!q) return;
      if (!latest.current.features?.ask) {
        const msg = "Scan history isn't set up on this server, so I can't look back at earlier scans.";
        beepError();
        setStatus(msg);
        say(msg);
        return;
      }
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setQuestion("");
      stopSpeech();
      lookupIdRef.current++;
      setWeb(null);
      beepStart();
      vibrate(50);
      setStatus("Checking your history…");
      say("Checking your history");

      const translate = latest.current.mode === "translate";
      const langCode = translate ? (findLanguage(latest.current.language)?.code ?? "en-US") : "en-US";
      let data: AskResponse;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), ASK_TIMEOUT_MS);
      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...deviceHeader() },
          body: JSON.stringify({
            question: q,
            language: translate ? latest.current.language : "English",
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
          signal: controller.signal,
        });
        data = (await res.json()) as AskResponse;
        if (!res.ok) data.error = true;
      } catch {
        data = { spokenText: "Sorry, I couldn't reach your history just now.", error: true };
      } finally {
        clearTimeout(timer);
      }

      const sections = data.sections ?? [];
      const speakLang = data.error ? "en-US" : langCode;
      setResult({
        spokenText: data.spokenText,
        sections,
        details: sections.map((x) => `${x.title}\n${x.body}`).join("\n\n"),
        error: data.error,
        mode: latest.current.result?.mode ?? (latest.current.mode === "auto" ? "describe" : latest.current.mode),
        langCode: speakLang,
        question: q,
      });
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

  const ask = useCallback(
    (text: string) => {
      const q = text.trim();
      // "What did I scan earlier?" and similar go to the history, not the current photo.
      if (q && parseCommand(q).type === "ask" && latest.current.features?.ask) {
        void runAsk(q);
        return;
      }
      const img = latest.current.lastImage;
      if (!q) return;
      if (!img) {
        if (latest.current.features?.ask) {
          void runAsk(q); // no photo yet: answer from the scan history
          return;
        }
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
    [analyze, runAsk, say],
  );

  const replay = useCallback(() => {
    const r = latest.current.result;
    if (!r) return;
    speak(r.spokenText, r.langCode);
    const w = latest.current.web;
    if (w?.status === "done" && !w.data.error) {
      speak(w.data.spokenText, latest.current.webLang, { queue: true });
    }
  }, [speak]);

  // ---------- Voice ----------
  const chooseMode = useCallback(
    (m: RequestMode, announce = true) => {
      setMode(m);
      if (announce) say(`${modeLabel(m)} mode.`);
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
        case "lookup":
          void runLookup({ auto: false });
          return;
        case "ask":
          void runAsk(cmd.text);
          return;
        case "capture":
          setMode(cmd.mode);
          if (cmd.language) chooseLanguage(cmd.language);
          capture({ mode: cmd.mode, language: cmd.language });
          return;
        case "question":
          if (latest.current.lastImage || latest.current.features?.ask) ask(cmd.text);
          else {
            const msg = `I heard "${heard}", but that's not a command. ${HELP}`;
            setStatus(msg);
            say(msg);
          }
      }
    },
    [ask, capture, chooseLanguage, replay, runAsk, runLookup, say, stopSpeech],
  );

  const listen = useCallback(
    (kind: "command" | "question") => {
      unlockAll();
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
      const handlers = {
        onResult: (text: string) => {
          setStatus(`Heard: ${text}`);
          if (kind === "command") handleCommand(text);
          else ask(text);
        },
        onError: (reason: string) => {
          const msg =
            reason === "not-allowed" || reason === "service-not-allowed"
              ? "Microphone access is blocked. You can type your question instead."
              : reason === "network"
                ? "I couldn't make out what you said just now. Please try again."
                : "I didn't hear anything. Tap the button and try again.";
          setStatus(msg);
          say(msg);
        },
        onEnd: () => {
          listenerRef.current = null;
          setListening(null);
          setRecording(false);
        },
      };
      if (recognitionSupported()) {
        listenerRef.current = listenOnce(handlers);
      } else if (latest.current.features?.transcribe && recorderSupported()) {
        // No SpeechRecognition (e.g. iOS home-screen app): record and transcribe with ElevenLabs.
        setRecording(true);
        listenerRef.current = recordOnce({
          ...handlers,
          onTranscribing: () => setStatus("Got it. Working out what you said…"),
        });
      } else {
        listenerRef.current = null;
      }
      if (!listenerRef.current) setListening(null);
    },
    [ask, handleCommand, say, stopSpeech, unlockAll],
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
    unlockAll();
    setStarted(true);
    speak(INTRO);
    void startCamera();
  };

  // ---------- Onboarding ----------
  if (!started) {
    return (
      <main className="min-h-dvh bg-white text-black">
        <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-6 py-10">
          <div className="flex flex-col gap-4">
            <svg width={56} height={56} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <rect x="1" y="1" width="30" height="30" rx="8" fill="#000" />
              <ellipse cx="16" cy="16" rx="11" ry="6.8" fill="none" stroke="#fff" strokeWidth="2.6" />
              <circle cx="16" cy="16" r="3.6" fill="#fff" />
            </svg>
            <h1 className="text-[34px] font-bold leading-tight tracking-tight">SightLine</h1>
            <p className="text-[22px] font-semibold leading-snug">Point your camera. Hear the world.</p>
            <p className="text-[17px] leading-relaxed">
              SightLine reads text, describes what&apos;s around you, explains menus and labels, and translates signs, out loud.
            </p>
            <p className="text-[15px] leading-relaxed text-[#55555A]">
              When you tap Start, your browser will ask to use the camera. Each photo is sent to an AI model to be described, and
              product or restaurant names may be searched on the web. SightLine never saves your photos. It keeps the text of
              recent answers so you can look back at them.
            </p>
          </div>
          <button type="button" onClick={begin} className={`${pillBlack} min-h-14 text-[19px]`}>
            {I.camera}
            Start SightLine
          </button>
        </div>
      </main>
    );
  }

  // ---------- Main screen: camera first, like the iPhone app ----------
  const cameraStatus = camera === "on" ? "Camera on" : camera === "starting" ? "Starting camera…" : "Camera off";
  const showSheet = Boolean(result) && result !== dismissed;
  const frost = "bg-black/45 text-white backdrop-blur-md";
  const listeningText = recording ? "Listening… tap the mic when done" : "Listening…";
  // Whatever the camera's own zoom can't reach is made up by scaling the preview.
  const cssZoom = hwZoom ? (hwZoom.min * zoom) / Math.min(hwZoom.max, hwZoom.min * zoom) : zoom;
  const touchDist = (t: React.TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  return (
    <div className="relative h-dvh overflow-hidden bg-black text-white">
      {/* Live preview. Hidden from screen readers: it has no information they can use. */}
      <video
        ref={videoRef}
        className="pointer-events-none fixed inset-0 h-full w-full object-cover"
        style={cssZoom > 1.001 ? { transform: `scale(${cssZoom})`, transformOrigin: vfCenter } : undefined}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
      />
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 to-transparent" />
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black/75 to-transparent" />

      <main className="relative mx-auto flex h-dvh max-w-2xl flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <h1 className="sr-only">SightLine, {cameraStatus}</h1>
          <button
            type="button"
            onClick={toggleAutoSpeak}
            aria-pressed={autoSpeak}
            className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-bold uppercase tracking-[0.08em] ${focusLight} ${
              autoSpeak ? "bg-white text-black" : frost
            }`}
          >
            {autoSpeak ? I.speaker : I.speakerOff}
            Speak {autoSpeak ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            aria-label="Upload a photo"
            className={`inline-flex h-11 w-11 items-center justify-center rounded-full ${frost} ${focusLight} disabled:opacity-50`}
          >
            {I.photo}
          </button>
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
        </header>

        {/* Viewfinder: the camera corners mark exactly what goes into the photo. Two fingers pinch-zoom. */}
        <div
          ref={frameRef}
          aria-hidden="true"
          className="relative mx-6 my-4 min-h-0 flex-1 touch-none"
          onTouchStart={(e) => {
            if (e.touches.length === 2 && camera === "on") pinchRef.current = { d: touchDist(e.touches), z: zoomRef.current };
          }}
          onTouchMove={(e) => {
            if (pinchRef.current && e.touches.length === 2) setZoom((pinchRef.current.z * touchDist(e.touches)) / pinchRef.current.d);
          }}
          onTouchEnd={(e) => {
            if (e.touches.length < 2) pinchRef.current = null;
          }}
        >
          <span className="absolute left-0 top-0 h-9 w-9 rounded-tl-xl border-l-[3px] border-t-[3px] border-white" />
          <span className="absolute right-0 top-0 h-9 w-9 rounded-tr-xl border-r-[3px] border-t-[3px] border-white" />
          <span className="absolute bottom-0 left-0 h-9 w-9 rounded-bl-xl border-b-[3px] border-l-[3px] border-white" />
          <span className="absolute bottom-0 right-0 h-9 w-9 rounded-br-xl border-b-[3px] border-r-[3px] border-white" />
          {camera !== "on" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[17px] font-semibold">{cameraStatus}</p>
              {camera === "unavailable" && <p className="text-[15px] text-white/85">Upload a photo with the button at the top right.</p>}
            </div>
          )}
        </div>

        {/* Status, as a frosted pill over the camera */}
        <div aria-live="polite" aria-atomic="true" className="flex min-h-11 shrink-0 justify-center px-4">
          {busy ? (
            <p className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-semibold ${frost}`}>
              <span aria-hidden="true" className="inline-block h-4 w-4 rounded-full border-2 border-white border-t-transparent motion-safe:animate-spin" />
              {status || "Looking…"}
            </p>
          ) : listening ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-[#D70015] px-4 py-2 text-[15px] font-semibold text-white">{listeningText}</p>
          ) : status && !showSheet ? (
            <p className={`max-w-full rounded-2xl px-4 py-2 text-center text-[15px] font-semibold ${frost}`}>{status}</p>
          ) : null}
        </div>

        {mode === "translate" && (
          <div className="mt-2 flex shrink-0 justify-center">
            <label className={`inline-flex min-h-11 items-center gap-1 rounded-full pl-4 pr-2 text-[15px] font-semibold ${frost}`}>
              <span aria-hidden="true">→</span>
              <span className="sr-only">Translate to</span>
              <select
                id="language"
                value={language}
                onChange={(e) => chooseLanguage(e.target.value)}
                className={`min-h-11 cursor-pointer rounded-full bg-transparent pr-2 font-semibold text-white [&>option]:text-black ${focusLight}`}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Zoom chips, like the iPhone app */}
        {camera === "on" && (
          <div role="group" aria-label="Zoom" className="mt-2 flex shrink-0 justify-center">
            <div className={`flex gap-1 rounded-full p-1 ${frost}`}>
              {zoomChips(zoom).map(({ c, on, text }) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={on}
                  aria-label={on && text !== `${c}×` ? `${text.slice(0, -1)} times zoom` : `${c} times zoom`}
                  onClick={() => setZoom(c)}
                  className={`h-11 min-w-11 rounded-full px-2 text-[15px] font-bold tabular-nums ${focusLight} ${on ? "bg-white text-black" : "text-white"}`}
                >
                  {text}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Mode strip, like the iOS Camera app */}
        <nav aria-label="Mode" className="mt-2 shrink-0">
          <div className="overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
           <div className="mx-auto flex w-max gap-0.5">
            {REQUEST_MODES.map((m) => {
              const on = mode === m;
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  aria-describedby={`hint-${m}`}
                  onClick={() => chooseMode(m)}
                  className={`flex min-h-11 shrink-0 flex-col items-center justify-center gap-1 rounded-lg px-2 text-[13px] font-bold uppercase tracking-[0.05em] ${focusLight} ${
                    on ? "text-[#FFD60A]" : "text-white"
                  }`}
                >
                  {m === "menu" ? "Menu" : modeLabel(m)}
                  <span aria-hidden="true" className={`h-[3px] w-5 rounded-full ${on ? "bg-[#FFD60A]" : "bg-transparent"}`} />
                  <span id={`hint-${m}`} className="sr-only">
                    {modeLabel(m)}. {modeHint(m)}
                  </span>
                </button>
              );
            })}
           </div>
          </div>
        </nav>

        {/* Shutter row: last photo, shutter, voice */}
        <div className="grid shrink-0 grid-cols-3 items-center px-6 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <div className="justify-self-start">
            {lastImage && result ? (
              <button
                type="button"
                onClick={() => setDismissed(null)}
                aria-label="Show the last answer"
                className={`block h-12 w-12 overflow-hidden rounded-lg border-2 border-white ${focusLight}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
                <img src={`data:image/jpeg;base64,${lastImage}`} alt="" className="h-full w-full object-cover" />
              </button>
            ) : (
              <span className="block h-12 w-12" aria-hidden="true" />
            )}
          </div>
          <button
            type="button"
            onClick={() => capture()}
            aria-busy={busy}
            aria-label={busy ? "Looking" : `Capture, ${modeLabel(mode)} mode`}
            className={`flex h-[78px] w-[78px] items-center justify-center justify-self-center rounded-full border-4 border-white ${focusLight}`}
          >
            <span className="flex h-[62px] w-[62px] items-center justify-center rounded-full bg-white transition-transform active:scale-90 motion-reduce:transition-none">
              {busy && <span aria-hidden="true" className="inline-block h-6 w-6 rounded-full border-[3px] border-black border-t-transparent motion-safe:animate-spin" />}
            </span>
          </button>
          <div className="justify-self-end">
            {canListen ? (
              <button
                type="button"
                onClick={() => listen("command")}
                aria-pressed={listening === "command"}
                aria-label={listening === "command" ? listeningText : "Voice command"}
                className={`inline-flex h-12 w-12 items-center justify-center rounded-full ${focusLight} ${listening === "command" ? "bg-[#D70015] text-white" : frost}`}
                disabled={busy || listening === "question"}
              >
                {I.mic}
              </button>
            ) : (
              <span className="block h-12 w-12" aria-hidden="true" />
            )}
          </div>
        </div>
      </main>

      {/* The answer sheet */}
      {showSheet && result && (
        <section
          aria-labelledby="result-heading"
          className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-h-[88dvh] max-w-2xl flex-col rounded-t-[28px] bg-white text-black shadow-[0_-10px_40px_rgba(0,0,0,0.35)]"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-4">
            <h2 id="result-heading" className={caption}>
              {result.question ? "Answer" : mode === "translate" && result.mode === "translate" ? `Translate to ${language}` : MODE_LABELS[result.mode]}
            </h2>
            <button type="button" onClick={() => setDismissed(result)} className={`min-h-11 rounded-xl border-2 border-black px-4 text-[17px] font-semibold ${focus}`}>
              Done
            </button>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {lastImage && (
              <button
                type="button"
                onClick={() => setMagnify(true)}
                aria-label="Your photo. Magnify."
                aria-haspopup="dialog"
                className={`relative block w-full shrink-0 rounded-2xl ${focus}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
                <img src={`data:image/jpeg;base64,${lastImage}`} alt="" className="max-h-56 w-full rounded-2xl object-cover" />
                <span aria-hidden="true" className="absolute bottom-3 right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white">
                  {I.magnify}
                </span>
              </button>
            )}
            {result.question && !busy && (
              <p className="text-[15px] text-[#55555A]">
                You asked: <span className="font-semibold text-black">“{result.question}”</span>
              </p>
            )}

            <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
              {busy ? (
                <p className="flex items-center gap-3 text-[20px] font-semibold">
                  <span aria-hidden="true" className="inline-block h-5 w-5 rounded-full border-[3px] border-black border-t-transparent motion-safe:animate-spin" />
                  {status || "Thinking…"}
                </p>
              ) : (
                <p className={`text-[20px] leading-snug ${result.error ? "border-l-4 border-[#D70015] pl-3 font-semibold" : ""}`} lang={result.langCode}>
                  {result.error && <span className="text-[#D70015]">Error: </span>}
                  {result.spokenText}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Playback">
              <button
                type="button"
                onClick={() => {
                  unlockAll();
                  replay();
                }}
                className={`${pillBlack} flex-1`}
                disabled={busy}
              >
                {I.replay}
                Replay
              </button>
              <button type="button" onClick={stopSpeech} className={`${pillGrey} flex-1`}>
                {I.stop}
                Stop
              </button>
            </div>

            <div role="group" aria-labelledby="speed-label" className="flex flex-col gap-1.5">
              <span id="speed-label" className={caption}>
                Speed
              </span>
              <div className="grid grid-cols-4 gap-1 rounded-[14px] bg-[#F2F2F7] p-1">
                {SPEEDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={rate === s}
                    aria-label={`${s} times speed`}
                    onClick={() => chooseRate(s)}
                    className={`min-h-11 rounded-[10px] text-[15px] font-semibold ${focus} ${rate === s ? "bg-black text-white" : "text-black hover:bg-[#E5E5EA]"}`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </div>

            {result.details && !busy && <Sections sections={result.sections} fallback={result.details} />}

            {features?.lookup && !result.error && (
              <button
                type="button"
                onClick={() => {
                  unlockAll();
                  void runLookup({ auto: false });
                }}
                className={pillGrey}
                disabled={busy || web?.status === "loading"}
                aria-busy={web?.status === "loading"}
              >
                {I.globe}
                {web?.status === "loading" ? "Checking the web…" : "Look it up on the web"}
              </button>
            )}

            {/* Web lookup results get their own live region so the first answer isn't re-read. */}
            <div aria-live="polite" aria-atomic="true" className="flex flex-col gap-2">
              {!busy && web?.status === "loading" && (
                <p className="flex items-center gap-3 rounded-[14px] bg-[#F2F2F7] p-4 text-[17px] font-semibold">
                  <span aria-hidden="true" className="inline-block h-5 w-5 shrink-0 rounded-full border-[3px] border-black border-t-transparent motion-safe:animate-spin" />
                  {web.query ? `Checking the web for ${web.query}…` : "Checking the web…"}
                </p>
              )}
              {!busy && web?.status === "done" && (
                <div className="rounded-[14px] bg-[#F2F2F7] p-4">
                  <p className={caption}>From the web</p>
                  <p className="mt-1 text-[17px] leading-relaxed" lang={webLang}>
                    {web.data.error && <span className="font-semibold text-[#D70015]">Error: </span>}
                    {web.data.spokenText}
                  </p>
                </div>
              )}
            </div>

            {!busy && web?.status === "done" && (web.data.details || web.data.sources.length > 0) && (
              <div className="flex flex-col">
                {web.data.query && <p className="text-[15px] text-[#55555A]">Searched for: {web.data.query}</p>}
                <Sections sections={web.data.sections} fallback={web.data.details} />
                {web.data.sources.length > 0 && (
                  <>
                    <h3 className={`${caption} mt-3`}>Sources</h3>
                    <ul className="mt-1 flex flex-col">
                      {web.data.sources.map((src) => (
                        <li key={src.url} className="border-t border-[#E5E5EA]">
                          <a href={src.url} target="_blank" rel="noopener noreferrer" className={`flex min-h-12 items-center break-words py-2 text-[17px] underline underline-offset-4 ${focus}`}>
                            {src.title}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-col gap-1.5 border-t border-[#E5E5EA] pt-3">
              <span className={caption}>Ask about this</span>
              <form
                className="flex items-center gap-2 rounded-[14px] bg-[#F2F2F7] py-1 pl-4 pr-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(question);
                }}
              >
                <label htmlFor="question" className="sr-only">
                  Ask about this photo
                </label>
                <input
                  id="question"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="How much is it?"
                  autoComplete="off"
                  className={`min-h-11 min-w-0 flex-1 bg-transparent text-[17px] text-black placeholder:text-[#55555A] ${focus}`}
                />
                {canListen && (
                  <button
                    type="button"
                    onClick={() => listen("question")}
                    aria-pressed={listening === "question"}
                    aria-label={listening === "question" ? listeningText : "Ask with your voice"}
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${focus} ${
                      listening === "question" ? "bg-[#D70015] text-white" : "text-black hover:bg-[#E5E5EA]"
                    }`}
                    disabled={busy || listening === "command"}
                  >
                    {I.mic}
                  </button>
                )}
                <button
                  type="submit"
                  aria-label="Ask"
                  className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white ${focus} disabled:opacity-40`}
                  disabled={busy || !question.trim()}
                >
                  {I.send}
                </button>
              </form>
              {listening === "question" && <p className="text-[15px] font-semibold text-[#D70015]">{listeningText}</p>}
            </div>
          </div>
        </section>
      )}

      {lastImage && <Magnifier src={`data:image/jpeg;base64,${lastImage}`} open={magnify} onClose={() => setMagnify(false)} />}
    </div>
  );
}
