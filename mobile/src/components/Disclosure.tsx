import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, View, type TextLayoutEvent } from "react-native";
import type { Section } from "../modes";
import { speech } from "../speech";
import { colors, MIN_TARGET, radius } from "../theme";
import { provenanceLabel } from "../logic/provenance";
import { Icon } from "./ui";

// Apple-style disclosure rows: title and chevron, collapsed by default, body underneath.
// Tap expands. Long-press (or VoiceOver's "Read aloud" action, or the Listen button) reads the
// section aloud through the normal speech path. Long bodies show six lines and a More button.

const PREVIEW_LINES = 6;

export function SectionList({
  sections,
  reduceMotion,
  idPrefix,
  lang = "en-US",
  inset = false,
}: {
  sections: Section[];
  reduceMotion: boolean;
  idPrefix: string; // unique per result, e.g. "r-12" or "w-12"
  lang?: string;
  inset?: boolean; // inside a grey card
}) {
  const speakingOwner = useSpeakingOwner();
  if (!sections.length) return null;
  return (
    <View style={[s.list, inset && s.inset]}>
      {sections.map((sec, i) => {
        const id = `${idPrefix}-${i}`;
        return (
          <Disclosure
            key={id}
            id={id}
            section={sec}
            first={i === 0}
            lang={lang}
            speaking={speakingOwner === id}
            reduceMotion={reduceMotion}
            inset={inset}
          />
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

function animate(reduceMotion: boolean) {
  if (!reduceMotion && Platform.OS === "ios") {
    LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"));
  }
}

function Disclosure({
  id,
  section,
  first,
  lang,
  speaking,
  reduceMotion,
  inset,
}: {
  id: string;
  section: Section;
  first: boolean;
  lang: string;
  speaking: boolean;
  reduceMotion: boolean;
  inset: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);
  // Until the text is measured, guess from length so the button doesn't pop in late.
  const [long, setLong] = useState(() => section.body.length > 320 || section.body.split("\n").length > PREVIEW_LINES);

  // Read all: a section opens by itself while it's being read (More/Less stays as it was).
  useEffect(() => {
    if (speaking && !open) {
      animate(reduceMotion);
      setOpen(true);
    }
  }, [speaking]);

  const toggle = () => {
    animate(reduceMotion);
    if (open) {
      speech.stopIfOwner(id); // collapsing a section silences it
      setFull(false);
    }
    setOpen((o) => !o);
  };

  const readAloud = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    speech.speak(`${section.title}. ${section.body}`, lang, { owner: id });
  };

  const onMeasure = (e: TextLayoutEvent) => setLong(e.nativeEvent.lines.length > PREVIEW_LINES);

  return (
    <View style={[!first && s.rule]}>
      <Pressable
        onPress={toggle}
        onLongPress={readAloud}
        delayLongPress={400}
        accessibilityRole="button"
        accessibilityLabel={provenanceLabel(section.provenance) ? `${section.title}, ${provenanceLabel(section.provenance)}` : section.title}
        accessibilityValue={speaking ? { text: "Speaking" } : undefined}
        accessibilityHint={open ? "Hides this section. Long-press to hear it." : "Shows this section. Long-press to hear it."}
        accessibilityState={{ expanded: open }}
        accessibilityActions={[{ name: "activate" }, { name: "readAloud", label: "Read aloud" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "readAloud") readAloud();
          else toggle();
        }}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.55 }]}
      >
        {speaking ? <Icon sf="speaker.wave.2.fill" ion="volume-high" size={17} /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title}>{section.title}</Text>
          {provenanceLabel(section.provenance) ? (
            <Text style={s.provenance}>{provenanceLabel(section.provenance)}</Text>
          ) : null}
        </View>
        <Icon
          sf={open ? "chevron.up" : "chevron.down"}
          ion={open ? "chevron-up" : "chevron-down"}
          size={15}
          color={colors.secondary}
          weight="semibold"
        />
      </Pressable>

      {open ? (
        <View style={s.bodyWrap}>
          {/* Invisible copy, measured without a line limit, to decide whether More is needed. */}
          <View style={s.measure} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">
            <Text style={s.body} onTextLayout={onMeasure} accessible={false}>
              {section.body}
            </Text>
          </View>
          <Pressable onLongPress={readAloud} delayLongPress={400} accessible={false}>
            <Text
              style={s.body}
              numberOfLines={long && !full ? PREVIEW_LINES : undefined}
              accessibilityLabel={section.body} // VoiceOver always gets the full text
            >
              {section.body}
            </Text>
          </Pressable>
          <View style={s.actions}>
            {long ? (
              <Pressable
                onPress={() => {
                  animate(reduceMotion);
                  setFull((f) => !f);
                }}
                accessibilityRole="button"
                accessibilityLabel={full ? "Show less" : "Show more"}
                hitSlop={6}
                style={s.textButton}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text style={s.textButtonLabel}>{full ? "Less" : "More"}</Text>
                  <Icon sf={full ? "chevron.up" : "chevron.down"} ion={full ? "chevron-up" : "chevron-down"} size={13} weight="bold" />
                </View>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={speaking ? () => speech.stop() : readAloud}
              accessibilityRole="button"
              accessibilityLabel={speaking ? `Stop reading ${section.title}` : `Listen to ${section.title}`}
              style={({ pressed }) => [
                s.listen,
                { backgroundColor: inset ? colors.bg : colors.surface },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Icon sf={speaking ? "stop.fill" : "speaker.wave.2"} ion={speaking ? "stop" : "volume-medium-outline"} size={15} />
              <Text style={s.listenLabel}>{speaking ? "Stop" : "Listen"}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  inset: { borderBottomWidth: 0 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56, paddingVertical: 14 },
  provenance: { fontSize: 13, lineHeight: 17, fontWeight: "600", color: colors.secondary, textTransform: "uppercase", letterSpacing: 0.4 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: "600", letterSpacing: -0.45, color: colors.label },
  bodyWrap: { paddingBottom: 14, gap: 10 },
  body: { fontSize: 19, lineHeight: 28, fontWeight: "400", letterSpacing: -0.45, color: colors.label },
  measure: { position: "absolute", left: 0, right: 0, top: 0, opacity: 0 },
  actions: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  textButton: { minHeight: MIN_TARGET, justifyContent: "center" },
  textButtonLabel: { fontSize: 17, lineHeight: 22, fontWeight: "600", color: colors.label, },
  listen: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: MIN_TARGET,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
  listenLabel: { fontSize: 16, lineHeight: 21, fontWeight: "600", color: colors.label },
});
