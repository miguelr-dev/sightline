import { CameraView, useCameraPermissions } from "expo-camera";
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
} from "expo-audio";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, AppState, Linking, PanResponder, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  analyze,
  askHistory,
  clearHistory,
  frameCheck,
  frameCheckExists,
  getFeatures,
  getHistory,
  getVoices,
  lookup,
  parseDeviceAnswer,
  sendHatCommand,
  setBaseUrl,
  setDeviceId,
  transcribe,
} from "./src/api";
import { CamButton, Frost, LastThumb, ModeStrip, Shutter } from "./src/components/CameraChrome";
import { RecentSheet, type AskState } from "./src/components/RecentSheet";
import { ResultSheet } from "./src/components/ResultSheet";
import { LanguageSheet, SettingsSheet, type Connection } from "./src/components/SettingsSheet";
import { Icon, IconButton, PillButton } from "./src/components/ui";
import { demoState } from "./src/demo";
import {
  languageCode,
  MODE_HINTS,
  MODE_LABELS,
  MODES,
  UNKNOWN_FEATURES,
  type DeviceEvent,
  type Mode,
  type Scan,
  type Voice,
} from "./src/modes";
import { effectiveApiUrl, loadSettings, saveSettings, type Settings } from "./src/settings";
import { speech } from "./src/speech";
import { colors, radius, type } from "./src/theme";
import type { Photo, Shot } from "./src/types";
import { DetectionCard } from "./src/components/DetectionCard";
import { HatView } from "./src/components/HatView";
import { useAutoCapture, type AutoDebug, type Detection } from "./src/useAutoCapture";
import { useHatCamera } from "./src/useHatCamera";
import { averageLuma, isTooDark } from "./src/logic/brightness";
import {
  buildLookingRequest,
  fallbackFor,
  initialCaption,
  initialSilence,
  reduceCaption,
  trackSilence,
  type CaptionEvent,
  type CaptionState,
} from "./src/logic/askWhileLooking";
import {
  HISTORY_QUESTION,
  initialCommandState,
  reduceCommand,
  routeInput,
  type CommandAction,
  type CommandState,
} from "./src/logic/hatCommands";

// 1024 px at quality 0.6: in tests against the demo images this read exactly the same text as
// 0.7, and the upload is about 17% smaller. 896 px saved little more and risks small print.
const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.6;
const FRAME_SIDE = 512;
const MAX_RECORD_MS = 12_000;
const CAMERA_SETTLE_MS = 1200; // let auto-exposure settle after the camera (re)starts
const demo = demoState(); // web screenshots only; null on iOS

// One resize + one JPEG encode.
async function toJpeg(uri: string, width: number, height: number, maxSide = MAX_SIDE, compress = JPEG_QUALITY): Promise<Photo> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > maxSide) ctx.resize(width >= height ? { width: maxSide } : { height: maxSide });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  if (!out.base64) throw new Error("no image data");
  return { uri: out.uri, base64: out.base64, width: out.width, height: out.height };
}

// Auto-mode frame: 512 px JPEG for the server plus a 16 px PNG to measure brightness locally.
async function toFrame(uri: string, width: number, height: number): Promise<{ image: string } | { dark: true; luma: number }> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > FRAME_SIDE) ctx.resize(width >= height ? { width: FRAME_SIDE } : { height: FRAME_SIDE });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.5, base64: true });
  if (!out.base64) throw new Error("no image data");
  try {
    const tiny = await ImageManipulator.manipulate(img).resize({ width: 16 }).renderAsync();
    const png = await tiny.saveAsync({ format: SaveFormat.PNG, base64: true });
    const luma = png.base64 ? averageLuma(png.base64) : NaN;
    if (isTooDark(luma)) return { dark: true, luma };
  } catch {
    // Can't measure: send it anyway.
  }
  return { image: out.base64 };
}

// One camera operation at a time: auto frames and manual captures never overlap.
let cameraQueue: Promise<unknown> = Promise.resolve();
function withCamera<T>(fn: () => Promise<T>): Promise<T> {
  const run = cameraQueue.then(fn, fn);
  cameraQueue = run.catch(() => undefined);
  return run;
}

const haptic = {
  capture: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
  tick: () => void Haptics.selectionAsync().catch(() => {}),
};

type SheetName = "none" | "result" | "settings" | "language" | "recent";

const LOADING_DELAY_MS = 300; // a cached lookup that lands sooner never shows a spinner

