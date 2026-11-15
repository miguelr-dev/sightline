"use client";

import { useEffect, useId, useRef, useState } from "react";
import { MODE_LABELS, type AskResponse, type Features, type HistoryScan, type Mode, type Section, type Voice } from "@/lib/modes";
import { listenOnce, recognitionSupported, type Listener } from "@/lib/voice";

// Settings and Recent scans for the web app (/app), matching the iPhone app's sheets
// (mobile/src/components/SettingsSheet.tsx and RecentSheet.tsx): white page sheets with grouped
// grey cards, a Done button, and the same rows in the same order.

export const SPEEDS = [0.75, 1, 1.25, 1.5] as const;

const focus =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-black";
const caption = "px-4 text-[13px] font-semibold uppercase tracking-[0.04em] text-[#55555A]";
const footnote = "px-4 text-[13px] leading-snug text-[#55555A]";
const card = "overflow-hidden rounded-[14px] bg-[#F2F2F7]";
const row = "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left";
const rule = "mx-4 h-px bg-[#D1D1D6]";

/** A page sheet over the camera: Done at the top right, large title, scrolling content. */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-black/40" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex max-h-[94dvh] w-full max-w-2xl flex-col rounded-t-[28px] bg-white text-black shadow-[0_-10px_40px_rgba(0,0,0,0.35)]"
      >
        <div className="flex shrink-0 justify-end px-4 pt-3">
          <button type="button" onClick={onClose} className={`min-h-11 rounded-xl px-3 text-[17px] font-bold ${focus}`}>
            Done
          </button>
        </div>
        <div className="flex min-h-0 flex-col gap-6 overflow-y-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <h2 id={headingId} ref={heading} tabIndex={-1} className="text-[34px] font-bold leading-tight tracking-tight outline-none">
            {title}
          </h2>
          {children}
        </div>
      </section>
    </div>
  );
}

/** An iOS-style switch row. */
function SwitchRow({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  const hintId = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-describedby={hint ? hintId : undefined}
      onClick={() => onChange(!on)}
      className={`${row} ${focus} -outline-offset-4`}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[17px]">{label}</span>
        {hint && (
          <span id={hintId} className="text-[13px] leading-snug text-[#55555A]">
            {hint}
          </span>
        )}
      </span>
      <span aria-hidden="true" className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors motion-reduce:transition-none ${on ? "bg-black" : "bg-[#D1D1D6]"}`}>
        <span
          className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-[left] motion-reduce:transition-none ${on ? "left-[22px]" : "left-[2px]"}`}
        />
      </span>
    </button>
  );
}

function Group({ label, note, children }: { label: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className={caption}>{label}</h3>
      {children}
      {note && <p className={footnote}>{note}</p>}
    </div>
  );
}

const check = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4.5 12.5l5 5 10-11" />
  </svg>
);

