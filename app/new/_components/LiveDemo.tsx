"use client";

import Image from "next/image";
import * as React from "react";
import { ChevronDown, Globe, Loader, Package, Square, Volume2 } from "lucide-react";

import { MODE_LABELS, type AnalyzeResponse, type Mode, type Section } from "@/lib/modes";
import { on } from "./demo-parts";

/* "Try a sample": sends a real sample photo to the same /api/analyze route the
   app uses, shows the answer, and plays it through /api/speak. When the server
   can't answer (no keys on a deployment, offline), it shows a saved answer for
   the same photo instead, and says so. */

type SampleId = "menu" | "can" | "sign";

type Sample = {
  id: SampleId;
  label: string;
  src: string;
  alt: string;
  ratio: [number, number];
  mode: "auto" | "translate";
  verb: string;
  saved: { spokenText: string; mode: Mode; sections: Section[] };
};

// Saved answers are what the live API said for these exact photos.
const SAMPLES: Sample[] = [
  {
    id: "menu",
    label: "Menu",
    src: "/new/retro-menu.webp",
    alt: "The Retro Family Restaurant menu: main course, salads and soups, rice and noodles, beverages, pizza and sides.",
    ratio: [900, 1164],
    mode: "auto",
    verb: "Reading the menu",
    saved: {
      spokenText:
        "Retro Family Restaurant menu: six sections, main course, rice and noodles, pizza, salads and soups, beverages, and sides, 1.99 to 16.49 dollars.",
      mode: "menu",
      sections: [
        {
          title: "Main Course",
          body: "Grilled Chicken Plate, $12.79. Tender grilled chicken served with vegetables and garlic rice.\nBeef Steak Classic, $16.49. Seared beef steak with pepper sauce and potato wedges.\nCreamy Alfredo Pasta, $11.29. Soft pasta in creamy alfredo sauce with parmesan.\nSweet & Sour Fish, $13.59. Crispy fish fillet in sweet-sour glaze.",
          provenance: "label",
        },
        {
          title: "Salads & Soups",
          body: "Garden Fresh Salad, $7.49. Crisp greens with tomatoes, cucumbers, and house dressing.\nGrilled Chicken Salad, $9.79. Fresh salad topped with grilled chicken slices.\nCreamy Mushroom Soup, $5.29. Warm, rich mushroom soup with toast.\nTomato Basil Soup, $4.99. Smooth tomato soup with a hint of basil.",
          provenance: "label",
        },
        {
          title: "Rice & Noodles",
          body: "Fried Rice Special, $9.29. Rice stir-fried with veggies, egg, and chicken.\nTeriyaki Rice Bowl, $10.49. Chicken in teriyaki sauce over warm rice.\nClassic Chow Mein, $8.99. Savory noodles with vegetables and chicken.\nBeef Black Pepper Rice, $11.79. Beef strips in black pepper sauce served with rice.",
          provenance: "label",
        },
        {
          title: "Beverages",
          body: "Iced Lemon Tea, $2.99. Refreshing sweet lemon tea.\nFresh Orange Juice, $3.79. Made from fresh oranges.\nMilkshake, $4.29. Vanilla, chocolate, or strawberry.\nCoffee or Hot Tea, $1.99. Simple and warm.",
          provenance: "label",
        },
      ],
    },
  },
  {
    id: "can",
    label: "Can",
    src: "/new/kirkland.webp",
    alt: "A hand holding an orange Kirkland Signature Sparkling Energy Drink can.",
    ratio: [640, 1130],
    mode: "auto",
    verb: "Reading the can",
    saved: {
      spokenText: "Kirkland Energy Drink, Orange. 200 milligrams of caffeine, zero sugar.",
      mode: "menu",
      sections: [],
    },
  },
  {
    id: "sign",
    label: "Sign",
    src: "/new/ciao-sign.webp",
    alt: "A red sandwich board: Open. Ciao! Hot pasta-to-go. Open daily, serving lunch and dinner, 11 AM to 9 PM.",
    ratio: [864, 1080],
    mode: "auto",
    verb: "Reading the sign",
    saved: {
      spokenText: "Ciao! sandwich board: open daily for lunch and dinner, 11 AM to 9 PM, hot pasta to go.",
      mode: "read",
      sections: [
        {
          title: "Full text",
          body: "OPEN\nCiao!\nHOT PASTA-TO-GO\nOPEN DAILY\nSERVING LUNCH & DINNER\n11AM - 9PM\n(03) 326 6180 654\nCIAOPASTA.COM",
          provenance: "label",
        },
      ],
    },
  },
];