function Main() {
  const insets = useSafeAreaInsets();
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [connection, setConnection] = useState<Connection>({ state: "checking", features: UNKNOWN_FEATURES });
  const [voices, setVoices] = useState<Voice[] | null>(demo?.voices ?? null);
  const [historyOn, setHistoryOn] = useState<boolean>(!!demo);
  const [scans, setScans] = useState<Scan[] | null>(demo?.scans ?? null);
  const [scansLoading, setScansLoading] = useState(false);
  const [askState, setAskState] = useState<AskState>(demo?.ask ?? { status: "idle" });
  const [askAvailable, setAskAvailable] = useState(true); // false after /api/ask 404s
  const askId = useRef(0);
  const voiceTarget = useRef<"photo" | "history" | "main" | "hat">("photo");
  const [cmd, setCmd] = useState<CommandState>(initialCommandState);
  const cmdRef = useRef<CommandState>(initialCommandState);
  const cmdLocalId = useRef(0);
  const [shot, setShot] = useState<Shot | null>(demo?.shot ?? null);
  const [sheet, setSheetState] = useState<SheetName>(demo?.sheet ?? "none");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const cameraStartedAt = useRef(0);
  const [cameraReady, setCameraReady] = useState(false);
  const [hint, setHint] = useState<string | null>(demo?.hint ?? null);
  const [detection, setDetection] = useState<Detection | null>(demo?.detection ?? null);
  const [showDebug, setShowDebug] = useState(false);
  const [debug, setDebug] = useState<AutoDebug | null>(null);
  const detectionRef = useRef<Detection | null>(detection);
  const detectionHide = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const camGranted = demo ? true : !!camPerm?.granted;
  const camera = useRef<CameraView>(null);
  const recorder = useAudioRecorder({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true });
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shotRef = useRef<Shot | null>(shot);
  const sheetRef = useRef<SheetName>(sheet);
  const busyRef = useRef(false);
  const nextId = useRef(1);
  // Bumped whenever a result is dismissed or replaced. Async work (answers, follow-ups, web
  // lookups) captures it when it starts and stays silent if it changed in the meantime.
  const speakToken = useRef(0);
  const quietSince = useRef(Date.now());
  const speakingRef = useRef(false);
  const live = useRef({ settings, screenReader, connection });
  live.current = { settings, screenReader, connection };
  shotRef.current = shot;
  sheetRef.current = sheet;

  const mode = demo?.mode ?? settings.mode;

  // ---- setup -------------------------------------------------------------------------------
  useEffect(() => {
    void speech.init();
    const unsub = speech.subscribe((v) => {
      speakingRef.current = v;
      setSpeaking(v);
      if (!v) quietSince.current = Date.now();
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    void AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const a = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    const b = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    return () => {
      unsub();
      a.remove();
      b.remove();
    };
  }, []);

  useEffect(() => {
    speech.rate = settings.rate;
    speech.setRate(settings.rate);
    speech.natural = settings.naturalVoice;
    speech.voiceId = settings.voiceId;
    setDeviceId(settings.deviceId);
    saveSettings(settings);
  }, [settings]);

  const apiUrl = effectiveApiUrl(settings);
  const checkConnection = useCallback(async () => {
    setBaseUrl(effectiveApiUrl(live.current.settings));
    setConnection((c) => ({ ...c, state: "checking" }));
    setDeviceId(live.current.settings.deviceId);
    const [{ reachable, features }, list] = await Promise.all([getFeatures(), getVoices()]);
    speech.serverHasVoice = features.elevenlabs;
    setConnection({ state: reachable ? "ok" : "down", features });
    if (demo) return;
    setVoices(list);
    // A server without /api/frame-check once switched Auto off; switch it back on if it's there now.
    if (reachable && live.current.settings.autoOffByServer && (await frameCheckExists())) {
      setSettings((x) => ({ ...x, autoCapture: true, autoOffByServer: false }));
    }
    // History: off when the server says so, else probe the route (404 = older server).
    setHistoryOn(features.history === false || !reachable ? false : (await getHistory(1)) !== null);
  }, []);
  useEffect(() => {
    setBaseUrl(apiUrl);
    void checkConnection();
  }, [apiUrl, checkConnection]);

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  const patchShot = (id: number, fn: (s: Shot) => Shot) =>
    setShot((cur) => (cur && cur.id === id ? fn(cur) : cur));
  const setBusyBoth = (v: boolean) => {
    busyRef.current = v;
    setBusy(v);
  };

  // ---- silencing ------------------------------------------------------------------------------
  /** Stop every voice now and make any answer, follow-up or lookup still in flight stay silent. */
  const silence = useCallback(() => {
    speakToken.current++;
    speech.stop();
  }, []);

  // Every route away from a result goes through here: Done, swipe-down, Settings, a new capture.
  const setSheet = useCallback(
    (next: SheetName) => {
      if (sheetRef.current === "result" && next !== "result") silence();
      if (sheetRef.current === "recent" && next !== "recent") silence(); // the history answer
      if (sheetRef.current === "settings" && next !== "settings") speech.stop(); // voice sample
      sheetRef.current = next;
      setSheetState(next);
    },
    [silence],
  );

  useEffect(() => {
    const sub = AppState.addEventListener("change", (st) => {
      setAppActive(st === "active");
      if (st !== "active") silence();
    });
    return () => sub.remove();
  }, [silence]);

  // ---- speaking and announcing ---------------------------------------------------------------
  // With Auto-speak on, the app's own voice reads results, so VoiceOver isn't also told (it would
  // talk over it). With Auto-speak off, VoiceOver users get the result as an announcement.
  const say = useCallback(
    (text: string, lang = "en-US", opts: { queue?: boolean; token?: number } = {}) => {
      if (opts.token !== undefined && opts.token !== speakToken.current) return; // stale result
      const { settings: s, screenReader: sr } = live.current;
      if (s.autoSpeak) speech.speak(text, lang, opts);
      else if (sr) AccessibilityInfo.announceForAccessibilityWithOptions(text, { queue: !!opts.queue });
    },
    [],
  );

  const speakLang = (s: Shot) => (s.mode === "translate" ? languageCode(s.language) : "en-US");

  // ---- web lookup -------------------------------------------------------------------------------
  const runLookup = useCallback(
    async (s: Shot, auto: boolean) => {
      const r = s.result;
      if (!r || r.error) return;
      const token = speakToken.current;
      if (live.current.connection.features.lookup === false) {
        if (!auto) say("Web lookup isn't set up on this server.", "en-US", { token });
        return;
      }
      const query = r.webQuery ?? ""; // empty: the server proposes one from the answer
      // Show "Checking the web" only if the answer takes a moment; cached ones land instantly.
      const showLoading = setTimeout(
        () => patchShot(s.id, (x) => (x.web.status === "idle" ? { ...x, web: { status: "loading", query } } : x)),
        auto ? LOADING_DELAY_MS : 0,
      );
      if (!auto) haptic.capture();
      const data = await lookup({
        query,
        itemKind: r.itemKind,
        scanId: r.scanId,
        context: { mode: s.mode, spokenText: r.spokenText, details: r.details },
      });
      clearTimeout(showLoading);
      if (shotRef.current?.id !== s.id) return; // a newer photo replaced this one
      if (!data || (data.skipped && !data.spokenText) || (auto && (data.skipped || data.error))) {
        // Route missing, not configured, or nothing to find: hide the card quietly on auto lookups.
        patchShot(s.id, (x) => ({ ...x, web: { status: "idle" } }));
        if (!auto && data?.spokenText) say(data.spokenText, "en-US", { token });
        else if (!auto && !data) say("Web lookup isn't available on this server.", "en-US", { token });
        return;
      }
      patchShot(s.id, (x) => ({ ...x, web: { status: "done", data } }));
      if (token !== speakToken.current) return; // sheet closed meanwhile: show it, never speak it
      if (!data.error) haptic.success();
      say(data.spokenText, "en-US", { queue: auto, token });
    },
    [say],
  );

  // ---- analyze ---------------------------------------------------------------------------------
  const runAnalyze = useCallback(
    async (s: Shot) => {
      if (!s.photo) return;
      const token = speakToken.current;
      const r = await analyze({
        image: s.photo.base64,
        mode: s.mode,
        ...(s.mode === "translate" ? { language: s.language } : {}),
        ...(s.key ? { key: s.key } : {}),
      });
      if (shotRef.current?.id !== s.id) return;
      const done: Shot = { ...s, result: r };
      setShot(done);
      shotRef.current = done;
      setBusyBoth(false);
      if (token !== speakToken.current) return; // dismissed while looking: keep the result, stay quiet
      if (r.error) haptic.error();
      else haptic.success();
      say(r.spokenText, speakLang(s), { token });
      // Look the identified product, medicine or place up on the web once the answer is out.
      if (!r.error && r.webQuery && r.itemKind && r.itemKind !== "none") void runLookup(done, true);
    },
    [runLookup, say],
  );

  const start = useCallback(
    async (getPhoto: () => Promise<Photo | null>, opts: { auto?: boolean; mode?: Mode; key?: string } = {}) => {
      if (busyRef.current) return;
      setBusyBoth(true);
      silence(); // a new read always cuts off the previous one
      setHint(null);
      if (opts.auto) haptic.tick();
      else haptic.capture();
      const id = nextId.current++;
      const { settings: s } = live.current;
      const mode = opts.mode ?? s.mode;
      if (opts.mode && opts.mode !== s.mode) setSettings((x) => ({ ...x, mode }));
      const fresh: Shot = { id, photo: null, mode, language: s.language, followUps: [], web: { status: "idle" }, key: opts.key };
      try {
        const photo = await getPhoto();
        if (!photo) {
          setBusyBoth(false);
          return;
        }
        const withPhoto = { ...fresh, photo };
        setShot(withPhoto);
        shotRef.current = withPhoto;
        setSheet("result");
        await runAnalyze(withPhoto);
      } catch {
        setBusyBoth(false);
        haptic.error();
        say("Sorry, I couldn't take that photo. Please try again.");
      }
    },
    [runAnalyze, say, setSheet, silence],
  );

  // ---- auto-capture ------------------------------------------------------------------------------
  const hat = demo ? demo.hat : !!(settings.hatConnected && settings.hatDeviceId.trim());
  const autoEnabled =
    !demo &&
    !hat &&
    Platform.OS !== "web" &&
    settings.autoCapture &&
    appActive &&
    cameraReady &&
    !!camPerm?.granted &&
    sheet === "none" &&
    !busy &&
    !speaking &&
    !recording;

  const auto = useAutoCapture({
    enabled: autoEnabled,
    // Same capture settings as Capture (which gives good photos), minus the shutter sound, then
    // shrunk to 512 px. Never while the camera is (re)starting, never overlapping another capture.
    takeFrame: () =>
      withCamera(async () => {
        if (!cameraStartedAt.current || Date.now() - cameraStartedAt.current < CAMERA_SETTLE_MS) return null;
        if (busyRef.current || sheetRef.current !== "none") return null;
        const pic = await camera.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
        if (!pic) return null;
        return toFrame(pic.uri, pic.width, pic.height);
      }),
    check: (image, last) => {
      const { settings: s } = live.current;
      return frameCheck({ image, mode: s.mode, ...(s.mode === "translate" ? { language: s.language } : {}), ...last });
    },
    // Auto never reads by itself: it only offers the card. Reading starts when the user taps it.
    onDetect: (d, appeared) => showDetection(d, false, 2000, appeared),
    onDebug: showDebug ? setDebug : undefined,
    onHint: (text) => {
      if (busyRef.current || sheetRef.current !== "none") return; // never over a result
      setHint(text);
      const { settings: s, screenReader: sr } = live.current;
      if (s.autoSpeak) speech.hint(text);
      else if (sr) AccessibilityInfo.announceForAccessibility(text);
    },
    onUnavailable: () => update({ autoCapture: false, autoOffByServer: true }), // older server: off, quietly
  });
  useEffect(() => {
    if (autoEnabled || demo) return;
    setHint(null);
    showDetection(null, true);
  }, [autoEnabled]);

  // Suggestion card. Appears (with a light haptic and a VoiceOver announcement, never TTS) when
  // frame-check detects something; stays while it's detected; fades about 2 s after it's gone.
  function showDetection(d: Detection | null, now = false, hideAfterMs = 2000, appeared?: boolean) {
    if (!d) {
      if (now) {
        if (detectionHide.current) clearTimeout(detectionHide.current);
        detectionHide.current = null;
        detectionRef.current = null;
        setDetection(null);
      } else if (detectionRef.current && !detectionHide.current) {
        detectionHide.current = setTimeout(() => {
          detectionHide.current = null;
          detectionRef.current = null;
          setDetection(null);
        }, hideAfterMs);
      }
      return;
    }
    if (detectionHide.current) clearTimeout(detectionHide.current);
    detectionHide.current = null;
    const prev = detectionRef.current;
    detectionRef.current = d;
    setDetection(d);
    if (appeared === false || (appeared === undefined && prev && prev.key === d.key)) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    // Point the mode chips at the suggestion so a manual Capture uses it too.
    if (d.mode && d.mode !== live.current.settings.mode && !live.current.settings.hatConnected) {
      setSettings((x) => ({ ...x, mode: d.mode! }));
    }
    if (live.current.screenReader) AccessibilityInfo.announceForAccessibility(`${d.label} detected. Double-tap the card to read.`);
  }

  const readDetection = () => {
    const d = detectionRef.current;
    if (!d) return;
    showDetection(null, true);
    void start(capturePhoto(true), { mode: d.mode ?? undefined, key: d.key });
  };

  const dismissDetection = () => {
    const d = detectionRef.current;
    if (!d) return;
    haptic.tick();
    auto.dismiss(d.key);
    showDetection(null, true);
  };

  // Whenever a sheet closes, Auto resumes at once and may offer the same item again (rescan).
  useEffect(() => {
    if (sheet === "none") auto.resume();
  }, [sheet]);

  // ---- hat camera ---------------------------------------------------------------------------------
  // The phone is the speaker for a camera on a cap: it polls the server for what the hat saw.
  const hatHint = useRef({ text: "", since: 0, lastSpoken: 0 });
  const hatHintClear = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hatShotToken = useRef<{ shotId: number; token: number } | null>(null);

  // Answers and status messages go through the command reducer first: answers to the pending
  // voice command open and speak; stale ones are dropped; the hat's own reads pass through.
  const onHatEvent = (e: DeviceEvent) => {
    if (e.kind === "answer" || e.kind === "status") dispatchCmd({ type: "event", event: e });
    else handleHatEvent(e);
  };

  function dispatchCmd(action: CommandAction) {
    const { state, effects } = reduceCommand(cmdRef.current, action);
    cmdRef.current = state;
    setCmd(state);
    for (const fx of effects) {
      if (fx.type === "stopSpeech") silence();
      else if (fx.type === "speak") say(fx.text);
      else handleHatEvent(fx.event); // showAnswer and passthrough both use the normal answer flow
    }
  }

  // Ticks the 12 s answer timeout while a command is pending.
  useEffect(() => {
    if (!cmd.current) return;
    const t = setInterval(() => dispatchCmd({ type: "tick", at: Date.now() }), 500);
    return () => clearInterval(t);
  }, [!!cmd.current]);

  const hatCommandsOn = !!demo || connection.features.hatCommands === true;

  /** Typed and spoken requests in hat mode both come through here (same routing, same path). */
  async function submitHatInput(raw: string, source: "typed" | "voice") {
    const route = routeInput(raw, { askAvailable: askOn, source });
    if (route.kind === "empty") return;
    if (route.kind === "ask") {
      void openRecent();
      return void runAsk(route.question);
    }
    if (!hatCommandsOn) {
      haptic.error();
      return say("Talking to the hat camera isn't available on this server yet.");
    }
    const localId = ++cmdLocalId.current;
    haptic.capture();
    dispatchCmd({ type: "send", localId, text: route.text, at: Date.now() });
    const { settings: st } = live.current;
    const res = await sendHatCommand(st.hatDeviceId.trim(), st.hatPairCode.trim(), route.text);
    if (res.accepted && res.commandId) dispatchCmd({ type: "accepted", localId, commandId: res.commandId });
    else dispatchCmd({ type: "rejected", localId, reason: res.reason ?? "error" });
  }

  const handleHatEvent = (e: DeviceEvent) => {
    const p = e.payload;
    if (e.kind === "detected") {
      const label = typeof p.label === "string" && p.label.trim() ? p.label.trim() : "";
      if (!label) return;
      const key = typeof p.key === "string" && p.key ? p.key : label;
      const mode = MODES.includes(p.suggestedMode as Mode) ? (p.suggestedMode as Mode) : null;
      const confidence = typeof p.confidence === "number" ? p.confidence : null;
      if (sheetRef.current !== "none") return;
      showDetection({ key, label, mode, confidence });
      showDetection(null, false, 4000); // fades 4 s after the last sighting
      return;
    }
    if (e.kind === "hint") {
      const text =
        typeof p.hint === "string" ? p.hint.trim() : typeof p.text === "string" ? p.text.trim() : "";
      if (!text) return;
      setHint(text); // always shown quietly
      if (hatHintClear.current) clearTimeout(hatHintClear.current);
      hatHintClear.current = setTimeout(() => setHint(null), 4000);
      const h = hatHint.current;
      const t = Date.now();
      if (h.text !== text) {
        hatHint.current = { text, since: t, lastSpoken: h.lastSpoken };
        return;
      }
      // Same hint for 3 s, at most every 5 s, never over a result or other speech.
      if (t - h.since >= 3000 && t - h.lastSpoken >= 5000 && sheetRef.current === "none" && !speech.owner && !speakingRef.current) {
        h.lastSpoken = t;
        const { settings: st, screenReader: sr } = live.current;
        if (st.autoSpeak) speech.hint(text);
        else if (sr) AccessibilityInfo.announceForAccessibility(text);
      }
      return;
    }
    // answer
    const { answer, lookup: web, image, scanId } = parseDeviceAnswer(p);
    const cur = shotRef.current;
    const sameScan = !!scanId && cur?.result?.scanId === scanId;
    if (sameScan || (!answer && web)) {
      // Lookup data arriving for the answer already on screen: add the web card, then speak it
      // after the answer, unless that result was dismissed meanwhile.
      if (!cur || !web || cur.web.status === "done") return;
      if (scanId && cur.result?.scanId && cur.result.scanId !== scanId) return;
      patchShot(cur.id, (x) => ({ ...x, web: { status: "done", data: web } }));
      const tok = hatShotToken.current;
      if (tok && tok.shotId === cur.id && tok.token === speakToken.current && !web.error) {
        say(web.spokenText, "en-US", { queue: true, token: tok.token });
      }
      return;
    }
    if (!answer) return;
    silence(); // a new answer replaces whatever was being said
    const token = speakToken.current;
    const mode = MODES.includes(p.mode as Mode) ? (p.mode as Mode) : live.current.settings.mode;
    const next: Shot = {
      id: nextId.current++,
      photo: image ? { uri: image, base64: "", width: 4, height: 3 } : null,
      mode,
      language: live.current.settings.language,
      result: answer,
      followUps: [],
      web: web ? { status: "done", data: web } : { status: "idle" },
      fromHistory: true, // no photo data on the phone: no follow-ups or retry
    };
    setShot(next);
    shotRef.current = next;
    hatShotToken.current = { shotId: next.id, token };
    showDetection(null, true);
    setHint(null);
    sheetRef.current = "result";
    setSheetState("result");
    if (answer.error) haptic.error();
    else haptic.success();
    say(answer.spokenText, mode === "translate" ? languageCode(next.language) : "en-US", { token });
    if (web && !web.error) say(web.spokenText, "en-US", { queue: true, token });
  };

  const hatCam = useHatCamera({
    enabled: hat && !demo,
    hardwareId: settings.hatDeviceId.trim(),
    pairCode: settings.hatPairCode.trim(),
    onEvent: onHatEvent,
  });

  const disconnectHat = () => {
    haptic.tick();
    silence();
    showDetection(null, true);
    setHint(null);
    update({ hatConnected: false });
    if (live.current.screenReader) AccessibilityInfo.announceForAccessibility("Hat camera disconnected");
  };

  const pausedReasons = [
    !settings.autoCapture && "Auto off",
    !appActive && "app inactive",
    !cameraReady && "camera not ready",
    !camPerm?.granted && "no camera permission",
    sheet !== "none" && `sheet: ${sheet}`,
    busy && "busy",
    speaking && "speaking",
    recording && "recording",
  ].filter(Boolean) as string[];

  // Full-quality frame for a read. The shutter sound is the cue on a manual tap; auto reads use
  // the haptic tick instead.
  function capturePhoto(shutter: boolean) {
    return async () => {
      const pic = await withCamera(() => camera.current!.takePictureAsync({ quality: 0.7, shutterSound: shutter }));
      if (!pic) throw new Error("camera not ready");
      return toJpeg(pic.uri, pic.width, pic.height);
    };
  }

  const capture = () => start(capturePhoto(true));

  // The preview stops while a sheet is open; give exposure time to settle after it restarts.
  const cameraLive = sheet === "none" && appActive && !hat;
  useEffect(() => {
    cameraStartedAt.current = cameraLive && cameraReady ? Date.now() : 0;
  }, [cameraLive, cameraReady]);

  // The default "photo" preset on purpose: a video preset (1920x1080) captured faster but is
  // the prime suspect for the dark auto frames, and manual Capture photos were fine without it.
  const onCameraReady = () => {
    setCameraReady(true);
    cameraStartedAt.current = Date.now();
  };

  const pickPhoto = () =>
    start(async () => {
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1 });
      if (res.canceled || !res.assets[0]) return null;
      const a = res.assets[0];
      return toJpeg(a.uri, a.width, a.height);
    });

  const retry = () => {
    const s = shotRef.current;
    if (!s?.photo || busyRef.current) return;
    silence();
    setBusyBoth(true);
    haptic.capture();
    const again = { ...s, result: undefined, web: { status: "idle" as const } };
    setShot(again);
    shotRef.current = again;
    void runAnalyze(again);
  };

  // ---- follow-up questions ----------------------------------------------------------------------
  const ask = async (question: string) => {
    const s = shotRef.current;
    if (!s?.photo || !s.result || s.result.error) return;
    silence(); // stop the previous answer (and any queued web summary) before the new one
    const token = speakToken.current;
    const fid = nextId.current++;
    patchShot(s.id, (x) => ({ ...x, followUps: [...x.followUps, { id: fid, question }] }));
    haptic.capture();
    const answer = await analyze({
      image: s.photo.base64,
      mode: s.mode,
      question,
      ...(s.mode === "translate" ? { language: s.language } : {}),
    });
    if (shotRef.current?.id !== s.id) return;
    patchShot(s.id, (x) => ({
      ...x,
      followUps: x.followUps.map((f) => (f.id === fid ? { ...f, answer } : f)),
    }));
    if (token !== speakToken.current) return;
    if (answer.error) haptic.error();
    else haptic.success();
    say(answer.spokenText, speakLang(s), { token });
  };

  const stopRecording = async () => {
    if (recordTimer.current) clearTimeout(recordTimer.current);
    recordTimer.current = null;
    setRecording(false);
    try {
      await recorder.stop();
    } catch {}
    // Leave record mode, or iOS keeps playback on the quiet earpiece.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
    const uri = recorder.uri;
    const token = speakToken.current;
    if (!uri) return say("I didn't catch that. Please try again.", "en-US", { token });
    setTranscribing(true);
    const { text, status: code } = await transcribe(uri);
    setTranscribing(false);
    if (code === 404 || code === 503) {
      setConnection((c) => ({ ...c, features: { ...c.features, transcribe: false } }));
      return say("Voice questions aren't available on this server. Please type your question.", "en-US", { token });
    }
    if (!text) {
      haptic.error();
      return say("I didn't catch that. Please try again.", "en-US", { token });
    }
    if (token !== speakToken.current) return; // sheet closed while transcribing
    const target = voiceTarget.current;
    if (target === "hat") return void submitHatInput(text, "voice");
    if (target === "photo") return void ask(text);
    if (target === "history") return void runAsk(text);
    // Main screen: questions about earlier scans (or any question before there's a photo) go to
    // "Ask your history"; anything else is a follow-up about the last photo.
    const hasPhoto = !!shotRef.current?.photo?.base64 && !!shotRef.current.result && !shotRef.current.result.error;
    if (!hasPhoto || HISTORY_QUESTION.test(text)) {
      if (!askOn) {
        haptic.error();
        return say("Take a photo first, then ask about it.");
      }
      void openRecent();
      return void runAsk(text);
    }
    setSheet("result");
    void ask(text);
  };

  const toggleMic = async (target: "photo" | "history" | "main" | "hat" = "photo") => {
    if (recording) return stopRecording();
    voiceTarget.current = target;
    if (target === "hat") silence(); // also keeps a late web summary from talking over the recording
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      haptic.error();
      return say("Microphone access is off. You can turn it on in Settings, or type your question.");
    }
    speech.stop();
    try {
      // Phone mic or Bluetooth headset mic (expo-audio adds allowBluetooth when recording), and
      // keep output on the loudspeaker rather than the quiet earpiece receiver.
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setRecording(true);
      haptic.tick();
      if (live.current.screenReader) AccessibilityInfo.announceForAccessibility("Listening");
      recordTimer.current = setTimeout(() => void stopRecording(), MAX_RECORD_MS);
    } catch {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      haptic.error();
      say("I couldn't start the microphone.");
    }
  };

  // ---- recent scans ------------------------------------------------------------------------------
  const openRecent = async () => {
    setSheet("recent");
    setScansLoading(true);
    const list = await getHistory(20);
    setScansLoading(false);
    if (list === null) {
      setScans(null);
      if (!demo && !askOn) {
        setHistoryOn(false); // route gone: hide the entry point
        setSheet("none");
      }
      return;
    }
    setScans(list);
  };

  // ---- ask your history ---------------------------------------------------------------------------
  const askOn = !!demo || (askAvailable && connection.features.ask !== false && connection.state !== "down");

  async function runAsk(question: string) {
    silence(); // a new answer replaces whatever was being said
    const token = speakToken.current;
    const id = ++askId.current;
    setAskState({ status: "loading", question });
    haptic.capture();
    const answer = await askHistory(question);
    if (id !== askId.current) return; // a newer question replaced this one
    if (!answer) {
      setAskAvailable(false);
      setAskState({ status: "idle" });
      say("Asking about your scans isn't available on this server.", "en-US", { token });
      return;
    }
    setAskState({ status: "done", question, answer, id });
    if (answer.error) haptic.error();
    else haptic.success();
    say(answer.spokenText, "en-US", { token });
  }

  const clearAsk = () => {
    askId.current++;
    silence();
    setAskState({ status: "idle" });
  };

  const openScanId = async (id: string) => {
    let scan = scans?.find((x) => x.id === id);
    if (!scan) scan = (await getHistory(50))?.find((x) => x.id === id);
    if (scan) openScan(scan);
    else {
      haptic.error();
      say("I couldn't open that scan.");
    }
  };

  const openScan = (scan: Scan) => {
    silence();
    const reopened: Shot = {
      id: nextId.current++,
      photo: scan.image ? { uri: scan.image, base64: "", width: 4, height: 3 } : null,
      mode: scan.mode,
      language: live.current.settings.language,
      result: { spokenText: scan.spokenText, details: "", sections: scan.sections, itemKind: scan.itemKind },
      followUps: [],
      web: scan.lookup ? { status: "done", data: scan.lookup } : { status: "idle" },
      fromHistory: true,
    };
    setShot(reopened);
    shotRef.current = reopened;
    setSheet("result");
  };

  const confirmClearHistory = () => {
    Alert.alert("Clear history?", "This removes your recent scans from the server.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          const ok = await clearHistory();
          if (ok) {
            setScans([]);
            haptic.success();
            if (live.current.screenReader) AccessibilityInfo.announceForAccessibility("History cleared");
          } else {
            haptic.error();
            Alert.alert("Couldn't clear history", "Check the server connection and try again.");
          }
        },
      },
    ]);
  };

  // ---- ask while looking ---------------------------------------------------------------------------
  // Hold the mic (or tap it) on the camera screen and ask about what's in front of you: on release
  // a fresh frame is captured and the question is answered about it. Logic: logic/askWhileLooking.
  const [caption, setCaption] = useState<CaptionState>(demo?.caption ?? initialCaption);
  const captionRef = useRef<CaptionState>(caption);
  const [level, setLevel] = useState(0); // 0..1 mic level for the caption
  const [frozen, setFrozen] = useState<string | null>(demo?.frozen ?? null);
  const supportsUtterance = useRef(true);
  const looking = useRef({ recording: false, pressedAt: 0, ignoreRelease: false, poll: null as ReturnType<typeof setInterval> | null });
  const captionFade = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dispatchCaption(e: CaptionEvent) {
    const r = reduceCaption(captionRef.current, e);
    captionRef.current = r.state;
    setCaption(r.state);
    for (const fx of r.effects) {
      if (fx.type === "stopSpeech") silence();
      else if (live.current.screenReader && !(fx.text === "Answer ready." && live.current.settings.autoSpeak)) {
        AccessibilityInfo.announceForAccessibility(fx.text);
      }
    }
    if (r.state.phase === "answered" || r.state.phase === "error") {
      if (captionFade.current) clearTimeout(captionFade.current);
      captionFade.current = setTimeout(() => {
        dispatchCaption({ type: "faded" });
        setFrozen(null);
      }, r.state.phase === "answered" ? 1500 : 3000);
    }
  }

  const lookingAvailable = !hat && camGranted && !demo;

  async function startLooking() {
    if (busyRef.current || looking.current.recording) return;
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      haptic.error();
      return say("Microphone access is off. You can turn it on in Settings.");
    }
    if (captionFade.current) clearTimeout(captionFade.current);
    setFrozen(null);
    dispatchCaption({ type: "press" }); // stops speech first
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true, shouldRouteThroughEarpiece: false });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      haptic.error();
      return dispatchCaption({ type: "failed", message: "I couldn't start the microphone." });
    }
    looking.current.recording = true;
    looking.current.pressedAt = Date.now();
    haptic.tick();
    let quiet = initialSilence;
    const started = Date.now();
    looking.current.poll = setInterval(() => {
      let db: number | undefined;
      try {
        db = recorder.getStatus().metering;
      } catch {
        db = undefined;
      }
      if (typeof db === "number") setLevel(Math.max(0, Math.min(1, (db + 60) / 50)));
      const t = trackSilence(quiet, db, Date.now());
      quiet = t.state;
      if (t.stop || Date.now() - started > MAX_RECORD_MS) void finishLooking();
    }, 100);
  }

  async function finishLooking() {
    if (!looking.current.recording) return;
    looking.current.recording = false;
    if (looking.current.poll) clearInterval(looking.current.poll);
    looking.current.poll = null;
    setLevel(0);
    dispatchCaption({ type: "release" });
    setBusyBoth(true);
    // Fresh full-quality frame (no shutter flash or sound) while the speech is transcribed.
    const framePromise = withCamera(async () => {
      const pic = await camera.current?.takePictureAsync({ quality: 0.7, shutterSound: false });
      return pic ? toJpeg(pic.uri, pic.width, pic.height) : null;
    }).catch(() => null);
    const textPromise = (async () => {
      try {
        await recorder.stop();
      } catch {}
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      const uri = recorder.uri;
      return uri ? transcribe(uri) : { text: "", status: 0 };
    })();
    const [photo, heard] = await Promise.all([framePromise, textPromise]);
    if (photo) setFrozen(photo.uri);
    dispatchCaption({ type: "transcribed", text: heard.text });
    const route = routeInput(heard.text, { askAvailable: askOn, source: "voice" });
    if (route.kind === "empty") {
      setBusyBoth(false);
      haptic.error();
      if (heard.status === 404 || heard.status === 503) {
        setConnection((c) => ({ ...c, features: { ...c.features, transcribe: false } }));
      }
      return;
    }
    if (route.kind === "ask") {
      setBusyBoth(false);
      dispatchCaption({ type: "interpreted" });
      void openRecent();
      void runAsk(route.question);
      return dispatchCaption({ type: "answered" });
    }
    if (!photo) {
      setBusyBoth(false);
      haptic.error();
      return dispatchCaption({ type: "failed", message: "I couldn't take a picture. Try again." });
    }
    await answerLooking(photo, route.text);
  }

  async function answerLooking(photo: Photo, text: string) {
    const { settings: st } = live.current;
    const token = speakToken.current;
    const ask = (supports: boolean) =>
      analyze(buildLookingRequest({ image: photo.base64, mode: st.mode, language: st.language, utterance: text, supportsUtterance: supports }));
    let r = await ask(supportsUtterance.current);
    if (supportsUtterance.current && fallbackFor(r) === "retry-as-question") {
      supportsUtterance.current = false; // older server: send the words as a question from now on
      r = await ask(false);
    }
    dispatchCaption({ type: "interpreted", interpreted: r.interpreted });
    const mode = r.interpreted?.mode ?? st.mode;
    const language = r.interpreted?.language ?? st.language;
    const next: Shot = {
      id: nextId.current++,
      photo,
      mode,
      language,
      result: r,
      followUps: [],
      web: { status: "idle" },
      asked: text,
    };
    setShot(next);
    shotRef.current = next;
    setBusyBoth(false);
    if (token !== speakToken.current) return; // the user started something else meanwhile
    setSheet("result");
    dispatchCaption(r.error ? { type: "failed", message: r.spokenText } : { type: "answered" });
    if (r.error) haptic.error();
    else haptic.success();
    say(r.spokenText, mode === "translate" ? languageCode(language) : "en-US", { token });
    const wantsLookup = !r.error && (r.autoLookup || (r.webQuery && r.itemKind && r.itemKind !== "none"));
    if (wantsLookup) void runLookup(next, true);
  }

  const onMicPressIn = () => {
    if (!lookingAvailable) return void toggleMic("main");
    if (looking.current.recording) {
      looking.current.ignoreRelease = true; // second tap in tap-to-talk mode: send now
      return void finishLooking();
    }
    looking.current.ignoreRelease = false;
    void startLooking();
  };
  const onMicPressOut = () => {
    if (!lookingAvailable || looking.current.ignoreRelease) return;
    // Held: release sends. A quick tap keeps listening until silence or a second tap.
    if (looking.current.recording && Date.now() - looking.current.pressedAt >= 350) void finishLooking();
  };

  const closeResult = () => {
    if (recording) void stopRecording();
    setSheet("none");
  };

  const changeMode = (m: Mode) => {
    if (m === settings.mode) return;
    haptic.tick();
    update({ mode: m });
    if (live.current.screenReader) AccessibilityInfo.announceForAccessibility(`${MODE_LABELS[m]} mode`);
  };

  // Swipe left/right on the viewfinder to change mode (iOS Camera); a plain tap captures.
  const swipe = useRef({ change: changeMode, capture: () => {}, mode: settings.mode });
  swipe.current = { change: changeMode, capture: () => void capture(), mode: settings.mode };
  const modeSwipe = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (_e, g) => {
        const { change, capture: snap, mode: cur } = swipe.current;
        if (Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5) {
          const i = MODES.indexOf(cur) + (g.dx < 0 ? 1 : -1);
          if (i >= 0 && i < MODES.length) change(MODES[i]);
        } else if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8) {
          snap();
        }
      },
    }),
  ).current;

  const toggleAuto = () => {
    haptic.tick();
    const next = !settings.autoCapture;
    update({ autoCapture: next, autoOffByServer: false });
    if (live.current.screenReader) AccessibilityInfo.announceForAccessibility(next ? "Auto on" : "Auto off");
  };

  // ---- render -----------------------------------------------------------------------------------
  const micListening = caption.phase === "listening" || (recording && !lookingAvailable);
  const last = shot?.result && !shot.result.error ? shot : null;

  return (
    <View style={s.root}>
      <StatusBar style={hat ? "dark" : "light"} />

      {hat ? (
        <HatView
          deviceId={demo ? "cap-01" : settings.hatDeviceId.trim()}
          status={demo ? "live" : hatCam.status}
          lastEventAt={demo ? Date.now() - 3000 : hatCam.lastEventAt}
          detection={sheet === "none" ? detection : null}
          hint={hint}
          last={last}
          reduceMotion={reduceMotion}
          topInset={insets.top}
          bottomInset={insets.bottom}
          onOpenLast={() => setSheet("result")}
          onDisconnect={disconnectHat}
          commandsOn={hatCommandsOn}
          recording={recording && voiceTarget.current === "hat"}
          transcribing={transcribing && voiceTarget.current === "hat"}
          asking={demo?.hatAsking ?? (cmd.current ? cmd.current.text : null)}
          onTalk={() => void toggleMic("hat")}
          onType={(text) => void submitHatInput(text, "typed")}
        />
      ) : null}

      {/* Camera screen: full-bleed viewfinder with iOS Camera-style controls on top. */}
      {!hat ? (
        <View style={StyleSheet.absoluteFill} {...modeSwipe.panHandlers}>
          {demo ? (
            <Image source={demo.photo} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : camGranted ? (
            <CameraView
              ref={camera}
              style={StyleSheet.absoluteFill}
              facing="back"
              active={sheet === "none" && appActive}
              animateShutter={false}
              flash="off"
              onCameraReady={onCameraReady}
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, s.permission, { paddingTop: insets.top + 96 }]}>
              <Text style={type.largeTitle} accessibilityRole="header">
                Camera access
              </Text>
              <Text style={[type.body, { color: colors.secondary }]}>
                SightLine needs the camera to see what's in front of you. You can also pick a photo from your library.
              </Text>
              <PillButton
                label={camPerm?.canAskAgain === false ? "Open Settings" : "Allow camera"}
                onPress={() => (camPerm?.canAskAgain === false ? void Linking.openSettings() : void requestCamPerm())}
                style={{ alignSelf: "flex-start" }}
              />
            </View>
          )}
          {camGranted ? (
            <View
              style={StyleSheet.absoluteFill}
              accessible
              accessibilityRole="button"
              accessibilityLabel="Camera viewfinder"
              accessibilityHint={`Double-tap to capture in ${MODE_LABELS[mode]} mode. Swipe left or right to change mode.`}
              onAccessibilityTap={capture}
            />
          ) : null}
        </View>
      ) : null}

      {!hat ? (
        <>
          {/* Scrims keep the controls legible over any image. */}
          <LinearGradient
            colors={["rgba(0,0,0,0.45)", "rgba(0,0,0,0)"]}
            style={[s.scrimTop, { height: insets.top + 90 }]}
            pointerEvents="none"
          />
          <LinearGradient
            colors={["rgba(0,0,0,0)", "rgba(0,0,0,0.7)"]}
            style={[s.scrimBottom, { height: insets.bottom + 260 }]}
            pointerEvents="none"
          />

          {/* Top: Auto, Recent, Settings */}
          <View style={[s.camTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
            <CamButton
              role="switch"
              label="Auto"
              on={settings.autoCapture}
              hint="Offers a card when it sees something to read. Long-press for the debug readout."
              onPress={toggleAuto}
              onLongPress={() => {
                haptic.tick();
                setShowDebug((v) => !v);
              }}
            >
              <Icon
                sf={settings.autoCapture ? "sparkles" : "sparkles"}
                ion="sparkles"
                size={16}
                color={settings.autoCapture ? colors.label : "#FFFFFF"}
              />
              <Text style={[s.camTopText, settings.autoCapture && { color: colors.label }]} maxFontSizeMultiplier={1.4}>
                {settings.autoCapture ? "AUTO" : "AUTO OFF"}
              </Text>
            </CamButton>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {historyOn || askOn ? (
                <CamButton label="Recent scans" onPress={() => void openRecent()}>
                  <Icon sf="clock.arrow.circlepath" ion="time-outline" size={20} color="#FFFFFF" />
                </CamButton>
              ) : null}
              <CamButton label="Settings" onPress={() => setSheet("settings")}>
                <Icon sf="gearshape" ion="settings-outline" size={20} color="#FFFFFF" />
              </CamButton>
            </View>
          </View>

          {/* Upper third: captions, hints, server status */}
          <View style={[s.caption, { top: insets.top + 70 }]} pointerEvents="box-none">
            {caption.phase === "listening" ? (
              <Frost style={s.captionPill}>
                <View
                  style={s.bars}
                  accessible
                  accessibilityLabel="Listening"
                  accessibilityLiveRegion="polite"
                >
                  {[0.45, 0.8, 1, 0.7, 0.4].map((w, i) => (
                    <View
                      key={i}
                      style={[s.bar, { height: reduceMotion ? 8 : 4 + Math.round(14 * Math.min(1, level * w * 1.4)) }]}
                    />
                  ))}
                </View>
                <Text style={[type.headline, { color: colors.label }]}>Listening…</Text>
              </Frost>
            ) : caption.phase !== "idle" ? (
              <View style={{ alignItems: "center", gap: 10 }}>
                {caption.text ? (
                  <Frost style={s.captionCard}>
                    <Text style={s.captionQuote} accessibilityLabel={`You asked: ${caption.text}`}>
                      “{caption.text}”
                    </Text>
                  </Frost>
                ) : null}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  {frozen ? <Image source={{ uri: frozen }} style={s.frozen} contentFit="cover" accessible={false} /> : null}
                  {caption.status || caption.phase === "transcribing" ? (
                    <Frost dark style={s.statusPill}>
                      <Text style={s.statusText}>{caption.phase === "transcribing" ? "Listening back…" : caption.status}</Text>
                    </Frost>
                  ) : null}
                </View>
              </View>
            ) : connection.state === "down" && !demo ? (
              <Pressable
                onPress={() => setSheet("settings")}
                accessibilityRole="button"
                accessibilityLabel="Can't reach the SightLine server. Open settings."
              >
                <Frost style={s.captionPill}>
                  <Icon sf="wifi.exclamationmark" ion="cloud-offline-outline" size={18} color={colors.label} />
                  <Text style={[type.subhead, { color: colors.label, fontWeight: "600" }]}>Can't reach the server</Text>
                </Frost>
              </Pressable>
            ) : hint && !detection ? (
              <Frost style={s.captionPill}>
                <Icon sf="viewfinder" ion="scan-outline" size={18} color={colors.label} />
                <Text style={[type.subhead, { color: colors.label, fontWeight: "600", flexShrink: 1 }]} accessibilityLabel={hint}>
                  {hint}
                </Text>
              </Frost>
            ) : null}
          </View>

          {/* Bottom: detection pill, mode strip, then thumbnail · shutter · mic */}
          <View style={[s.camBottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
            <DetectionCard
              detection={sheet === "none" ? detection : null}
              reduceMotion={reduceMotion}
              onPress={readDetection}
              onDismiss={dismissDetection}
            />
            <ModeStrip mode={mode} onChange={changeMode} language={settings.language} onLanguage={() => setSheet("language")} />
            <View style={s.camRow}>
              <LastThumb
                uri={last?.photo?.uri ?? null}
                label={last ? `Last answer: ${last.result!.spokenText}` : "Choose a photo"}
                hint={last ? "Opens the last answer" : "Picks a photo from your library"}
                onPress={last ? () => setSheet("result") : pickPhoto}
                actions={[
                  ...(last ? [{ name: "library", label: "Choose a photo" }] : []),
                  ...(historyOn || askOn ? [{ name: "recent", label: "Recent scans" }] : []),
                ]}
                onAction={(name) => (name === "library" ? void pickPhoto() : void openRecent())}
              />
              <Shutter
                onPress={capture}
                busy={busy}
                disabled={!camGranted}
                label={busy ? "Looking" : `Capture, ${MODE_LABELS[mode]} mode`}
              />
              {connection.features.transcribe !== false && (Platform.OS !== "web" || demo) ? (
                <Pressable
                  onPressIn={onMicPressIn}
                  onPressOut={onMicPressOut}
                  accessibilityRole="button"
                  accessibilityLabel={micListening ? "Stop and ask" : "Ask about what's in front of you"}
                  accessibilityHint={
                    micListening ? "Sends your question" : 'Hold and speak, or tap and speak. For example, "what does this sign say?"'
                  }
                  style={({ pressed }) => [s.camMic, micListening && s.camMicOn, pressed && { opacity: 0.8 }]}
                >
                  {micListening ? <View style={s.recDot} /> : <Icon sf="mic.fill" ion="mic" size={26} color="#FFFFFF" />}
                </Pressable>
              ) : (
                <View style={{ width: 56 }} />
              )}
            </View>
          </View>
        </>
      ) : null}

      {/* Hat mode keeps its own top bar */}
      {hat ? (
        <View style={[s.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <View style={[s.wordmark, { backgroundColor: colors.surface }]} accessibilityRole="header">
            <Text style={[type.headline, { fontWeight: "700" }]} maxFontSizeMultiplier={1.6} numberOfLines={1}>
              SightLine
            </Text>
          </View>
          <View style={s.topRight}>
            {historyOn || askOn ? (
              <IconButton onPress={() => void openRecent()} label="Recent scans" filled="surface">
                <Icon sf="clock.arrow.circlepath" ion="time-outline" />
              </IconButton>
            ) : null}
            <IconButton onPress={() => setSheet("settings")} label="Settings" filled="surface">
              <Icon sf="gearshape" ion="settings-outline" />
            </IconButton>
          </View>
        </View>
      ) : null}
      {showDebug && !hat ? (
        <View style={[s.debug, { top: insets.top + 60 }]} accessible accessibilityLabel="Auto capture debug readout">
          <Text style={s.debugText}>
            {[
              `auto: ${autoEnabled ? "running" : `paused (${pausedReasons.join(", ") || "?"})`}`,
              `motion: ${debug?.motion ?? "-"}  steady: ${debug ? (debug.steady ? `yes ${debug.steadyMs}ms` : "no") : "-"}`,
              `rot ${debug?.rot.toFixed(1) ?? "-"} deg/s  acc ${debug?.acc.toFixed(2) ?? "-"} m/s2`,
              `checks: ${debug?.checks ?? 0}${debug?.inFlight ? " (in flight)" : ""}  dark skipped: ${debug?.darkSkipped ?? 0}  last: ${debug?.lastMs ?? 0}ms${
                debug?.lastAt ? `, ${Math.round((Date.now() - debug.lastAt) / 1000)}s ago` : ""
              }`,
              `result: ${debug?.last ?? "-"}`,
              `server: ${effectiveApiUrl(settings)}`,
            ].join("\n")}
          </Text>
        </View>
      ) : null}

      <ResultSheet
        visible={sheet === "result"}
        shot={shot}
        speaking={speaking}
        rate={settings.rate}
        reduceMotion={reduceMotion}
        recording={recording}
        transcribing={transcribing}
        canRecord={connection.features.transcribe !== false && Platform.OS !== "web"}
        canLookup={connection.features.lookup !== false}
        onClose={closeResult}
        onDismiss={() => {
          // iOS swipe-down: if the sheet went away without onRequestClose, close it properly now.
          if (sheetRef.current === "result") closeResult();
        }}
        onReplay={() => {
          const r = shot?.result;
          if (!r || !shot) return;
          const lastFollow = [...shot.followUps].reverse().find((f) => f.answer);
          speech.speak(lastFollow?.answer?.spokenText ?? r.spokenText, speakLang(shot));
        }}
        onStop={() => speech.stop()}
        onRate={(rate) => update({ rate })}
        onAsk={(q) => void ask(q)}
        onMic={() => void toggleMic("photo")}
        onRetry={retry}
        onLookup={() => shot && void runLookup(shot, false)}
      />
      <SettingsSheet
        visible={sheet === "settings"}
        settings={settings}
        connection={connection}
        voices={voices}
        speaking={speaking}
        historyOn={historyOn}
        onClearHistory={confirmClearHistory}
        hatStatus={hat ? hatCam.status : null}
        onConnectHat={(deviceId, pairCode) => {
          haptic.success();
          update({ hatDeviceId: deviceId, hatPairCode: pairCode, hatConnected: true });
          setSheet("none");
          if (live.current.screenReader) AccessibilityInfo.announceForAccessibility("Listening to your hat camera");
        }}
        onDisconnectHat={disconnectHat}
        onPreviewVoice={(v: Voice | null) => (v ? void speech.preview(v.id, v.previewUrl) : void speech.preview(""))}
        onStopPreview={() => speech.stop()}
        reduceMotion={reduceMotion}
        onChange={update}
        onCheck={() => void checkConnection()}
        onClose={() => setSheet("none")}
      />
      <RecentSheet
        askOn={askOn}
        ask={askState}
        onAsk={(q) => void runAsk(q)}
        onClearAsk={clearAsk}
        onOpenScanId={(id) => void openScanId(id)}
        canRecord={connection.features.transcribe !== false && Platform.OS !== "web"}
        recording={recording}
        transcribing={transcribing}
        onMic={() => void toggleMic("history")}
        visible={sheet === "recent"}
        scans={scans}
        loading={scansLoading}
        reduceMotion={reduceMotion}
        onOpen={openScan}
        onClose={() => setSheet("none")}
      />
      <LanguageSheet
        visible={sheet === "language"}
        language={settings.language}
        reduceMotion={reduceMotion}
        onPick={(language) => {
          haptic.tick();
          update({ language });
          setSheet("none");
        }}
        onClose={() => setSheet("none")}
      />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  permission: { backgroundColor: colors.bg, paddingHorizontal: 20, gap: 16 },
  top: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  debug: {
    position: "absolute",
    left: 12,
    right: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.94)",
  },
  debugText: { fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }), fontSize: 12, lineHeight: 17, color: colors.label },
  topRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  autoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.bg,
  },
  autoPillOn: { backgroundColor: colors.primary },
  wordmark: {
    flexShrink: 1,
    marginRight: 10,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: "center",
  },
  banner: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    minHeight: 44,
    maxWidth: "90%",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 14,
  },
  langRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
  },
  lastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    padding: 8,
    paddingRight: 14,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
  },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  scrimTop: { position: "absolute", top: 0, left: 0, right: 0 },
  scrimBottom: { position: "absolute", bottom: 0, left: 0, right: 0 },
  camTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  camTopText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700", letterSpacing: 1 },
  camBottom: { position: "absolute", left: 0, right: 0, bottom: 0, gap: 12, paddingHorizontal: 16 },
  camRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, marginTop: 4 },
  camMic: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  camMicOn: { backgroundColor: "#FFFFFF" },
  captionPill: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 18, borderRadius: 24 },
  statusPill: { minHeight: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: "center" },
  statusText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  mic: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  micOn: { backgroundColor: colors.primary },
  caption: {
    position: "absolute",
    left: 16,
    right: 16,
    alignItems: "center",
    gap: 10,
  },
  captionCard: {
    backgroundColor: colors.bg,
    borderRadius: radius.card,
    paddingHorizontal: 18,
    paddingVertical: 14,
    gap: 6,
    alignItems: "center",
    maxWidth: "100%",
  },
  captionQuote: { fontSize: 26, lineHeight: 32, fontWeight: "700", letterSpacing: -0.3, color: colors.label, textAlign: "center" },
  bars: { flexDirection: "row", alignItems: "flex-end", gap: 3, height: 18 },
  bar: { width: 4, borderRadius: 2, backgroundColor: colors.record },
  frozen: { width: 64, height: 64, borderRadius: 14, borderWidth: 2, borderColor: colors.bg },
  recDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.record },
  captureRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
});