export function SettingsSheet(props: {
  features: Features | null;
  detect: boolean;
  onDetect: (v: boolean) => void;
  autoSpeak: boolean;
  onAutoSpeak: (v: boolean) => void;
  natural: boolean;
  onNatural: (v: boolean) => void;
  rate: number;
  onRate: (r: number) => void;
  voices: Voice[] | null;
  voiceId: string;
  onVoice: (v: Voice | null) => void;
  speaking: boolean;
  onStopSample: () => void;
  onChoosePhoto: () => void;
  onClearHistory: () => Promise<boolean>;
  onClose: () => void;
}) {
  const { features } = props;
  const [clearing, setClearing] = useState<"idle" | "confirm" | "busy" | "done" | "failed">("idle");
  const elevenOff = features?.elevenlabs === false;

  return (
    <Sheet title="Settings" onClose={props.onClose}>
      <Group label="Camera">
        <div className={card}>
          <SwitchRow
            label="Detect"
            hint="Shows a card when the camera sees something to read. Nothing is read until you tap it."
            on={props.detect}
            onChange={props.onDetect}
          />
          <div className={rule} />
          <button type="button" onClick={props.onChoosePhoto} className={`${row} ${focus} -outline-offset-4 text-[17px]`}>
            <span className="flex-1">Choose a photo</span>
            <span aria-hidden="true" className="text-[#55555A]">›</span>
          </button>
        </div>
      </Group>


      <Group label="Speech">
        <div className={card}>
          <SwitchRow label="Auto-speak" hint="Read answers aloud as soon as they arrive." on={props.autoSpeak} onChange={props.onAutoSpeak} />
          <div className={rule} />
          <SwitchRow
            label="Natural voice"
            hint={elevenOff ? "Not set up on this server. Using this phone's voice." : "ElevenLabs voice. Off uses this phone's voice."}
            on={props.natural}
            onChange={props.onNatural}
          />
          <div className={rule} />
          <div role="group" aria-label="Speed" className="flex flex-col gap-2.5 px-4 py-3">
            <span className="text-[17px]">Speed</span>
            <div className="grid grid-cols-4 gap-1 rounded-[10px] bg-[#E5E5EA] p-0.5">
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={props.rate === s}
                  aria-label={`${s} times`}
                  onClick={() => props.onRate(s)}
                  className={`min-h-11 rounded-[8px] text-[15px] font-semibold ${focus} ${props.rate === s ? "bg-white shadow" : ""}`}
                >
                  {s}×
                </button>
              ))}
            </div>
          </div>
        </div>
      </Group>

      {props.voices && props.natural && !elevenOff && (
        <Group
          label="Voice"
          note={
            <span className="flex flex-wrap items-center gap-3">
              <span className="flex-1">Tap a voice to choose it and hear a sample.</span>
              {props.speaking && (
                <button type="button" onClick={props.onStopSample} className={`min-h-11 rounded-full bg-[#F2F2F7] px-4 text-[15px] font-semibold text-black ${focus}`}>
                  Stop sample
                </button>
              )}
            </span>
          }
        >
          <div className={card}>
            {[null, ...props.voices].map((v, i) => {
              const id = v?.id ?? "";
              const on = props.voiceId === id;
              const name = v?.name ?? "Default voice";
              return (
                <div key={id || "default"}>
                  {i > 0 && <div className={rule} />}
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => props.onVoice(v)}
                    className={`${row} ${focus} -outline-offset-4`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={`text-[17px] ${on ? "font-semibold" : ""}`}>{name}</span>
                      <span className="text-[13px] leading-snug text-[#55555A]">{v ? v.description : "The server's standard voice."}</span>
                    </span>
                    {on && check}
                  </button>
                </div>
              );
            })}
          </div>
        </Group>
      )}

      {features?.history && (
        <Group label="History" note="Recent scans are kept on the server for this browser only.">
          <div className={card}>
            {clearing === "confirm" ? (
              <div className="flex flex-col gap-3 px-4 py-3" role="alertdialog" aria-label="Clear history?">
                <p className="text-[17px] font-semibold">Clear history?</p>
                <p className="text-[15px] text-[#3A3A3C]">This removes your recent scans from the server.</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => setClearing("idle")}
                    className={`min-h-11 flex-1 rounded-full bg-white px-4 text-[17px] font-semibold ${focus}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      setClearing("busy");
                      setClearing((await props.onClearHistory()) ? "done" : "failed");
                    }}
                    className={`min-h-11 flex-1 rounded-full bg-[#D70015] px-4 text-[17px] font-semibold text-white ${focus}`}
                  >
                    Clear
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setClearing("confirm")}
                disabled={clearing === "busy"}
                className={`${row} ${focus} -outline-offset-4 text-[17px] font-semibold text-[#D70015]`}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
                </svg>
                <span className="flex-1">{clearing === "busy" ? "Clearing…" : "Clear history"}</span>
              </button>
            )}
          </div>
          <p aria-live="polite" className={footnote}>
            {clearing === "done" ? "History cleared." : clearing === "failed" ? "Couldn't clear history. Check the connection and try again." : ""}
          </p>
        </Group>
      )}
    </Sheet>
  );
}