type Result = {
  spokenText: string;
  mode?: Mode;
  sections: Section[];
  live: boolean;
};

const ANALYZE_TIMEOUT_MS = 30_000;
const MAX_SIDE = 768; // plenty to read a menu; keeps the request around 100 KB

// Kept for the page's lifetime, so a second tap costs nothing.
const results = new Map<SampleId, Result>();
const pending = new Map<SampleId, Promise<Result>>();
const clips = new Map<string, string>();

/** The sample photo as a small base64 JPEG, the format the API expects. */
async function photoAsJpeg(src: string): Promise<string> {
  const img = new window.Image();
  img.src = src;
  await img.decode();
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.82).split(",")[1] ?? "";
}

async function analyze(sample: Sample): Promise<Result> {
  const saved: Result = { ...sample.saved, live: false };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), ANALYZE_TIMEOUT_MS);
  try {
    const image = await photoAsJpeg(sample.src);
    const res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image,
        mode: sample.mode,
        ...(sample.mode === "translate" ? { language: "English" } : {}),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return saved;
    const data = (await res.json()) as AnalyzeResponse;
    if (data.error || !data.spokenText?.trim()) return saved;
    return {
      spokenText: data.spokenText.trim(),
      mode: data.interpreted?.mode ?? data.mode,
      sections: (data.sections ?? []).slice(0, 4),
      live: true,
    };
  } catch {
    return saved;
  } finally {
    window.clearTimeout(timer);
  }
}

function load(sample: Sample): Promise<Result> {
  const done = results.get(sample.id);
  if (done) return Promise.resolve(done);
  let job = pending.get(sample.id);
  if (!job) {
    job = analyze(sample).then((result) => {
      results.set(sample.id, result);
      pending.delete(sample.id);
      return result;
    });
    pending.set(sample.id, job);
  }
  return job;
}

/** ElevenLabs audio for a line, as an object URL, or null if the server can't speak. */
async function fetchClip(text: string): Promise<string | null> {
  const cached = clips.get(text);
  if (cached) return cached;
  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang: "en-US" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("audio")) return null;
    const blob = await res.blob();
    if (blob.size < 200) return null;
    const url = URL.createObjectURL(blob);
    clips.set(text, url);
    return url;
  } catch {
    return null;
  }
}

type Voice = "idle" | "loading" | "playing";

