"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Chrome stops long utterances after ~15 seconds, so speak in sentence-sized chunks.
function chunk(text: string, max = 180): string[] {
  const sentences = text.replace(/\s+/g, " ").match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text];
  const out: string[] = [];
  let cur = "";
  for (const s of sentences) {
    if ((cur + s).length > max && cur) {
      out.push(cur.trim());
      cur = "";
    }
    if (s.length > max) {
      // Very long sentence: split on commas or spaces.
      const words = s.split(/(?<=,)\s+|\s+/);
      for (const w of words) {
        if ((cur + " " + w).length > max && cur) {
          out.push(cur.trim());
          cur = "";
        }
        cur += (cur ? " " : "") + w;
      }
    } else {
      cur += s;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  const exact = voices.filter((v) => v.lang.toLowerCase() === lang.toLowerCase());
  const prefix = lang.split("-")[0].toLowerCase();
  const family = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const pool = exact.length ? exact : family;
  return pool.find((v) => v.localService) ?? pool[0];
}

export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const rateRef = useRef(1);
  const runId = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    // Voices load asynchronously in some browsers; touching them starts the load.
    window.speechSynthesis.getVoices();
    const onVoices = () => window.speechSynthesis.getVoices();
    window.speechSynthesis.addEventListener?.("voiceschanged", onVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.("voiceschanged", onVoices);
      window.speechSynthesis.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (!("speechSynthesis" in window)) return;
    runId.current++;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string, lang = "en-US") => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text) return;
    const synth = window.speechSynthesis;
    const id = ++runId.current;
    synth.cancel();
    const parts = chunk(text);
    const voice = pickVoice(lang);
    setSpeaking(true);
    parts.forEach((part, i) => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = lang;
      if (voice) u.voice = voice;
      u.rate = rateRef.current;
      if (i === parts.length - 1) {
        u.onend = () => {
          if (runId.current === id) setSpeaking(false);
        };
      }
      u.onerror = () => {
        if (runId.current === id) setSpeaking(false);
      };
      synth.speak(u);
    });
  }, []);

  const setRate = useCallback((rate: number) => {
    rateRef.current = rate;
  }, []);

  return { speaking, speak, stop, setRate };
}
