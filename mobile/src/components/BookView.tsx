import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from "react-native";
import { sentenceOwner, type BookState } from "../logic/book";
import { RATES } from "../settings";
import { colors, MIN_TARGET, radius, type } from "../theme";
import { Segmented } from "./Segmented";
import { Icon, PillButton } from "./ui";

const HIGHLIGHT = "#FFF1A8"; // soft yellow behind the sentence being read (plus bold + underline)

// Full-screen reading view for book mode: big text, the current sentence highlighted and kept
// in view, big controls. Also good for dyslexic readers following along.
export function BookView({
  book,
  speakingOwner,
  rate,
  topInset,
  bottomInset,
  recording,
  onPause,
  onResume,
  onBack,
  onNext,
  onAsk,
  onEnd,
  onRetake,
  onRate,
}: {
  book: BookState;
  speakingOwner: string | null;
  rate: number;
  topInset: number;
  bottomInset: number;
  recording: boolean;
  onPause: () => void;
  onResume: () => void;
  onBack: () => void;
  onNext: () => void;
  onAsk: () => void;
  onEnd: () => void;
  onRetake: () => void;
  onRate: (r: number) => void;
}) {
  const page = book.pages[book.pageIndex];
  const scroller = useRef<ScrollViewInstance>(null);
  const ys = useRef<Record<number, number>>({});
  const [viewH, setViewH] = useState(0);
  const current = book.sentence;

  // Keep the sentence being read in view.
  useEffect(() => {
    const y = ys.current[current];
    if (y !== undefined) scroller.current?.scrollTo({ y: Math.max(0, y - viewH / 3), animated: true });
  }, [current, book.pageIndex, viewH]);

  const reading = book.status === "reading";
  const status =
    book.status === "capturing"
      ? "Reading the page…"
      : book.status === "waitingTurn"
        ? "Turn the page"
        : book.status === "cutOff"
          ? "Part of the page is cut off"
          : book.status === "asking"
            ? recording
              ? "Listening…"
              : "Asking…"
            : book.status === "paused"
              ? "Paused"
              : page?.pageNumber
                ? `Page ${page.pageNumber}`
                : `Page ${book.pageIndex + 1}`;

  return (
    <View style={[s.root, { paddingTop: topInset + 8, paddingBottom: bottomInset + 10 }]}>
      <View style={s.header}>
        <Text style={type.title2} accessibilityRole="header" accessibilityLiveRegion="polite">
          {status}
        </Text>
        <Pressable onPress={onEnd} accessibilityRole="button" accessibilityLabel="End reading" hitSlop={8} style={s.end}>
          <Text style={[type.headline, { fontWeight: "700" }]}>End</Text>
        </Pressable>
      </View>

      {book.status === "waitingTurn" ? (
        <View style={s.banner} accessible accessibilityLabel="Turn the page. I'll read the next one when you hold still.">
          <Icon sf="book.pages" ion="book-outline" size={28} />
          <Text style={[type.title3, { flex: 1 }]}>Turn the page, then hold still.</Text>
        </View>
      ) : book.status === "cutOff" ? (
        <View style={s.banner}>
          <Icon sf="exclamationmark.triangle" ion="warning-outline" size={26} />
          <Text style={[type.body, { flex: 1 }]}>Move the phone back so the whole page fits, then retake.</Text>
          <PillButton label="Retake" onPress={onRetake} />
        </View>
      ) : book.status === "capturing" && !page ? (
        <View style={s.banner} accessible accessibilityLabel="Reading the page">
          <ActivityIndicator color={colors.label} />
          <Text style={type.title3}>Reading the page…</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scroller}
        style={{ flex: 1 }}
        contentContainerStyle={s.text}
        onLayout={(e) => setViewH(e.nativeEvent.layout.height)}
      >
        {page?.sentences.map((t, i) => {
          const on = i === current && (book.status === "reading" || book.status === "paused" || speakingOwner === sentenceOwner(book.pageIndex, i));
          return (
            <Text
              key={`${book.pageIndex}-${i}`}
              onLayout={(e) => (ys.current[i] = e.nativeEvent.layout.y)}
              style={[s.sentence, on && s.sentenceOn]}
              accessibilityLabel={on ? `Current sentence: ${t}` : t}
            >
              {t}
            </Text>
          );
        })}
      </ScrollView>

      <View style={s.controls}>
        <View style={s.row}>
          <BigButton label="Back" sf="backward.fill" ion="play-back" onPress={onBack} hint="Goes back one sentence" />
          {reading ? (
            <BigButton label="Pause" sf="pause.fill" ion="pause" onPress={onPause} primary />
          ) : (
            <BigButton
              label={book.status === "paused" && book.pages.length ? "Resume" : "Resume"}
              sf="play.fill"
              ion="play"
              onPress={onResume}
              primary
              disabled={book.status !== "paused"}
              hint="Continues from the same sentence"
            />
          )}
          <BigButton label="Next page" sf="forward.end.fill" ion="play-skip-forward" onPress={onNext} hint="Reads the next page now" />
        </View>
        <View style={s.row}>
          <PillButton
            label={recording ? "Stop and ask" : "Ask about this page"}
            variant="secondary"
            onPress={onAsk}
            icon={recording ? <View style={s.rec} /> : <Icon sf="mic.fill" ion="mic" size={18} />}
            style={{ flex: 1 }}
          />
        </View>
        <Segmented label="Speed" options={RATES} value={rate} onChange={onRate} format={(v) => `${v}×`} describe={(v) => `${v} times`} />
      </View>
    </View>
  );
}

function BigButton({
  label,
  sf,
  ion,
  onPress,
  primary,
  disabled,
  hint,
}: {
  label: string;
  sf: Parameters<typeof Icon>[0]["sf"];
  ion: Parameters<typeof Icon>[0]["ion"];
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.big, primary && s.bigPrimary, (pressed || disabled) && { opacity: disabled ? 0.45 : 0.75 }]}
    >
      <Icon sf={sf} ion={ion} size={28} color={primary ? colors.onPrimary : colors.label} />
      <Text style={[s.bigLabel, primary && { color: colors.onPrimary }]} maxFontSizeMultiplier={1.6}>
        {label}
      </Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, paddingHorizontal: 18, gap: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52 },
  end: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, alignItems: "center", justifyContent: "center", paddingHorizontal: 12 },
  banner: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface, flexWrap: "wrap" },
  text: { paddingVertical: 8, gap: 6 },
  sentence: { fontSize: 26, lineHeight: 38, color: colors.label, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  sentenceOn: { backgroundColor: HIGHLIGHT, fontWeight: "700", textDecorationLine: "underline" },
  controls: { gap: 10 },
  row: { flexDirection: "row", gap: 10 },
  big: {
    flex: 1,
    minHeight: 76,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
  },
  bigPrimary: { backgroundColor: colors.primary },
  bigLabel: { fontSize: 16, fontWeight: "700", color: colors.label },
  rec: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.record },
});
