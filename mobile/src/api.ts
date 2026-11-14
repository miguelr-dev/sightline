import { fetch } from "expo/fetch";
import { File, Paths, UploadType } from "expo-file-system";
import type { AnalyzeResponse, DeviceEvent, Features, FrameCheck, ItemKind, LookupResponse, Mode, Scan, Voice } from "./modes";
import { cleanSections, httpsUrl, MODES, UNKNOWN_FEATURES } from "./modes";

// Every call goes to the SightLine Next.js server. No API keys live in the app.

let baseUrl = "";
export function setBaseUrl(url: string) {
  baseUrl = url;
}
export function getBaseUrl() {
  return baseUrl;
}

// Tunnels (ngrok, localtunnel) show an interstitial page to "browsers" unless these are sent.
const TUNNEL_HEADERS = { "ngrok-skip-browser-warning": "1", "bypass-tunnel-reminder": "1" };

let deviceId = "";
export function setDeviceId(id: string) {
  deviceId = id;
}
// Sent on every request: tunnel bypass plus the anonymous device id the server keys history on.
function baseHeaders(): Record<string, string> {
  return deviceId ? { ...TUNNEL_HEADERS, "x-sightline-device": deviceId } : { ...TUNNEL_HEADERS };
}

const NO_SERVER =
  "I can't reach the SightLine server. Check the server address in Settings, then try again.";

type Result<T> = { ok: boolean; status: number; data: T | null };

async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<Result<T>> {
  if (!baseUrl) return { ok: false, status: 0, data: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...baseHeaders() },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: T | null = null;
    try {
      data = (await res.json()) as T;
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: controller.signal.aborted ? -1 : 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function getFeatures(): Promise<{ reachable: boolean; features: Features }> {
  if (!baseUrl) return { reachable: false, features: UNKNOWN_FEATURES };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`${baseUrl}/api/features`, { headers: baseHeaders(), signal: controller.signal });
    if (!res.ok) return { reachable: true, features: UNKNOWN_FEATURES }; // older server without the route
    const f = (await res.json()) as Partial<Record<keyof Features, unknown>>;
    return {
      reachable: true,
      features: {
        elevenlabs: typeof f.elevenlabs === "boolean" ? f.elevenlabs : null,
        transcribe: typeof f.transcribe === "boolean" ? f.transcribe : null,
        lookup: typeof f.lookup === "boolean" ? f.lookup : null,
        history: typeof f.history === "boolean" ? f.history : null,
      },
    };
  } catch {
    return { reachable: false, features: UNKNOWN_FEATURES };
  } finally {
    clearTimeout(timer);
  }
}

export async function analyze(req: {
  image: string;
  mode: Mode;
  language?: string;
  question?: string;
}): Promise<AnalyzeResponse> {
  const r = await postJson<AnalyzeResponse>("/api/analyze", req, 55_000);
  if (r.data && typeof r.data.spokenText === "string") {
    const data = {
      ...r.data,
      sections: cleanSections(r.data.sections),
      scanId: typeof r.data.scanId === "string" && r.data.scanId ? r.data.scanId : undefined,
    };
    return r.ok ? data : { ...data, error: true };
  }
  if (r.status === -1) {
    return { spokenText: "That took too long, so I stopped. Please try again.", details: "", error: true };
  }
  return { spokenText: NO_SERVER, details: "", error: true };
}

// Resolves null when the route is missing (404) or lookup isn't configured, so the card hides.
export async function lookup(req: {
  query: string;
  itemKind?: ItemKind;
  scanId?: string;
  context: { mode: Mode; spokenText: string; details: string };
}): Promise<LookupResponse | null> {
  const r = await postJson<LookupResponse>("/api/lookup", req, 25_000);
  if (r.status === 404 || r.status === 405) return null;
  if (r.data && typeof r.data.spokenText === "string") {
    const sources = Array.isArray(r.data.sources)
      ? r.data.sources
          .filter((x) => x && typeof x.url === "string" && typeof x.title === "string")
          .map((x) => ({ title: x.title, url: x.url, thumbnail: httpsUrl(x.thumbnail) }))
      : [];
    return {
      ...r.data,
      sources,
      image: httpsUrl(r.data.image),
      sections: cleanSections(r.data.sections),
      cached: r.data.cached === true,
      error: r.data.error || !r.ok,
    };
  }
  return {
    spokenText:
      r.status === -1 ? "The web lookup took too long, so I stopped it." : "I couldn't reach the web just now.",
    details: "",
    query: req.query,
    sources: [],
    error: true,
  };
}

