import { randomUUID } from "expo-crypto";
import { File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import { DEFAULT_STRIP_MODE, type StripMode } from "./logic/modeStrip";

export type Settings = {
  apiUrl: string; // "" means use EXPO_PUBLIC_API_URL
  autoSpeak: boolean;
  naturalVoice: boolean; // ElevenLabs through /api/speak; off uses the on-device voice
  rate: number;
  mode: StripMode; // AUTO lets the server pick
  stripV2: boolean; // migrated to the AUTO-first mode strip
  language: string;
  autoCapture: boolean; // read automatically when the phone is held steady on something readable
  autoOffByServer: boolean; // Auto was switched off because the server lacked /api/frame-check
  voiceId: string; // "" = the server's default voice
  hatDeviceId: string; // hat camera hardware id
  hatPairCode: string;
  hatConnected: boolean; // listening to the hat camera instead of using the phone camera
  deviceId: string; // random, made once; sent as x-sightline-device so the server can keep history
};

export const ENV_API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");

export const DEFAULT_SETTINGS: Settings = {
  apiUrl: "",
  autoSpeak: true,
  naturalVoice: true,
  rate: 1,
  mode: DEFAULT_STRIP_MODE,
  stripV2: true,
  language: "Spanish",
  autoCapture: true,
  autoOffByServer: false,
  voiceId: "",
  hatDeviceId: "",
  hatPairCode: "",
  hatConnected: false,
  deviceId: "",
};

export const RATES = [0.75, 1, 1.25, 1.5];

export function normalizeUrl(url: string): string {
  let u = url.trim().replace(/\/+$/, "");
  if (u && !/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u;
}

export function effectiveApiUrl(s: Settings): string {
  return normalizeUrl(s.apiUrl) || ENV_API_URL;
}

const KEY = "sightline-settings.json";

function file(): File {
  return new File(Paths.document, KEY);
}

function newDeviceId(): string {
  try {
    return randomUUID();
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

export function loadSettings(): Settings {
  const s = readSettings();
  if (s.deviceId) return s;
  const withId = { ...s, deviceId: newDeviceId() };
  saveSettings(withId);
  return withId;
}

function readSettings(): Settings {
  try {
    const raw =
      Platform.OS === "web" ? globalThis.localStorage?.getItem(KEY) ?? "" : file().exists ? file().textSync() : "";
    if (!raw) return DEFAULT_SETTINGS;
    const saved = JSON.parse(raw) as Partial<Settings>;
    // Builds before autoOffByServer existed saved a plain "off" after a 404; treat that as a
    // server switch-off so it gets re-checked instead of sticking forever.
    const legacyOff = saved.autoCapture === false && saved.autoOffByServer === undefined;
    // The AUTO-first strip is new: start existing installs on AUTO once.
    const strip = saved.stripV2 ? {} : { mode: DEFAULT_STRIP_MODE, stripV2: true };
    return { ...DEFAULT_SETTINGS, ...saved, ...(legacyOff ? { autoOffByServer: true } : {}), ...strip };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(s: Settings) {
  try {
    const raw = JSON.stringify(s);
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, raw);
    else file().writeSync(raw);
  } catch {
    // Settings are a convenience; losing them is fine.
  }
}
