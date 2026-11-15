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
  type BarcodeResponse,
  type Features,
  type FrameCheckResponse,
  type HistoryScan,
  type LookupResponse,
  type Mode,
  type RequestMode,
  type Section,
  type Voice,
} from "@/lib/modes";
import { captureVideoFrame, drawVideoCrop, fileToBase64 } from "@/lib/image";
import { getDetector, holdCode, initialScanState, normalizeBarcode, onAnswerClosed, onSighting } from "@/lib/barcodeScan";
import { beepDone, beepError, beepStart, unlockAudio, vibrate } from "@/lib/feedback";
import { useSpeech, type SpeakOptions } from "@/lib/useSpeech";
import { listenOnce, parseCommand, recognitionSupported, type Listener } from "@/lib/voice";
import { recordOnce, recorderSupported } from "@/lib/recorder";
import { dismissCard, initialAutoState, lastSeen, reduceFrame, resumeAfterSheet, type Detection } from "@/lib/detect";
import { Magnifier } from "./Magnifier";
import { RecentSheet, SettingsSheet } from "./AppSheets";
import { StartScreen } from "./StartScreen";
import { MenuView } from "./MenuView";
import { parseMenu } from "@/lib/menuView";
import { answerLang } from "@/lib/speechLang";

const INTRO =
  "Welcome to SightLine. Point your camera at something and tap Capture at the bottom of the screen, and I'll tell you what's there.";
const HELP =
  "You can say: read this, describe, what's on the menu, translate to Spanish, look it up, what did I scan earlier, repeat, or stop. Or ask a question about the last photo.";
const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
const MIN_GAP_MS = 1500; // ignore accidental double captures
const REQUEST_TIMEOUT_MS = 45_000;
const LOOKUP_TIMEOUT_MS = 20_000; // the server stops itself at about 15 seconds
const ASK_TIMEOUT_MS = 25_000;
const BARCODE_TIMEOUT_MS = 20_000;
const SCAN_EVERY_MS = 250; // pause between barcode scans of the viewfinder
// Detect, as in the iPhone app (mobile/src/useAutoCapture.ts): small silent frames go to
// /api/frame-check back to back, and anything readable is offered as a card. Never read by itself.
const DETECT_SETTLE_MS = 800; // after the camera starts or a sheet closes
const DETECT_GAP_MS = 700; // pause after one check before the next (each takes about 1 to 2 s)
const DETECT_ERROR_BACKOFF_MS = 3000;
const DETECT_HIDE_MS = 2000; // the card fades this long after its item leaves the frame
const HINT_SHOW_MS = 4000;
const BARCODE_GONE_MS = 1500; // the barcode card hides once its code has been out of view this long
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
// barcodeCode: set for barcode answers. photoUrl: a reopened scan's web image (no photo of our own).
type Result = AnalyzeResponse & { mode: Mode; langCode: string; question?: string; barcodeCode?: string; photoUrl?: string };
type BarcodeCard = { code: string; data: BarcodeResponse; image: string | null };
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
  barcode: <Svg size={24}><path d="M3 7V4.5A1.5 1.5 0 0 1 4.5 3H7M17 3h2.5A1.5 1.5 0 0 1 21 4.5V7M21 17v2.5a1.5 1.5 0 0 1-1.5 1.5H17M7 21H4.5A1.5 1.5 0 0 1 3 19.5V17M7 8v8M10 8v8M13 8v8M16.5 8v8" /></Svg>,
  viewfinder: <Svg size={20}><path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16" /></Svg>,
  clock: <Svg size={24}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 3.5v5h5M12 7.5V12l3 2" /></Svg>,
  gear: (
    <Svg size={24}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  ),
  library: <Svg size={28}><rect x="6.5" y="3" width="14.5" height="14.5" rx="2" /><path d="M3 7v12.5A1.5 1.5 0 0 0 4.5 21H17M21 13.5l-4.5-4.5-7 7" /></Svg>,
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