// ElevenLabs text-to-speech. Writes the MP3 to the cache folder and returns its file URI,
// or null on any failure so the caller can fall back to the on-device voice.
let clipCounter = 0;
export async function speakClip(
  body: { text: string; lang: string; previousText: string; nextText: string; voiceId?: string },
  timeoutMs = 9000,
): Promise<{ uri: string | null; status: number }> {
  if (!baseUrl) return { uri: null, status: 0 };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/speak`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg", ...baseHeaders() },
      body: JSON.stringify(body.voiceId ? body : { ...body, voiceId: undefined }),
      signal: controller.signal,
    });
    if (!res.ok) return { uri: null, status: res.status };
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("audio")) return { uri: null, status: res.status };
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 200) return { uri: null, status: res.status };
    const f = new File(Paths.cache, `speak-${Date.now()}-${clipCounter++}.mp3`);
    await f.write(new Uint8Array(buf));
    return { uri: f.uri, status: res.status };
  } catch {
    return { uri: null, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

// ElevenLabs speech-to-text. Uploads the raw m4a recording as the request body.
export async function transcribe(fileUri: string): Promise<{ text: string; status: number }> {
  if (!baseUrl) return { text: "", status: 0 };
  try {
    const f = new File(fileUri);
    const res = await f.upload(`${baseUrl}/api/transcribe`, {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: "audio/mp4",
      headers: { "Content-Type": "audio/mp4", ...baseHeaders() },
    });
    let text = "";
    try {
      const data = JSON.parse(res.body) as { text?: unknown };
      text = typeof data.text === "string" ? data.text.trim() : "";
    } catch {
      text = "";
    }
    return { text, status: res.status };
  } catch {
    return { text: "", status: 0 };
  }
}

// Auto-capture: is the camera on something worth reading? status 404 = route missing.
export async function frameCheck(req: {
  image: string;
  mode: Mode;
  language?: string;
}): Promise<{ status: number; data: FrameCheck | null }> {
  const r = await postJson<FrameCheck>("/api/frame-check", req, 6000);
  if (!r.ok || !r.data || typeof r.data.ready !== "boolean") return { status: r.status, data: null };
  return {
    status: r.status,
    data: {
      ready: r.data.ready,
      key: typeof r.data.key === "string" && r.data.key.trim() ? r.data.key.trim() : undefined,
      hint: typeof r.data.hint === "string" && r.data.hint.trim() ? r.data.hint.trim() : undefined,
      detected: r.data.detected === true,
      label: typeof r.data.label === "string" && r.data.label.trim() ? r.data.label.trim() : undefined,
      suggestedMode: typeof r.data.suggestedMode === "string" ? r.data.suggestedMode : undefined,
      confidence:
        typeof r.data.confidence === "number" && Number.isFinite(r.data.confidence) ? r.data.confidence : undefined,
    },
  };
}

// ElevenLabs voices the server offers. null = route missing or failing, so the picker hides.
export async function getVoices(): Promise<Voice[] | null> {
  if (!baseUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/api/voices`, { headers: baseHeaders(), signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { voices?: unknown };
    if (!Array.isArray(data.voices)) return null;
    const voices = data.voices
      .filter((v): v is Voice => !!v && typeof v.id === "string" && typeof v.name === "string")
      .map((v) => ({
        id: v.id,
        name: v.name,
        description: typeof v.description === "string" && v.description.trim() ? v.description.trim() : undefined,
        previewUrl: httpsUrl(v.previewUrl),
      }));
    return voices.length ? voices : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseLookup(v: unknown): LookupResponse | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Partial<LookupResponse>;
  if (typeof l.spokenText !== "string" || !l.spokenText.trim()) return null;
  return {
    spokenText: l.spokenText,
    details: typeof l.details === "string" ? l.details : "",
    query: typeof l.query === "string" ? l.query : "",
    itemKind: l.itemKind,
    image: httpsUrl(l.image),
    sections: cleanSections(l.sections),
    sources: Array.isArray(l.sources)
      ? l.sources
          .filter((x) => x && typeof x.url === "string" && typeof x.title === "string")
          .map((x) => ({ title: x.title, url: x.url, thumbnail: httpsUrl(x.thumbnail) }))
      : [],
    error: l.error === true,
  };
}

// Recent scans for this device. null = history isn't available on this server (404, off, down).
export async function getHistory(limit = 20): Promise<Scan[] | null> {
  if (!baseUrl) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${baseUrl}/api/history?limit=${limit}`, { headers: baseHeaders(), signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { scans?: unknown };
    if (!Array.isArray(data.scans)) return null;
    return data.scans
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .filter((x) => (typeof x.id === "string" || typeof x.id === "number") && typeof x.spokenText === "string")
      .map((x) => {
        const lk = parseLookup(x.lookup);
        return {
          id: String(x.id),
          createdAt: typeof x.createdAt === "string" ? x.createdAt : "",
          mode: MODES.includes(x.mode as Mode) ? (x.mode as Mode) : "describe",
          itemKind: typeof x.itemKind === "string" ? (x.itemKind as ItemKind) : undefined,
          title: typeof x.title === "string" && x.title.trim() ? x.title.trim() : (x.spokenText as string).slice(0, 60),
          spokenText: x.spokenText as string,
          sections: cleanSections(x.sections),
          lookup: lk,
          image: httpsUrl(x.image) ?? lk?.image,
        };
      });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function clearHistory(): Promise<boolean> {
  if (!baseUrl) return false;
  try {
    const res = await fetch(`${baseUrl}/api/history`, { method: "DELETE", headers: baseHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

/** True when /api/frame-check exists (any status but 404/405, even a 400 for an empty body). */
export async function frameCheckExists(): Promise<boolean> {
  const r = await postJson<unknown>("/api/frame-check", {}, 6000);
  return r.status > 0 && r.status !== 404 && r.status !== 405;
}

// Hat camera events newer than `after`. 404/503 = not set up on this server, 401/403 = bad pair
// code, 400 = invalid device ID.
export async function deviceNext(
  hardwareId: string,
  pairCode: string,
  after: string,
): Promise<{ status: number; events: DeviceEvent[] }> {
  if (!baseUrl) return { status: 0, events: [] };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // The pair code goes in the query (what the server reads) and the x-pair-code header.
    const q = `device=${encodeURIComponent(hardwareId)}&pair=${encodeURIComponent(pairCode)}${
      after ? `&after=${encodeURIComponent(after)}` : ""
    }`;
    const res = await fetch(`${baseUrl}/api/device/next?${q}`, {
      headers: { ...baseHeaders(), "x-pair-code": pairCode },
      signal: controller.signal,
    });
    if (!res.ok) return { status: res.status, events: [] };
    const data = (await res.json()) as { events?: unknown };
    const events = Array.isArray(data.events)
      ? data.events
          .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
          .filter((e) => (typeof e.id === "string" || typeof e.id === "number") && typeof e.kind === "string")
          .filter((e) => e.kind === "detected" || e.kind === "answer" || e.kind === "hint")
          .map((e) => ({
            id: String(e.id),
            createdAt: typeof e.createdAt === "string" ? e.createdAt : "",
            kind: e.kind as DeviceEvent["kind"],
            payload: e.payload && typeof e.payload === "object" ? (e.payload as Record<string, unknown>) : {},
          }))
      : [];
    return { status: res.status, events };
  } catch {
    return { status: 0, events: [] };
  } finally {
    clearTimeout(timer);
  }
}

/** Parse an "answer" event payload (an AnalyzeResponse plus scanId and maybe lookup data). */
export function parseDeviceAnswer(p: Record<string, unknown>): {
  answer: AnalyzeResponse | null;
  lookup: LookupResponse | null;
  image?: string;
  scanId?: string;
} {
  const scanId = typeof p.scanId === "string" || typeof p.scanId === "number" ? String(p.scanId) : undefined;
  const spoken = typeof p.spokenText === "string" ? p.spokenText.trim() : "";
  const answer: AnalyzeResponse | null = spoken
    ? {
        spokenText: spoken,
        details: typeof p.details === "string" ? p.details : "",
        sections: cleanSections(p.sections),
        itemKind: typeof p.itemKind === "string" ? (p.itemKind as ItemKind) : undefined,
        webQuery: typeof p.webQuery === "string" ? p.webQuery : undefined,
        scanId,
        error: p.error === true,
      }
    : null;
  return { answer, lookup: parseLookup(p.lookup), image: httpsUrl(p.image), scanId };
}
