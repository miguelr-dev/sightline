"use client";

// The first screen of /app (what the QR code opens). Dark like the marketing site and the camera,
// set in the site's display face, with one decision: whether SightLine speaks its answers. The same
// switch is Settings > Auto-speak, so the choice can be changed at any time.

const display = { fontFamily: "var(--font-display), system-ui, sans-serif" };
const focusRing =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[#5CE1FF]";

function Mark() {
  return (
    <svg width={30} height={30} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect x="1" y="1" width="30" height="30" rx="8" fill="#fff" />
      <ellipse cx="16" cy="16" rx="11" ry="6.8" fill="none" stroke="#000" strokeWidth="2.6" />
      <circle cx="16" cy="16" r="3.6" fill="#000" />
    </svg>
  );
}

const speakerIcon = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9.5h3L12 5v14l-5-4.5H4z" />
    <path d="M16 9a4.2 4.2 0 0 1 0 6M18.8 6.5a8 8 0 0 1 0 11" />
  </svg>
);
const textIcon = (
  <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    <path d="M7 9.5h10M7 13h10M7 16.5h6" />
  </svg>
);

const OPTIONS = [
  { value: true, title: "With voice", body: "Answers are read aloud.", icon: speakerIcon },
  { value: false, title: "Without voice", body: "Answers show on screen only. Good with VoiceOver.", icon: textIcon },
];

export function StartScreen({ voice, onVoice, onStart }: { voice: boolean; onVoice: (v: boolean) => void; onStart: () => void }) {
  return (
    <main className="min-h-dvh bg-black text-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-[460px] flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))]">
        <header className="flex items-center gap-2.5">
          <Mark />
          <span style={display} className="text-[19px] font-bold tracking-[-0.02em]">
            SightLine
          </span>
        </header>

        <div className="flex flex-1 flex-col justify-center gap-9 py-10">
          <div className="flex flex-col gap-4">
            <h1 style={display} className="text-[min(10vw,46px)] font-bold leading-[0.98] tracking-[-0.045em]">
              Point your camera.
              <br />
              <span className="text-[#8A8A8E]">Hear the world.</span>
            </h1>
            <p className="max-w-[34ch] text-[18px] leading-[1.5] text-[#B8B8B8]">
              Reads text, describes what&apos;s in front of you, and translates signs and menus.
            </p>
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend style={display} className="mb-3 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8A8A8E]">
              Spoken answers
            </legend>
            {OPTIONS.map((o) => {
              const on = voice === o.value;
              return (
                <label
                  key={o.title}
                  className={`relative flex min-h-[76px] cursor-pointer items-center gap-4 rounded-[20px] border px-4 py-3.5 transition-colors motion-reduce:transition-none has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-[3px] has-[:focus-visible]:outline-[#5CE1FF] ${
                    on ? "border-white bg-[#141414]" : "border-[#2A2A2A] bg-[#0A0A0A] hover:border-[#5A5A5A]"
                  }`}
                >
                  <input type="radio" name="voice" checked={on} onChange={() => onVoice(o.value)} className="sr-only" />
                  <span
                    aria-hidden="true"
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${on ? "bg-white text-black" : "bg-[#1C1C1E] text-white"}`}
                  >
                    {o.icon}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span style={display} className="text-[18px] font-semibold tracking-[-0.01em]">
                      {o.title}
                    </span>
                    <span className="text-[15px] leading-snug text-[#B8B8B8]">{o.body}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-white bg-white" : "border-[#5A5A5A]"}`}
                  >
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-black" />}
                  </span>
                </label>
              );
            })}
            <p className="px-1 text-[14px] text-[#8A8A8E]">You can change this any time in Settings.</p>
          </fieldset>
        </div>

        <footer className="flex flex-col gap-4">
          <button
            type="button"
            onClick={onStart}
            style={display}
            className={`flex min-h-14 items-center justify-center gap-2 rounded-full bg-white px-6 text-[18px] font-semibold text-black transition-transform active:scale-[0.98] motion-reduce:transition-none ${focusRing}`}
          >
            Start
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
          <p className="text-center text-[14px] leading-relaxed text-[#8A8A8E]">
            Uses your camera. Photos are never saved.{" "}
            <a href="/privacy" className={`whitespace-nowrap text-[#D1D1D6] underline underline-offset-2 ${focusRing} rounded-sm`}>
              Privacy
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
