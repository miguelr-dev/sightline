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
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Alert, AppState, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, useSafeAreaInsets } from "react-native-safe-area-context";
import {
  analyze,
  clearHistory,
  frameCheck,
  getFeatures,
  getHistory,
  getVoices,
  lookup,
  setBaseUrl,
  setDeviceId,
  transcribe,
} from "./src/api";
import { ModeGrid } from "./src/components/ModeGrid";
import { RecentSheet } from "./src/components/RecentSheet";
import { ResultSheet } from "./src/components/ResultSheet";
import { LanguageSheet, SettingsSheet, type Connection } from "./src/components/SettingsSheet";
import { Icon, IconButton, PillButton } from "./src/components/ui";
import { demoState } from "./src/demo";
import { languageCode, MODE_HINTS, MODE_LABELS, UNKNOWN_FEATURES, type Mode, type Scan, type Voice } from "./src/modes";
import { effectiveApiUrl, loadSettings, saveSettings, type Settings } from "./src/settings";
import { speech } from "./src/speech";
import { colors, radius, type } from "./src/theme";
import type { Photo, Shot } from "./src/types";
import { useAutoCapture } from "./src/useAutoCapture";

// 1024 px at quality 0.6: in tests against the demo images this read exactly the same text as
// 0.7, and the upload is about 17% smaller. 896 px saved little more and risks small print.
const MAX_SIDE = 1024;
const JPEG_QUALITY = 0.6;
const FRAME_SIDE = 512;
const MAX_RECORD_MS = 12_000;
const QUIET_BEFORE_AUTO_MS = 600; // speech must have been stopped this long before an auto read
const demo = demoState(); // web screenshots only; null on iOS

// One resize + one JPEG encode. The camera already delivers a reduced-size frame (see pictureSize).
async function toJpeg(uri: string, width: number, height: number, maxSide = MAX_SIDE, compress = JPEG_QUALITY): Promise<Photo> {
  const ctx = ImageManipulator.manipulate(uri);
  if (Math.max(width, height) > maxSide) ctx.resize(width >= height ? { width: maxSide } : { height: maxSide });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  if (!out.base64) throw new Error("no image data");
  return { uri: out.uri, base64: out.base64, width: out.width, height: out.height };
}