/** Yellow brackets around what Detect found; `box` is 0 to 1 of the viewfinder. */
function DetectBrackets({ box }: { box: { x: number; y: number; w: number; h: number } }) {
  const c = "absolute h-6 w-6 border-[#FFD60A] drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]";
  return (
    <div
      className="pointer-events-none absolute transition-all duration-200 motion-reduce:transition-none"
      style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` }}
    >
      <span className={`${c} left-0 top-0 rounded-tl-lg border-l-[3px] border-t-[3px]`} />
      <span className={`${c} right-0 top-0 rounded-tr-lg border-r-[3px] border-t-[3px]`} />
      <span className={`${c} bottom-0 left-0 rounded-bl-lg border-b-[3px] border-l-[3px]`} />
      <span className={`${c} bottom-0 right-0 rounded-br-lg border-b-[3px] border-r-[3px]`} />
    </div>
  );
}

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
  const [barcodeBox, setBarcodeBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [barcodeCard, setBarcodeCardState] = useState<BarcodeCard | null>(null);
  const [barcodeNote, setBarcodeNote] = useState(""); // screen reader announcement for the cards
  const [sheet, setSheet] = useState<"none" | "settings" | "recent">("none");
  const [detectOn, setDetectOn] = useState(true); // Detect, on by default as in the iPhone app
  const [detection, setDetection] = useState<Detection | null>(null);
  const [detectBox, setDetectBox] = useState<{ box: { x: number; y: number; w: number; h: number }; at: number } | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [natural, setNatural] = useState(true); // Natural voice (ElevenLabs); off = the browser's voice
  const [voiceId, setVoiceId] = useState(""); // "" = the server's default voice (Matilda)
  const [voices, setVoices] = useState<Voice[] | null>(null);

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
  const scanRef = useRef(initialScanState);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scanFailedRef = useRef(false);
  const cardRef = useRef<BarcodeCard | null>(null);
  const lastSeenRef = useRef<{ code: string; at: number } | null>(null);
  const fetchingRef = useRef<string | null>(null);
  const autoRef = useRef(initialAutoState);
  const detectionRef = useRef<Detection | null>(null);
  const detectHideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const speech = useSpeech();
  const { speak, stop: stopSpeech, setRate, unlock: unlockSpeech, setElevenAvailable, setNatural: setSpeechNatural, setVoice: setSpeechVoice, playUrl } = speech;

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
    setDetectOn(readPref("sl.detect", true));
    const n = readPref("sl.natural", true);
    setNatural(n);
    setSpeechNatural(n);
    const v = readPref("sl.voice", "");
    setVoiceId(v);
    setSpeechVoice(v);
    setCanListen(recognitionSupported());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [setRate, setSpeechNatural, setSpeechVoice]);

  // The voice picker's list (Settings > Voice), when the server has ElevenLabs.
  useEffect(() => {
    if (!features?.elevenlabs) return;
    let alive = true;
    fetch("/api/voices")
      .then((r) => (r.ok ? (r.json() as Promise<{ voices?: Voice[] }>) : null))
      .then((d) => {
        if (alive && Array.isArray(d?.voices) && d.voices.length) setVoices(d.voices);
      })
      .catch(() => {
        // No picker; the default voice still works.
      });
    return () => {
      alive = false;
    };
  }, [features?.elevenlabs]);

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
            brand: r.brand, // pictures and facts must be this brand's; absent = unconfirmed
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
      setStatus("This browser can't use the camera. Tap the photo button at the bottom left to choose a photo instead.");
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
      const msg = "Camera is not available. You can choose a photo instead.";
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
    async (image: string, opts: { mode: RequestMode; language: string; question?: string; key?: string }) => {
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

      // In Auto the server reports the mode it chose. The voice speaks the answer's own language
      // (Translate: the chosen one; a Spanish sign read verbatim: Spanish), as in the iPhone app.
      const answerMode: Mode = data.mode ?? (opts.mode === "auto" ? "describe" : opts.mode);
      const speakLang = data.error ? "en-US" : opts.mode === "translate" ? langCode : answerLang(answerMode, opts.language, data.spokenLanguage);
      const fresh: Result = { ...data, mode: answerMode, langCode: speakLang, question: opts.question };
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
    (override?: { mode?: RequestMode; language?: string; key?: string }) => {
      unlockAll();
      if (busyRef.current) return;
      const m = override?.mode ?? latest.current.mode;
      const lang = override?.language ?? latest.current.language;
      const video = videoRef.current;
      if (latest.current.camera !== "on" || !video) {
        const msg = "The camera is off. Tap the photo button at the bottom left to choose a photo instead.";
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
      void analyze(image, { mode: m, language: lang, ...(override?.key ? { key: override.key } : {}) });
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

  // ---------- Barcodes: spotted automatically, like the iPhone Camera's code pill ----------
  // In every mode, the viewfinder is scanned for a product barcode a few times a second. A barcode
  // seen twice is looked up quietly and offered as a card ("Diet Coke · Tap to hear"); nothing is
  // read until the user taps it. The card hides when the barcode leaves the frame.
  const setBarcodeCard = useCallback((c: BarcodeCard | null) => {
    cardRef.current = c;
    setBarcodeCardState(c);
  }, []);

  const fetchBarcode = useCallback(async (code: string): Promise<{ data: BarcodeResponse; ok: boolean }> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), BARCODE_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/barcode?code=${encodeURIComponent(code)}`, { headers: deviceHeader(), signal: controller.signal });
      return { data: (await res.json()) as BarcodeResponse, ok: res.ok };
    } catch {
      return { data: { code, found: false, spokenText: "", sections: [], itemKind: "none" }, ok: false };
    } finally {
      clearTimeout(timer);
    }
  }, []);

  /** A barcode was confirmed: look it up and, if the product is known and still in view, show its card. */
  const offerBarcode = useCallback(
    async (code: string, image: string | null) => {
      if (fetchingRef.current === code) return;
      fetchingRef.current = code;
      const { data, ok } = await fetchBarcode(code);
      fetchingRef.current = null;
      const seen = lastSeenRef.current;
      if (!ok || !data.found || !seen || seen.code !== code || Date.now() - seen.at > BARCODE_GONE_MS) return;
      setBarcodeCard({ code, data, image });
      const name = data.title || "Product";
      vibrate(30);
      // Shown and announced to screen readers, never spoken: nothing talks unless asked.
      setBarcodeNote(`${name} barcode. Tap the card above the shutter to hear it.`);
    },
    [fetchBarcode, setBarcodeCard],
  );

  /** Tap on the card: open the barcode answer and read it. */
  const openBarcode = useCallback(() => {
    unlockAll();
    const c = cardRef.current;
    if (!c || busyRef.current) return;
    setBarcodeCard(null);
    setBarcodeNote("");
    stopSpeech();
    lookupIdRef.current++;
    setWeb(null);
    if (c.image) setLastImage(c.image);
    setDismissed(latest.current.result);
    const sections = c.data.sections ?? [];
    setResult({
      spokenText: c.data.spokenText,
      sections,
      details: sections.map((x) => `${x.title}\n${x.body}`).join("\n\n"),
      itemKind: c.data.itemKind,
      scanId: c.data.scanId,
      mode: "menu",
      langCode: "en-US",
      brand: c.data.brand,
      barcodeCode: c.code,
    });
    setStatus("");
    beepDone();
    vibrate([40, 40, 40]);
    say(c.data.spokenText);
  }, [say, setBarcodeCard, stopSpeech, unlockAll]);

  /** × on the card: hide it, and don't offer this barcode again for a while. */
  const dismissBarcode = useCallback(() => {
    const c = cardRef.current;
    if (!c) return;
    scanRef.current = holdCode(scanRef.current, c.code, Date.now());
    setBarcodeCard(null);
    setBarcodeNote("");
  }, [setBarcodeCard]);

  const sheetOpen = Boolean(result) && result !== dismissed;
  const scanning = started && camera === "on" && features?.barcode === true && !sheetOpen && !magnify;
  useEffect(() => {
    if (!scanning) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      const video = videoRef.current;
      const frame = frameRef.current;
      try {
        const detector = await getDetector();
        if (stopped) return;
        if (video && frame && !busyRef.current) {
          const canvas = (scanCanvasRef.current ??= document.createElement("canvas"));
          const rect = frame.getBoundingClientRect();
          const k = drawVideoCrop(video, rect, canvas, 800);
          if (k) {
            const found = await detector.detect(canvas);
            if (stopped) return;
            const now = Date.now();
            const hit = found.map((d) => ({ d, code: normalizeBarcode(d.format, d.rawValue) })).find((x) => x.code);
            if (hit?.code) {
              const b = hit.d.boundingBox;
              setBarcodeBox({ x: b.x * k, y: b.y * k, w: b.width * k, h: b.height * k });
              lastSeenRef.current = { code: hit.code, at: now };
              if (cardRef.current?.code !== hit.code) {
                const r = onSighting(scanRef.current, hit.code, now);
                scanRef.current = r.state;
                if (r.confirmed) {
                  let image: string | null = null;
                  try {
                    image = captureVideoFrame(video, rect);
                  } catch {
                    // no photo for the answer sheet; the lookup still works
                  }
                  void offerBarcode(hit.code, image);
                }
              }
            } else setBarcodeBox(null);
            // Hide the card once its barcode has left the frame.
            const card = cardRef.current;
            const seen = lastSeenRef.current;
            if (card && (!seen || seen.code !== card.code || now - seen.at > BARCODE_GONE_MS)) {
              setBarcodeCard(null);
              setBarcodeNote("");
            }
          }
        }
      } catch {
        scanFailedRef.current = true; // no barcode reader in this browser: photos still work
        return;
      }
      if (!stopped) timer = setTimeout(loop, SCAN_EVERY_MS);
    };
    if (!scanFailedRef.current) void loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [scanning, offerBarcode, setBarcodeCard]);

  /** Close the answer sheet. After a barcode answer the product is usually still in view, so wait a
   *  moment before offering the same barcode again. */
  const closeSheet = useCallback((r: Result) => {
    setDismissed(r);
    if (r.barcodeCode) scanRef.current = onAnswerClosed(scanRef.current, Date.now());
  }, []);

  // ---------- Detect: a card for whatever readable thing is in view, as in the iPhone app ----------
  /** Show, keep or fade the card. `appeared`: a new item, so buzz and tell screen readers. */
  const showDetection = useCallback((d: Detection | null, now = false, appeared = false) => {
    if (!d) {
      if (now) {
        if (detectHideRef.current) clearTimeout(detectHideRef.current);
        detectHideRef.current = null;
        detectionRef.current = null;
        setDetection(null);
      } else if (detectionRef.current && !detectHideRef.current) {
        detectHideRef.current = setTimeout(() => {
          detectHideRef.current = null;
          detectionRef.current = null;
          setDetection(null);
        }, DETECT_HIDE_MS);
      }
      return;
    }
    if (detectHideRef.current) clearTimeout(detectHideRef.current);
    detectHideRef.current = null;
    detectionRef.current = d;
    setDetection(d);
    if (!appeared) return;
    vibrate(20);
    setHint(null);
    setBarcodeNote(`${d.label} detected. Tap the card above the shutter to read it.`);
    // Point the mode strip at the suggestion so a plain Capture uses it too.
    const m = latest.current.mode;
    if (d.mode && m !== "auto" && d.mode !== m) setMode(d.mode);
  }, []);

  const detecting =
    started && detectOn && camera === "on" && !sheetOpen && sheet === "none" && !magnify && !busy && !barcodeCard && !listening;
  useEffect(() => {
    if (!detecting) return;
    autoRef.current = resumeAfterSheet(autoRef.current); // anything in view is offered again
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const loop = async () => {
      if (stopped) return;
      let wait = DETECT_GAP_MS;
      const video = videoRef.current;
      const frame = frameRef.current;
      if (video && frame && document.visibilityState === "visible" && !busyRef.current) {
        let image: string | null = null;
        try {
          image = captureVideoFrame(video, frame.getBoundingClientRect(), 512); // small and silent
        } catch {
          // camera not ready yet: try again shortly
        }
        if (image) {
          const m = latest.current.mode;
          try {
            const res = await fetch("/api/frame-check", {
              method: "POST",
              headers: { "Content-Type": "application/json", ...deviceHeader() },
              body: JSON.stringify({
                image,
                mode: m === "auto" ? "read" : m,
                ...(m === "translate" ? { language: latest.current.language } : {}),
                ...lastSeen(autoRef.current), // keeps the same key for the same item
              }),
              signal: AbortSignal.timeout(6000),
            });
            if (stopped) return;
            if (res.status === 404 || res.status === 405) {
              setDetectOn(false); // an older server without frame-check: switch off quietly
              return;
            }
            if (!res.ok) wait = DETECT_ERROR_BACKOFF_MS;
            else {
              const fc = (await res.json()) as Partial<FrameCheckResponse>;
              if (stopped) return;
              const at = Date.now();
              const out = reduceFrame(autoRef.current, fc, at);
              autoRef.current = out.state;
              showDetection(out.card, false, out.appeared);
              setDetectBox(out.card && fc.box ? { box: fc.box, at } : null);
              // Framing tips are shown, never spoken (nothing talks unless asked).
              if (out.speakHint) {
                setHint(out.speakHint);
                if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
                hintTimerRef.current = setTimeout(() => setHint(null), HINT_SHOW_MS);
              } else if (fc.detected) setHint(null);
            }
          } catch {
            if (stopped) return;
            wait = DETECT_ERROR_BACKOFF_MS;
          }
        }
      }
      if (!stopped) timer = setTimeout(loop, wait);
    };
    timer = setTimeout(loop, DETECT_SETTLE_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
      showDetection(null, true);
      setDetectBox(null);
      setHint(null);
    };
  }, [detecting, showDetection]);

  /** Tap on the card: read that item. */
  const readDetection = useCallback(() => {
    const d = detectionRef.current;
    if (!d) return;
    showDetection(null, true);
    const m = latest.current.mode;
    capture({ mode: m === "auto" ? "auto" : (d.mode ?? m), key: d.key });
  }, [capture, showDetection]);

  /** × on the card: hide this item for a few seconds. */
  const dismissDetection = useCallback(() => {
    const d = detectionRef.current;
    if (!d) return;
    autoRef.current = dismissCard(autoRef.current, d.key, Date.now());
    showDetection(null, true);
  }, [showDetection]);

  // ---------- Settings (the gear at the top right, as in the iPhone app) ----------
  const changeDetect = (v: boolean) => {
    setDetectOn(v);
    writePref("sl.detect", v);
  };

  const changeAutoSpeak = (v: boolean) => {
    setAutoSpeak(v);
    writePref("sl.autoSpeak", v);
    if (!v) stopSpeech();
  };

  const changeNatural = (v: boolean) => {
    setNatural(v);
    setSpeechNatural(v);
    writePref("sl.natural", v);
  };

  const changeRate = (r: number) => {
    setRateState(r);
    setRate(r);
    writePref("sl.rate", r);
  };

  /** Choose a voice and play its sample (ElevenLabs' own preview clip, so it costs no credits). */
  const changeVoice = (v: Voice | null) => {
    unlockAll();
    const id = v?.id ?? "";
    setVoiceId(id);
    setSpeechVoice(id);
    writePref("sl.voice", id);
    const sample = v?.previewUrl ?? voices?.[0]?.previewUrl; // the server lists its default voice first
    if (sample) playUrl(sample);
    else speak("This is how I'll read your answers.");
  };

  const clearHistory = async () => {
    try {
      const res = await fetch("/api/history", { method: "DELETE", headers: deviceHeader() });
      return res.ok;
    } catch {
      return false;
    }
  };

  const choosePhoto = () => {
    unlockAll();
    setSheet("none");
    fileRef.current?.click();
  };

  /** A scan from Recent: show it as the answer, without reading it again. */
  const openScan = useCallback(
    (scan: HistoryScan) => {
      stopSpeech();
      lookupIdRef.current++;
      setSheet("none");
      setLastImage(null);
      setDismissed(latest.current.result);
      const sections = scan.sections ?? [];
      setResult({
        spokenText: scan.spokenText,
        sections,
        details: sections.map((x) => `${x.title}\n${x.body}`).join("\n\n"),
        itemKind: (scan.itemKind ?? undefined) as Result["itemKind"],
        scanId: scan.id,
        mode: scan.mode,
        langCode: "en-US",
        ...(scan.imageUrl ? { photoUrl: scan.imageUrl } : {}),
      });
      if (scan.lookup) {
        setWeb({ status: "done", data: scan.lookup });
        setWebLang("en-US");
      } else setWeb(null);
      setStatus("");
    },
    [stopSpeech],
  );

  const chooseRate = (r: number) => {
    setRateState(r);
    setRate(r);
    writePref("sl.rate", r);
    if (latest.current.result) replay();
  };

  /** Start, with the voice choice from the start screen (the same switch as Settings > Auto-speak). */
  const begin = () => {
    unlockAll();
    writePref("sl.autoSpeak", autoSpeak);
    setStarted(true);
    if (autoSpeak) speak(INTRO);
    void startCamera();
  };

  // ---------- Onboarding: one choice, voice or no voice ----------
  if (!started) {
    return <StartScreen voice={autoSpeak} onVoice={setAutoSpeak} onStart={begin} />;
  }

  // ---------- Main screen: camera first, like the iPhone app ----------
  const cameraStatus = camera === "on" ? "Camera on" : camera === "starting" ? "Starting camera…" : "Camera off";
  const showSheet = sheetOpen && sheet === "none";
  const menu = result && !result.error ? parseMenu(result.menu) : undefined;
  const photoSrc = lastImage ? `data:image/jpeg;base64,${lastImage}` : (result?.photoUrl ?? null);
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
          {/* Top: Detect, Recent, Settings, as in the iPhone app */}
          <button
            type="button"
            onClick={() => changeDetect(!detectOn)}
            aria-pressed={detectOn}
            aria-label="Detect"
            aria-describedby="detect-hint"
            className={`inline-flex h-[52px] items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[13px] font-bold uppercase tracking-[0.08em] ${focusLight} ${
              detectOn ? "bg-white text-black" : frost
            }`}
          >
            {I.viewfinder}
            <span aria-hidden="true">{detectOn ? "Detect" : "Detect off"}</span>
          </button>
          <span id="detect-hint" className="sr-only">
            Offers a card when it sees something to read.
          </span>
          <div className="flex gap-2.5">
            {(features?.history || features?.ask) && (
              <button
                type="button"
                onClick={() => {
                  unlockAll();
                  setSheet("recent");
                }}
                aria-label="Recent scans"
                className={`inline-flex h-[52px] w-[52px] items-center justify-center rounded-full ${frost} ${focusLight}`}
              >
                {I.clock}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                unlockAll();
                setSheet("settings");
              }}
              aria-label="Settings"
              className={`inline-flex h-[52px] w-[52px] items-center justify-center rounded-full ${frost} ${focusLight}`}
            >
              {I.gear}
            </button>
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
          {scanning && barcodeBox && (
            // Yellow brackets lock onto the barcode, like the iPhone app's Live Text-style brackets.
            <div
              className="pointer-events-none absolute"
              style={{ left: barcodeBox.x - 6, top: barcodeBox.y - 6, width: barcodeBox.w + 12, height: barcodeBox.h + 12 }}
            >
              <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-lg border-l-[3px] border-t-[3px] border-[#FFD60A] drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
              <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-lg border-r-[3px] border-t-[3px] border-[#FFD60A] drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
              <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-lg border-b-[3px] border-l-[3px] border-[#FFD60A] drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
              <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-lg border-b-[3px] border-r-[3px] border-[#FFD60A] drop-shadow-[0_0_2px_rgba(0,0,0,0.6)]" />
            </div>
          )}
          {detecting && detection && detectBox && !barcodeBox && (
            // Brackets around what Detect found (the box is a fraction of the viewfinder photo).
            <DetectBrackets box={detectBox.box} />
          )}
          {camera !== "on" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="text-[17px] font-semibold">{cameraStatus}</p>
              {camera === "unavailable" && <p className="text-[15px] text-white/85">Choose a photo with the button at the bottom left.</p>}
            </div>
          )}
        </div>

        {/* Barcode card, like the iPhone Camera's code pill: tap to hear, × to hide */}
        {barcodeCard && scanning && !busy && (
          // Floats over the bottom of the viewfinder so the frame (and what's scanned) doesn't move.
          <div className="relative z-10 h-0 shrink-0">
           <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
            <div className="flex w-full max-w-sm items-center gap-1 rounded-[22px] bg-white/90 p-1 text-black shadow-lg backdrop-blur-md">
              <button
                type="button"
                onClick={openBarcode}
                className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[18px] px-3 text-left ${focus}`}
              >
                {I.barcode}
                <span className="min-w-0">
                  <span className="block truncate text-[17px] font-semibold leading-tight">{barcodeCard.data.title || "Product"}</span>
                  <span className="block text-[15px] leading-tight text-[#3A3A3C]">Tap to hear · Barcode</span>
                </span>
              </button>
              <button
                type="button"
                onClick={dismissBarcode}
                aria-label="Hide barcode card"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10 text-[20px] ${focus}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
           </div>
          </div>
        )}

        {/* Detect card: "Lunch menu · Tap to read · Menu", like the iPhone app */}
        {detecting && detection && (
          <div className="relative z-10 h-0 shrink-0">
            <div className="absolute inset-x-0 bottom-3 flex justify-center px-4">
              <div className="flex w-full max-w-sm items-center gap-1 rounded-[22px] bg-white/90 p-1 text-black shadow-lg backdrop-blur-md">
                <button
                  type="button"
                  onClick={readDetection}
                  aria-label={`${detection.label} detected. Read it${detection.mode ? ` in ${MODE_LABELS[detection.mode]} mode` : ""}.`}
                  className={`flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-[18px] px-3 text-left ${focus}`}
                >
                  {I.viewfinder}
                  <span className="min-w-0">
                    <span className="block truncate text-[17px] font-semibold leading-tight">{detection.label}</span>
                    <span className="block text-[15px] font-semibold leading-tight text-[#3A3A3C]">
                      Tap to read{detection.mode ? ` · ${detection.mode === "menu" ? "Menu" : MODE_LABELS[detection.mode]}` : ""}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={dismissDetection}
                  aria-label="Hide card"
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/10 text-[20px] ${focus}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </div>
          </div>
        )}

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
          ) : detecting && hint && !detection ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-[15px] font-semibold text-black backdrop-blur-md">
              {I.viewfinder}
              {hint}
            </p>
          ) : null}
        </div>
        <p aria-live="polite" className="sr-only">
          {barcodeNote}
        </p>


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
            {/* Last answer, or choose a photo when there isn't one yet (Settings has Choose a photo too). */}
            {result ? (
              <button
                type="button"
                onClick={() => setDismissed(null)}
                aria-label={`Last answer: ${result.spokenText}`}
                className={`flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border-2 border-white bg-black/45 ${focusLight}`}
              >
                {lastImage || result.photoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- in-memory data URL or a scan's web image
                  <img src={lastImage ? `data:image/jpeg;base64,${lastImage}` : result.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  I.photo
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={busy}
                aria-label="Choose a photo"
                className={`flex h-14 w-14 items-center justify-center rounded-xl ${focusLight} disabled:opacity-50`}
              >
                {I.library}
              </button>
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
              {result.question ? "Answer" : result.barcodeCode ? "Barcode" : mode === "translate" && result.mode === "translate" ? `Translate to ${language}` : MODE_LABELS[result.mode]}
            </h2>
            <button type="button" onClick={() => closeSheet(result)} className={`min-h-11 rounded-xl border-2 border-black px-4 text-[17px] font-semibold ${focus}`}>
              Done
            </button>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {photoSrc && (
              <button
                type="button"
                onClick={() => setMagnify(true)}
                aria-label="Your photo. Magnify."
                aria-haspopup="dialog"
                className={`relative block w-full shrink-0 rounded-2xl ${focus}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- in-memory data URL */}
                <img src={photoSrc} alt="" className={`${menu ? "max-h-32" : "max-h-56"} w-full rounded-2xl object-cover`} />
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
                <>
                  {menu?.name && <h3 className="text-[28px] font-bold leading-tight tracking-tight">{menu.name}</h3>}
                  <p className={`text-[20px] leading-snug ${result.error ? "border-l-4 border-[#D70015] pl-3 font-semibold" : ""}`} lang={result.langCode}>
                    {result.error && <span className="text-[#D70015]">Error: </span>}
                    {result.spokenText}
                  </p>
                </>
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

            {menu && !busy && (
              <MenuView
                menu={menu}
                lang={result.langCode}
                speak={speak}
                stop={stopSpeech}
                speaking={speech.speaking}
                onAskDish={(name) => {
                  setQuestion(`Is the ${name} `);
                  setTimeout(() => document.getElementById("question")?.focus(), 30);
                }}
              />
            )}
            {/* With a menu, only the sections that aren't its dishes (hours, a dietary key); otherwise all. */}
            {result.details && !busy && (
              <Sections
                sections={menu ? result.sections?.filter((x) => !menu.sections.some((m) => m.title === x.title)) : result.sections}
                fallback={menu ? undefined : result.details}
              />
            )}

            {features?.lookup && !result.error && !result.barcodeCode && (
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

      {photoSrc && <Magnifier src={photoSrc} open={magnify} onClose={() => setMagnify(false)} />}

      {sheet === "settings" && (
        <SettingsSheet
          features={features}
          detect={detectOn}
          onDetect={changeDetect}
          autoSpeak={autoSpeak}
          onAutoSpeak={changeAutoSpeak}
          natural={natural}
          onNatural={changeNatural}
          rate={rate}
          onRate={changeRate}
          voices={voices}
          voiceId={voiceId}
          onVoice={changeVoice}
          speaking={speech.speaking}
          onStopSample={stopSpeech}
          onChoosePhoto={choosePhoto}
          onClearHistory={clearHistory}
          onClose={() => setSheet("none")}
        />
      )}
      {sheet === "recent" && (
        <RecentSheet features={features} headers={deviceHeader} onOpen={openScan} onAnswer={(t) => say(t)} onClose={() => setSheet("none")} />
      )}
    </div>
  );
}