// ---------- Recent scans ----------

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const GLYPH: Record<Mode, React.ReactNode> = {
  read: <path d="M4 6h16M4 10h16M4 14h10M4 18h12" />,
  describe: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  menu: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  translate: <path d="M4 5h9M8.5 3v2M6 5c.6 3.4 2.7 6 6 7.5M11 5c-.7 3.8-3.1 6.8-7 8.5M13 21l4-9 4 9M14.5 18h5" />,
};

function Thumb({ scan }: { scan: HistoryScan }) {
  if (scan.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- remote product photo from the web lookup
    return <img src={scan.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-[10px] bg-white object-cover" />;
  }
  return (
    <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[10px] bg-white">
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        {GLYPH[scan.mode] ?? GLYPH.describe}
      </svg>
    </span>
  );
}

type AskState = { status: "idle" } | { status: "loading"; question: string } | { status: "done"; question: string; answer: AskResponse };

export function RecentSheet(props: {
  features: Features | null;
  headers: () => Record<string, string>;
  onOpen: (scan: HistoryScan) => void;
  onAnswer: (text: string) => void; // speaks an Ask answer (when Auto-speak is on)
  onClose: () => void;
}) {
  const { features, headers } = props;
  const [scans, setScans] = useState<HistoryScan[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [ask, setAsk] = useState<AskState>({ status: "idle" });
  const [listening, setListening] = useState(false);
  const listener = useRef<Listener | null>(null);
  const canListen = typeof window !== "undefined" && recognitionSupported();

  useEffect(() => {
    if (!features?.history) {
      setLoading(false); // eslint-disable-line react-hooks/set-state-in-effect -- nothing to load
      return;
    }
    let alive = true;
    fetch("/api/history?limit=20", { headers: headers() })
      .then((r) => (r.ok ? (r.json() as Promise<{ scans?: HistoryScan[] }>) : null))
      .then((d) => alive && setScans(Array.isArray(d?.scans) ? d.scans : null))
      .catch(() => alive && setScans(null))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [features?.history, headers]);

  useEffect(() => () => listener.current?.stop(), []);

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || ask.status === "loading") return;
    setQ("");
    setAsk({ status: "loading", question });
    let answer: AskResponse;
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ question, language: "English", timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
        signal: AbortSignal.timeout(25_000),
      });
      answer = (await res.json()) as AskResponse;
      if (!res.ok) answer.error = true;
    } catch {
      answer = { spokenText: "Sorry, I couldn't reach your history just now.", error: true };
    }
    setAsk({ status: "done", question, answer });
    props.onAnswer(answer.spokenText);
  };

  const mic = () => {
    if (listener.current) {
      listener.current.stop();
      listener.current = null;
      setListening(false);
      return;
    }
    listener.current = listenOnce({
      onResult: (text) => void send(text),
      onError: () => {},
      onEnd: () => {
        listener.current = null;
        setListening(false);
      },
    });
    setListening(!!listener.current);
  };

  const openId = (id: string) => {
    const scan = scans?.find((s) => s.id === id);
    if (scan) props.onOpen(scan);
  };

  return (
    <Sheet title="Recent" onClose={props.onClose}>
      {features?.ask && (
        <div className="flex flex-col gap-3">
          <form
            className="flex items-center gap-2 rounded-[14px] bg-[#F2F2F7] py-1 pl-4 pr-1"
            onSubmit={(e) => {
              e.preventDefault();
              void send(q);
            }}
          >
            <label htmlFor="ask-history" className="sr-only">
              Ask about your scans
            </label>
            <input
              id="ask-history"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ask about your scans"
              autoComplete="off"
              disabled={ask.status === "loading"}
              className={`min-h-12 min-w-0 flex-1 bg-transparent text-[17px] placeholder:text-[#55555A] ${focus}`}
            />
            {q.trim() || !canListen ? (
              <button
                type="submit"
                aria-label="Ask"
                disabled={!q.trim() || ask.status === "loading"}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-white disabled:opacity-40 ${focus}`}
              >
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 19V5M6 11l6-6 6 6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={mic}
                aria-pressed={listening}
                aria-label={listening ? "Stop listening" : "Ask by voice"}
                className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${listening ? "bg-[#D70015] text-white" : "text-black"} ${focus}`}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="2.5" width="6" height="12" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
                </svg>
              </button>
            )}
          </form>
          {listening && <p className="text-[15px] font-semibold text-[#D70015]">Listening…</p>}
          <div aria-live="polite">
            {ask.status !== "idle" && (
              <div className="flex flex-col gap-2 rounded-[14px] bg-[#F2F2F7] p-4">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-[13px] font-semibold text-[#55555A]">{ask.question}</p>
                  {ask.status === "done" && (
                    <button type="button" onClick={() => setAsk({ status: "idle" })} aria-label="Close answer" className={`-m-2 h-11 w-11 shrink-0 rounded-full text-[20px] ${focus}`}>
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </div>
                {ask.status === "loading" ? (
                  <p className="flex items-center gap-3 text-[17px]">
                    <span aria-hidden="true" className="inline-block h-5 w-5 rounded-full border-[3px] border-black border-t-transparent motion-safe:animate-spin" />
                    Looking through your scans…
                  </p>
                ) : (
                  <>
                    <p className={`text-[20px] leading-snug ${ask.answer.error ? "font-semibold" : ""}`}>{ask.answer.spokenText}</p>
                    <AnswerSections sections={ask.answer.sections} />
                    {!!ask.answer.scans?.length && (
                      <div>
                        <p className="mb-0.5 text-[13px] font-semibold text-[#55555A]">From your scans</p>
                        {ask.answer.scans.map((sc) => (
                          <button
                            key={sc.id}
                            type="button"
                            onClick={() => openId(sc.id)}
                            className={`flex min-h-12 w-full flex-col items-start justify-center border-t border-[#D1D1D6] py-1 text-left ${focus}`}
                          >
                            <span className="text-[16px]">{sc.title ?? "Scan"}</span>
                            <span className="text-[13px] text-[#55555A]">{timeAgo(sc.createdAt)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <p className="flex items-center gap-3 text-[17px]">
          <span aria-hidden="true" className="inline-block h-5 w-5 rounded-full border-[3px] border-black border-t-transparent motion-safe:animate-spin" />
          Loading your scans…
        </p>
      ) : !features?.history ? (
        <p className="text-[17px] text-[#3A3A3C]">Scan history isn&apos;t set up on this server.</p>
      ) : scans === null ? (
        <p className="text-[17px] text-[#3A3A3C]">Couldn&apos;t load your scans. Check the connection and try again.</p>
      ) : scans.length === 0 ? (
        <p className="text-[17px] text-[#3A3A3C]">Nothing yet. Things you scan show up here.</p>
      ) : (
        <ul className={`${card} flex flex-col`}>
          {scans.map((scan, i) => {
            const when = timeAgo(scan.createdAt);
            const title = scan.title ?? scan.spokenText.split(/(?<=[.!?])\s/)[0];
            return (
              <li key={scan.id}>
                {i > 0 && <div className="ml-[84px] h-px bg-[#D1D1D6]" />}
                <button type="button" onClick={() => props.onOpen(scan)} className={`flex w-full items-center gap-3 px-3 py-2.5 text-left ${focus} -outline-offset-4`}>
                  <Thumb scan={scan} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="line-clamp-2 text-[17px] font-semibold leading-snug">{title}</span>
                    <span className="text-[13px] text-[#55555A]">
                      {MODE_LABELS[scan.mode] ?? "Scan"}
                      {when ? ` · ${when}` : ""}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-[#8E8E93]">›</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

function AnswerSections({ sections }: { sections?: Section[] }) {
  if (!sections?.length) return null;
  return (
    <div className="flex flex-col">
      {sections.map((s, i) => (
        <details key={`${i}-${s.title}`} className="group border-t border-[#D1D1D6]">
          <summary className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 text-[17px] font-semibold [&::-webkit-details-marker]:hidden ${focus}`}>
            {s.title}
            <span aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none">
              ⌄
            </span>
          </summary>
          <p className="whitespace-pre-wrap pb-3 text-[17px] leading-relaxed">{s.body}</p>
        </details>
      ))}
    </div>
  );
}