// Smallest camera preset that still gives at least MAX_SIDE px on the short crop: capturing a
// 12 MP photo only to shrink it costs encode time on every shot.
function pickPictureSize(sizes: string[]): string | undefined {
  for (const want of ["1920x1080", "High", "3840x2160"]) if (sizes.includes(want)) return want;
  return undefined;
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
  const [shot, setShot] = useState<Shot | null>(demo?.shot ?? null);
  const [sheet, setSheetState] = useState<SheetName>(demo?.sheet ?? "none");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === "active");
  const [pictureSize, setPictureSize] = useState<string | undefined>();
  const [cameraReady, setCameraReady] = useState(false);
  const [hint, setHint] = useState<string | null>(demo?.hint ?? null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shotRef = useRef<Shot | null>(shot);
  const sheetRef = useRef<SheetName>(sheet);
  const busyRef = useRef(false);
  const nextId = useRef(1);
  // Bumped whenever a result is dismissed or replaced. Async work (answers, follow-ups, web
  // lookups) captures it when it starts and stays silent if it changed in the meantime.
  const speakToken = useRef(0);
  const quietSince = useRef(Date.now());
  const live = useRef({ settings, screenReader, connection });
  live.current = { settings, screenReader, connection };
  shotRef.current = shot;
  sheetRef.current = sheet;

  const mode = demo?.mode ?? settings.mode;

  // ---- setup -------------------------------------------------------------------------------
  useEffect(() => {
    void speech.init();
    const unsub = speech.subscribe((v) => {
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
    async (getPhoto: () => Promise<Photo | null>, opts: { auto?: boolean } = {}) => {
      if (busyRef.current) return;
      setBusyBoth(true);
      silence(); // a new read always cuts off the previous one
      setHint(null);
      if (opts.auto) haptic.tick();
      else haptic.capture();
      const id = nextId.current++;
      const { settings: s } = live.current;
      const fresh: Shot = { id, photo: null, mode: s.mode, language: s.language, followUps: [], web: { status: "idle" } };
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
  const autoEnabled =
    !demo &&
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
    takeFrame: async () => {
      const pic = await camera.current?.takePictureAsync({ quality: 0.4, shutterSound: false });
      if (!pic) return null;
      const small = await toJpeg(pic.uri, pic.width, pic.height, FRAME_SIDE, 0.5);
      return small.base64;
    },
    check: (image) => {
      const { settings: s } = live.current;
      return frameCheck({ image, mode: s.mode, ...(s.mode === "translate" ? { language: s.language } : {}) });
    },
    onReady: () => {
      // Never start over speech that's still winding down from a previous result.
      if (busyRef.current || sheetRef.current !== "none" || Date.now() - quietSince.current < QUIET_BEFORE_AUTO_MS) return;
      void start(capturePhoto(false), { auto: true });
    },
    onHint: (text) => {
      if (busyRef.current || sheetRef.current !== "none") return; // never over a result
      setHint(text);
      const { settings: s, screenReader: sr } = live.current;
      if (s.autoSpeak) speech.hint(text);
      else if (sr) AccessibilityInfo.announceForAccessibility(text);
    },
    onUnavailable: () => update({ autoCapture: false }), // older server: turn Auto off quietly
  });
  useEffect(() => {
    if (!autoEnabled && !demo) setHint(null);
  }, [autoEnabled]);

  // Full-quality frame for a read. The shutter sound is the cue on a manual tap; auto reads use
  // the haptic tick instead.
  function capturePhoto(shutter: boolean) {
    return async () => {
      await auto.idle(); // wait for any auto frame grab still using the camera
      const pic = await camera.current?.takePictureAsync({ quality: 0.7, shutterSound: shutter });
      if (!pic) throw new Error("camera not ready");
      return toJpeg(pic.uri, pic.width, pic.height);
    };
  }

  const capture = () => start(capturePhoto(true));

  const onCameraReady = async () => {
    setCameraReady(true);
    if (pictureSize) return;
    try {
      const sizes = (await camera.current?.getAvailablePictureSizesAsync()) ?? [];
      const pick = pickPictureSize(sizes);
      if (pick) setPictureSize(pick);
    } catch {
      // Keep the default preset.
    }
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
    void ask(text);
  };

  const toggleMic = async () => {
    if (recording) return stopRecording();
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      haptic.error();
      return say("Microphone access is off. You can turn it on in Settings, or type your question.");
    }
    speech.stop();
    try {
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
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
      if (!demo) {
        setHistoryOn(false); // route gone: hide the entry point
        setSheet("none");
      }
      return;
    }
    setScans(list);
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

  const closeResult = () => {
    if (recording) void stopRecording();
    setSheet("none");
  };

  const changeMode = (m: Mode) => {
    if (m === settings.mode) return;
    haptic.tick();
    update({ mode: m });
    if (live.current.screenReader) AccessibilityInfo.announceForAccessibility(`${MODE_LABELS[m]}. ${MODE_HINTS[m]}`);
  };

  const toggleAuto = () => {
    haptic.tick();
    const next = !settings.autoCapture;
    update({ autoCapture: next });
    if (live.current.screenReader) AccessibilityInfo.announceForAccessibility(next ? "Auto on" : "Auto off");
  };

  // ---- render -----------------------------------------------------------------------------------
  const camGranted = demo ? true : !!camPerm?.granted;
  const last = shot?.result && !shot.result.error ? shot : null;

  return (
    <View style={s.root}>
      <StatusBar style="light" />

      {/* Viewfinder: the hero. The whole area is also a capture target. */}
      <View style={StyleSheet.absoluteFill}>
        {demo ? (
          <Image source={demo.photo} style={StyleSheet.absoluteFill} contentFit="cover" />
        ) : camGranted ? (
          <CameraView
            ref={camera}
            style={StyleSheet.absoluteFill}
            facing="back"
            active={sheet === "none" && appActive}
            pictureSize={pictureSize}
            onCameraReady={() => void onCameraReady()}
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
      </View>
      {camGranted ? (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={capture}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Camera viewfinder"
          accessibilityHint={`Double-tap to capture in ${MODE_LABELS[mode]} mode`}
        />
      ) : null}

      {/* Top bar */}
      <View style={[s.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={s.wordmark} accessibilityRole="header">
          <Text style={[type.headline, { fontWeight: "700" }]} maxFontSizeMultiplier={1.6} numberOfLines={1}>
            SightLine
          </Text>
        </View>
        <View style={s.topRight}>
          <Pressable
            onPress={toggleAuto}
            accessibilityRole="switch"
            accessibilityLabel="Auto capture"
            accessibilityHint="Reads automatically when you hold the phone steady on something"
            accessibilityState={{ checked: settings.autoCapture }}
            hitSlop={4}
            style={({ pressed }) => [
              s.autoPill,
              settings.autoCapture && s.autoPillOn,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Icon
              sf={settings.autoCapture ? "sparkles" : "hand.tap"}
              ion={settings.autoCapture ? "sparkles" : "hand-left-outline"}
              size={16}
              color={settings.autoCapture ? colors.onPrimary : colors.label}
            />
            <Text
              style={[type.subhead, { fontWeight: "600", color: settings.autoCapture ? colors.onPrimary : colors.label }]}
              maxFontSizeMultiplier={1.6}
            >
              {settings.autoCapture ? "Auto on" : "Auto off"}
            </Text>
          </Pressable>
          {historyOn ? (
            <IconButton onPress={() => void openRecent()} label="Recent scans">
              <Icon sf="clock.arrow.circlepath" ion="time-outline" />
            </IconButton>
          ) : null}
          <IconButton onPress={() => setSheet("settings")} label="Settings">
            <Icon sf="gearshape" ion="settings-outline" />
          </IconButton>
        </View>
      </View>
      {hint && (connection.state !== "down" || demo) ? (
        <View style={[s.banner, { top: insets.top + 64 }]} accessible accessibilityLabel={hint}>
          <Icon sf="viewfinder" ion="scan-outline" size={18} />
          <Text style={[type.subhead, { color: colors.label, fontWeight: "600", flexShrink: 1 }]}>{hint}</Text>
        </View>
      ) : null}
      {connection.state === "down" && !demo ? (
        <Pressable
          onPress={() => setSheet("settings")}
          accessibilityRole="button"
          accessibilityLabel="Can't reach the SightLine server. Open settings."
          style={[s.banner, { top: insets.top + 64 }]}
        >
          <Icon sf="wifi.exclamationmark" ion="cloud-offline-outline" size={18} />
          <Text style={[type.subhead, { color: colors.label, fontWeight: "600", flexShrink: 1 }]}>
            Can't reach the server
          </Text>
        </Pressable>
      ) : null}

      {/* Bottom sheet: modes and the capture button */}
      <View style={[s.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <ModeGrid mode={mode} onChange={changeMode} />
        <Text style={type.subhead}>{MODE_HINTS[mode]}</Text>

        {mode === "translate" ? (
          <Pressable
            onPress={() => setSheet("language")}
            accessibilityRole="button"
            accessibilityLabel={`Translate to ${settings.language}`}
            accessibilityHint="Changes the language"
            style={({ pressed }) => [s.langRow, pressed && { backgroundColor: colors.surfacePressed }]}
          >
            <Text style={[type.body, { flex: 1 }]}>Translate to</Text>
            <Text style={[type.body, { fontWeight: "600" }]}>{settings.language}</Text>
            <Icon sf="chevron.right" ion="chevron-forward" size={15} color={colors.secondary} />
          </Pressable>
        ) : null}

        {last && sheet === "none" ? (
          <Pressable
            onPress={() => setSheet("result")}
            accessibilityRole="button"
            accessibilityLabel={`Last answer: ${last.result!.spokenText}`}
            accessibilityHint="Opens the answer"
            style={({ pressed }) => [s.lastRow, pressed && { backgroundColor: colors.surfacePressed }]}
          >
            {last.photo ? <Image source={{ uri: last.photo.uri }} style={s.thumb} contentFit="cover" /> : null}
            <Text style={[type.subhead, { flex: 1, color: colors.label }]} numberOfLines={2}>
              {last.result!.spokenText}
            </Text>
            <Icon sf="chevron.right" ion="chevron-forward" size={15} color={colors.secondary} />
          </Pressable>
        ) : null}

        <View style={s.captureRow}>
          <IconButton onPress={pickPhoto} label="Choose a photo" hint="Picks a photo from your library" filled="surface" size={64}>
            <Icon sf="photo.on.rectangle" ion="images-outline" size={26} />
          </IconButton>
          <PillButton
            big
            label={busy ? "Looking…" : "Capture"}
            busy={busy}
            disabled={!camGranted}
            onPress={capture}
            accessibilityLabel={busy ? "Looking" : `Capture, ${MODE_LABELS[mode]} mode`}
            icon={busy ? undefined : <Icon sf="camera.fill" ion="camera" size={24} color={colors.onPrimary} />}
            style={{ flex: 1 }}
          />
        </View>
      </View>

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
        onMic={() => void toggleMic()}
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
        onPreviewVoice={(v: Voice | null) => (v ? void speech.preview(v.id, v.previewUrl) : void speech.preview(""))}
        onStopPreview={() => speech.stop()}
        reduceMotion={reduceMotion}
        onChange={update}
        onCheck={() => void checkConnection()}
        onClose={() => setSheet("none")}
      />
      <RecentSheet
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
  captureRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
});