export function LiveDemo() {
  const [selected, setSelected] = React.useState<SampleId | null>(null);
  const [, setVersion] = React.useState(0);
  const [loading, setLoading] = React.useState<SampleId | null>(null);
  const [open, setOpen] = React.useState<number>(0);
  const [voice, setVoice] = React.useState<Voice>("idle");
  const [browserVoice, setBrowserVoice] = React.useState(false);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);
  const requestRef = React.useRef(0);

  const stopVoice = React.useCallback(() => {
    requestRef.current += 1;
    audioRef.current?.pause();
    audioRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setVoice("idle");
  }, []);

  React.useEffect(() => stopVoice, [stopVoice]);

  const pick = (sample: Sample) => {
    stopVoice();
    setSelected(sample.id);
    setOpen(0);
    if (results.has(sample.id)) return;
    setLoading(sample.id);
    void load(sample).then(() => {
      setLoading((current) => (current === sample.id ? null : current));
      setVersion((v) => v + 1);
    });
  };

  const sample = SAMPLES.find((s) => s.id === selected) ?? null;
  const result = selected ? results.get(selected) : undefined;
  const busy = !!sample && loading === sample.id && !result;

  const listen = async () => {
    if (!result) return;
    if (voice !== "idle") {
      stopVoice();
      return;
    }
    const request = ++requestRef.current;
    setVoice("loading");
    const url = await fetchClip(result.spokenText);
    if (request !== requestRef.current) return;
    if (url) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => {
        if (audioRef.current === audio) setVoice("idle");
      };
      setBrowserVoice(false);
      setVoice("playing");
      audio.play().catch(() => setVoice("idle"));
      return;
    }
    // No ElevenLabs on this server: use the browser's own voice.
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(result.spokenText);
      utterance.lang = "en-US";
      utterance.onend = () => {
        if (request === requestRef.current) setVoice("idle");
      };
      setBrowserVoice(true);
      setVoice("playing");
      window.speechSynthesis.speak(utterance);
    } else {
      setVoice("idle");
    }
  };

  return (
    <section id="try" aria-labelledby="try-h" className="scroll-mt-16 px-4 py-14 sm:px-6 sm:py-20">
      <div className="try-panel">
        <div className="try-copy">
          <p className="eyebrow">Live demo</p>
          <h2 id="try-h" className="h2">
            Try it on a real photo.
          </h2>
          <p className="lede">
            Pick a sample. It goes to the same API the app uses, and the answer comes back ready to hear.
          </p>
          <div className="try-picks" role="group" aria-label="Try a sample">
            <span className="try-picks-l" aria-hidden>
              Try a sample
            </span>
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className="try-pick"
                aria-pressed={selected === s.id}
                onClick={() => pick(s)}
              >
                <span className="try-pick-img">
                  <Image src={s.src} alt="" fill sizes="32px" />
                </span>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="try-result">
          {!sample ? (
            <div className="try-empty">
              <div className="try-fan" aria-hidden>
                {SAMPLES.map((s) => (
                  <span key={s.id}>
                    <Image src={s.src} alt="" fill sizes="140px" />
                  </span>
                ))}
              </div>
              <p>Pick a sample to hear SightLine read it.</p>
            </div>
          ) : (
            <div className="try-card">
              <div className="try-photo" data-busy={on(busy)}>
                <Image
                  key={sample.id}
                  src={sample.src}
                  alt={sample.alt}
                  fill
                  sizes="(max-width: 768px) 40vw, 200px"
                />
                <span className="try-brk" aria-hidden>
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="try-answer" aria-live="polite" aria-busy={busy}>
                <div className="try-meta">
                  <span>{busy ? `${sample.verb}…` : result?.mode ? MODE_LABELS[result.mode] : sample.label}</span>
                  {result && (
                    <span className={result.live ? "try-tag try-tag-live" : "try-tag"}>
                      {result.live ? "Live answer" : "Saved answer"}
                    </span>
                  )}
                </div>
                {busy || !result ? (
                  <div className="try-skel" aria-hidden>
                    <i />
                    <i />
                    <i />
                  </div>
                ) : (
                  <>
                    <p className="try-say">{result.spokenText}</p>
                    <button type="button" className="pill pill-dark try-listen" onClick={() => void listen()}>
                      {voice === "loading" ? (
                        <Loader className="size-[18px] animate-spin" strokeWidth={2.4} aria-hidden />
                      ) : voice === "playing" ? (
                        <Square className="size-4" fill="currentColor" strokeWidth={0} aria-hidden />
                      ) : (
                        <Volume2 className="size-[18px]" strokeWidth={2.4} aria-hidden />
                      )}
                      {voice === "playing" ? "Stop" : "Listen"}
                    </button>
                    {voice === "playing" && browserVoice && (
                      <p className="try-note">Using your browser’s voice. ElevenLabs needs the server.</p>
                    )}
                    {result.sections.length > 0 && (
                      <div className="try-rows">
                        {result.sections.map((section, i) => {
                          const expanded = open === i;
                          const id = `try-${sample.id}-${i}`;
                          return (
                            <div key={section.title + i} className="try-row" data-on={on(expanded)}>
                              <button
                                type="button"
                                aria-expanded={expanded}
                                aria-controls={id}
                                onClick={() => setOpen(expanded ? -1 : i)}
                              >
                                <span>{section.title}</span>
                                {section.provenance && (
                                  <span className="g-src">
                                    {section.provenance === "web" ? (
                                      <Globe strokeWidth={2.2} aria-hidden />
                                    ) : (
                                      <Package strokeWidth={2.2} aria-hidden />
                                    )}
                                    {section.provenance === "web" ? "Online" : "In the photo"}
                                  </span>
                                )}
                                <ChevronDown className="g-chev" strokeWidth={2.4} aria-hidden />
                              </button>
                              <div id={id} className="try-row-b" hidden={!expanded}>
                                <div>
                                  <p>{section.body}</p>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!result.live && (
                      <p className="try-note">
                        Live demo needs the server, so this is a saved answer for the same photo.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
