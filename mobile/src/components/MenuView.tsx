import * as Haptics from "expo-haptics";
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import type { Menu, MenuItem } from "../modes";
import { speech } from "../speech";
import { colors, MIN_TARGET, radius, type } from "../theme";
import {
  applyMenuFilter,
  filterAnnouncement,
  itemLabel,
  itemSpeech,
  menuCurrency,
  menuFilters,
  rowOwner,
  sectionReadQueue,
  TAG_LABELS,
  type MenuFilter,
} from "../logic/menu";
import { Icon } from "./ui";

// A menu, laid out for picking what to hear: a row of section chips that jump to each heading,
// quick filters the menu can actually answer, and one large row per dish. Tap a row to hear that
// dish; long-press it (or its Ask button) to ask about it. Each heading can read its dishes in
// order, names and prices only. Logic: logic/menu.ts.

export function MenuView({
  menu,
  idPrefix,
  lang,
  onScrollTo,
  onAskDish,
}: {
  menu: Menu;
  idPrefix: string; // unique per result, e.g. "m-12"
  lang: string;
  onScrollTo: (y: number) => void; // y inside this view
  onAskDish: (name: string, via: "keyboard" | "voice") => void;
}) {
  const [filter, setFilter] = useState<MenuFilter | null>(null);
  const currency = useMemo(() => menuCurrency(menu), [menu]);
  const filters = useMemo(() => menuFilters(menu), [menu]);
  const shown = useMemo(() => applyMenuFilter(menu, filter), [menu, filter]);
  const owner = useSpeakingOwner();
  const headerY = useRef<Record<number, number>>({});
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.35; // large Dynamic Type: the price goes under the name

  useEffect(() => setFilter(null), [menu]);

  const pickFilter = (f: MenuFilter) => {
    void Haptics.selectionAsync().catch(() => {});
    const next = filter === f ? null : f;
    setFilter(next);
    const count = applyMenuFilter(menu, next).reduce((n, s) => n + s.items.length, 0);
    AccessibilityInfo.announceForAccessibility(filterAnnouncement(count, next, currency));
  };

  const speakItem = (item: MenuItem, id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (owner === id) return speech.stop(); // tapping the dish being read stops it
    speech.speak(itemSpeech(item, currency), lang, { owner: id });
  };

  const readSection = (index: number) => {
    const sec = shown.find((s) => s.index === index);
    if (!sec) return;
    if (owner?.startsWith(`${idPrefix}-${index}-`)) return speech.stop();
    speech.speakAll(sectionReadQueue(sec, idPrefix, currency), lang);
  };

  return (
    <View style={{ gap: 14 }}>
      {shown.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipRow}
          accessibilityLabel="Menu sections"
        >
          {shown.map((sec) => (
            <Pressable
              key={sec.index}
              onPress={() => onScrollTo(headerY.current[sec.index] ?? 0)}
              accessibilityRole="button"
              accessibilityLabel={sec.title}
              accessibilityHint="Jumps to this section"
              style={({ pressed }) => [s.chip, s.sectionChip, pressed && { backgroundColor: colors.surfacePressed }]}
            >
              <Text style={s.chipText}>{sec.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {filters.length ? (
        <View style={s.filterRow}>
          {filters.map((f) => {
            const on = filter === f.id;
            return (
              <Pressable
                key={f.id}
                onPress={() => pickFilter(f.id)}
                accessibilityRole="button"
                accessibilityLabel={f.label}
                accessibilityHint={on ? "Shows every dish again" : "Shows only these dishes"}
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [s.chip, s.filterChip, on ? s.chipOn : null, pressed && !on && { backgroundColor: colors.surfacePressed }]}
              >
                <Icon
                  sf={on ? "checkmark" : "line.3.horizontal.decrease"}
                  ion={on ? "checkmark" : "filter"}
                  size={14}
                  color={on ? colors.onPrimary : colors.label}
                  weight="bold"
                />
                <Text style={[s.chipText, on && { color: colors.onPrimary }]}>{f.label}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {shown.map((sec) => {
        const reading = !!owner?.startsWith(`${idPrefix}-${sec.index}-`);
        return (
          <View key={sec.index} onLayout={(e) => (headerY.current[sec.index] = e.nativeEvent.layout.y)} style={{ gap: 4 }}>
            <View style={s.sectionHead}>
              <Text style={[type.title3, { flex: 1 }]} accessibilityRole="header">
                {sec.title}
              </Text>
              <Pressable
                onPress={() => readSection(sec.index)}
                accessibilityRole="button"
                accessibilityLabel={reading ? `Stop reading ${sec.title}` : `Read ${sec.title}`}
                accessibilityHint={reading ? undefined : "Reads each dish's name and price, in order"}
                hitSlop={6}
                style={({ pressed }) => [s.readBtn, pressed && { backgroundColor: colors.surfacePressed }]}
              >
                <Icon sf={reading ? "stop.fill" : "play.fill"} ion={reading ? "stop" : "play"} size={13} />
                <Text style={s.readText}>{reading ? "Stop" : "Read this section"}</Text>
              </Pressable>
            </View>
            <View style={s.card}>
              {sec.items.map(({ item, index }, k) => {
                const id = rowOwner(idPrefix, sec.index, index);
                const speaking = owner === id;
                return (
                  <Pressable
                    key={id}
                    onPress={() => speakItem(item, id)}
                    onLongPress={() => onAskDish(item.name, "voice")}
                    delayLongPress={450}
                    accessibilityRole="button"
                    accessibilityLabel={itemLabel(item, sec.title)}
                    accessibilityHint="Double-tap to hear it"
                    accessibilityValue={speaking ? { text: "Speaking" } : undefined}
                    accessibilityActions={[{ name: "activate" }, { name: "ask", label: "Ask about this dish" }]}
                    onAccessibilityAction={(e) => {
                      if (e.nativeEvent.actionName === "ask") onAskDish(item.name, "keyboard");
                      else speakItem(item, id);
                    }}
                    style={({ pressed }) => [
                      s.row,
                      k > 0 && s.rule,
                      speaking && { backgroundColor: colors.surfacePressed },
                      pressed && !speaking && { backgroundColor: colors.surfacePressed },
                    ]}
                  >
                    <View style={[s.rowTop, stacked && { flexDirection: "column", alignItems: "flex-start", gap: 2 }]}>
                      <View style={s.nameWrap}>
                        {speaking ? <Icon sf="speaker.wave.2.fill" ion="volume-high" size={16} /> : null}
                        <Text style={[type.headline, { flexShrink: 1 }]}>{item.name}</Text>
                      </View>
                      <View style={s.priceWrap}>
                        {item.price ? <Text style={[type.headline, s.price]}>{item.price}</Text> : null}
                        {/* VoiceOver reaches this through the row's "Ask about this dish" action. */}
                        <Pressable
                          onPress={() => onAskDish(item.name, "keyboard")}
                          accessible={false}
                          importantForAccessibility="no"
                          hitSlop={10}
                          style={({ pressed }) => [s.ask, pressed && { backgroundColor: colors.surfacePressed }]}
                        >
                          <Icon sf="bubble.left" ion="chatbubble-outline" size={15} color={colors.secondary} />
                        </Pressable>
                      </View>
                    </View>
                    {item.description ? <Text style={type.subhead}>{item.description}</Text> : null}
                    {item.tags?.length ? (
                      <View style={s.tags}>
                        {item.tags.map((t) => (
                          <Text key={t} style={s.tag}>
                            {TAG_LABELS[t]}
                          </Text>
                        ))}
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function useSpeakingOwner() {
  const [owner, setOwner] = useState<string | null>(speech.owner);
  useEffect(() => speech.subscribe((on, who) => setOwner(on ? who : null)), []);
  return owner;
}

const s = StyleSheet.create({
  chipRow: { gap: 8, paddingRight: 8 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: MIN_TARGET,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionChip: { minHeight: 48, paddingHorizontal: 18 },
  filterChip: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.hairline, paddingHorizontal: 14 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.headline, fontSize: 16 },
  sectionHead: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 10, flexWrap: "wrap" },
  readBtn: {
    minHeight: MIN_TARGET,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surface,
  },
  readText: { ...type.subhead, color: colors.label, fontWeight: "600" },
  card: { borderRadius: radius.card, backgroundColor: colors.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline, overflow: "hidden" },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, gap: 4, justifyContent: "center" },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  rowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  nameWrap: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1 },
  price: { fontVariant: ["tabular-nums"] },
  priceWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingTop: 2 },
  tag: {
    ...type.footnote,
    color: colors.label,
    fontWeight: "600",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.secondary,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: "hidden",
  },
  ask: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
});
