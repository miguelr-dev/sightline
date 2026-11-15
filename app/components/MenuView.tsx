"use client";

import { useMemo, useState } from "react";
import type { Menu, MenuItem } from "@/lib/modes";
import { applyMenuFilter, filterAnnouncement, itemLabel, itemSpeech, menuCurrency, menuFilters, sectionReadQueue, TAG_LABELS, type MenuFilter } from "@/lib/menuView";

// A menu in the answer sheet, as in the iPhone app (mobile/src/components/MenuView.tsx): chips that
// jump to each section, quick filters the menu can actually answer, and one row per dish. Tap a dish
// to hear it; Ask starts a question about it. Each heading can read its dishes in order, names and
// prices only. Logic: lib/menuView.ts.

const focus =
  "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-black";

export function MenuView({
  menu,
  lang,
  speak,
  stop,
  speaking,
  onAskDish,
}: {
  menu: Menu;
  lang: string;
  speak: (text: string, lang: string, opts?: { queue?: boolean }) => void;
  stop: () => void;
  speaking: boolean;
  onAskDish: (name: string) => void;
}) {
  const [filter, setFilter] = useState<MenuFilter | null>(null);
  const [reading, setReading] = useState<string | null>(null); // the dish row or section being read
  const [note, setNote] = useState(""); // screen reader announcement for a filter change
  const currency = useMemo(() => menuCurrency(menu), [menu]);
  const filters = useMemo(() => menuFilters(menu), [menu]);
  const shown = useMemo(() => applyMenuFilter(menu, filter), [menu, filter]);
  const active = speaking ? reading : null;

  const pickFilter = (f: MenuFilter) => {
    const next = filter === f ? null : f;
    setFilter(next);
    const count = applyMenuFilter(menu, next).reduce((n, s) => n + s.items.length, 0);
    setNote(filterAnnouncement(count, next, currency));
  };
  const speakItem = (item: MenuItem, id: string) => {
    if (active === id) return stop(); // tapping the dish being read stops it
    setReading(id);
    speak(itemSpeech(item, currency), lang);
  };
  const readSection = (index: number) => {
    const id = `section-${index}`;
    if (active === id) return stop();
    const sec = shown.find((s) => s.index === index);
    if (!sec) return;
    setReading(id);
    sectionReadQueue(sec, "m", currency).forEach((line, i) => speak(line.text, lang, i ? { queue: true } : undefined));
  };

  return (
    <div className="flex flex-col gap-4">
      <p aria-live="polite" className="sr-only">
        {note}
      </p>
      {shown.length > 1 && (
        <nav aria-label="Menu sections" className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2">
            {shown.map((sec) => (
              <a key={sec.index} href={`#menu-sec-${sec.index}`} className={`inline-flex min-h-11 items-center rounded-full bg-[#F2F2F7] px-4 text-[15px] font-semibold ${focus}`}>
                {sec.title}
              </a>
            ))}
          </div>
        </nav>
      )}
      {filters.length > 0 && (
        <div role="group" aria-label="Filter dishes" className="flex flex-wrap gap-2">
          {filters.map((f) => {
            const on = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={on}
                onClick={() => pickFilter(f.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold ${focus} ${on ? "bg-black text-white" : "border border-[#D1D1D6] text-black"}`}
              >
                <span aria-hidden="true">{on ? "✓" : "≡"}</span>
                {f.label}
              </button>
            );
          })}
        </div>
      )}
      {shown.map((sec) => {
        const secId = `section-${sec.index}`;
        return (
          <section key={sec.index} id={`menu-sec-${sec.index}`} aria-labelledby={`menu-h-${sec.index}`} className="flex scroll-mt-4 flex-col gap-2">
            <div className="flex items-center gap-3">
              <h3 id={`menu-h-${sec.index}`} className="flex-1 text-[20px] font-bold">
                {sec.title}
              </h3>
              <button
                type="button"
                onClick={() => readSection(sec.index)}
                aria-label={active === secId ? `Stop reading ${sec.title}` : `Read ${sec.title}`}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full bg-[#F2F2F7] px-3 text-[15px] font-semibold ${focus}`}
              >
                <span aria-hidden="true">{active === secId ? "■" : "▶"}</span>
                {active === secId ? "Stop" : "Read this section"}
              </button>
            </div>
            <ul className="overflow-hidden rounded-[14px] bg-[#F2F2F7]">
              {sec.items.map(({ item, index }, k) => {
                const id = `dish-${sec.index}-${index}`;
                return (
                  <li key={id} className={k ? "border-t border-[#D1D1D6]" : ""}>
                    <div className={`flex items-start gap-2 px-3 py-2 ${active === id ? "bg-[#E5E5EA]" : ""}`}>
                      <button
                        type="button"
                        onClick={() => speakItem(item, id)}
                        aria-label={itemLabel(item, sec.title)}
                        className={`flex min-h-12 min-w-0 flex-1 flex-col items-stretch justify-center rounded-lg text-left ${focus}`}
                      >
                        <span className="flex items-baseline gap-3">
                          <span className="min-w-0 flex-1 text-[17px] font-semibold leading-snug">{item.name}</span>
                          {item.price && <span className="shrink-0 text-[17px] font-semibold tabular-nums">{item.price}</span>}
                        </span>
                        {item.description && <span className="text-[15px] leading-snug text-[#3A3A3C]">{item.description}</span>}
                        {!!item.tags?.length && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {item.tags.map((t) => (
                              <span key={t} className="rounded-full bg-white px-2 py-0.5 text-[13px] font-semibold text-[#3A3A3C]">
                                {TAG_LABELS[t]}
                              </span>
                            ))}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => onAskDish(item.name)}
                        aria-label={`Ask about ${item.name}`}
                        className={`mt-1 inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-[15px] font-semibold text-black hover:bg-[#E5E5EA] ${focus}`}
                      >
                        Ask
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
