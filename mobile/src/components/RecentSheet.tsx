import { Image } from "expo-image";
import type { SFSymbol } from "expo-symbols";
import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODE_LABELS, type AskAnswer, type Mode, type Scan } from "../modes";
import { HISTORY_UNAVAILABLE, recentView } from "../logic/recent";
import { colors, MIN_TARGET, radius, type } from "../theme";
import { SectionList } from "./Disclosure";
import { Icon, IconButton } from "./ui";

const GLYPH: Record<Mode, { sf: SFSymbol; ion: ComponentProps<typeof Ionicons>["name"] }> = {
  read: { sf: "text.alignleft", ion: "reader-outline" },
  describe: { sf: "eye", ion: "eye-outline" },
  menu: { sf: "list.bullet.rectangle", ion: "list-outline" },
  translate: { sf: "character.bubble", ion: "language-outline" },
};

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

function Thumb({ scan }: { scan: Scan }) {
  if (scan.image) {
    return <Image source={{ uri: scan.image }} style={s.thumb} contentFit="cover" accessible={false} />;
  }
  const g = GLYPH[scan.mode];
  return (
    <View style={[s.thumb, s.glyph]} accessible={false}>
      <Icon sf={g.sf} ion={g.ion} size={22} />
    </View>
  );
}

export type AskState =
  | { status: "idle" }
  | { status: "loading"; question: string }
  | { status: "done"; question: string; answer: AskAnswer; id: number };

export function RecentSheet({
  visible,
  scans,
  loading,
  reduceMotion,
  onOpen,
  onClose,
  askOn,
  ask,
  onAsk,
  onClearAsk,
  onOpenScanId,
  canRecord,
  recording,
  transcribing,
  onMic,
}: {
  visible: boolean;
  scans: Scan[] | null;
  loading: boolean;
  reduceMotion: boolean;
  onOpen: (scan: Scan) => void;
  onClose: () => void;
  askOn: boolean;
  ask: AskState;
  onAsk: (q: string) => void;
  onClearAsk: () => void;
  onOpenScanId: (id: string) => void;
  canRecord: boolean;
  recording: boolean;
  transcribing: boolean;
  onMic: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const busy = ask.status === "loading" || transcribing;
  const send = () => {
    const text = q.trim();
    if (!text || busy) return;
    setQ("");
    onAsk(text);
  };
  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType={reduceMotion ? "none" : "slide"} onRequestClose={onClose}>
      <View style={s.root}>
        <View style={s.header}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" hitSlop={8} style={s.done}>
            <Text style={[type.headline, { fontWeight: "700" }]}>Done</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <Text style={type.largeTitle} accessibilityRole="header">
            Recent
          </Text>

          {askOn ? (
            <View style={{ gap: 12 }}>
              <View style={s.askRow}>
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  onSubmitEditing={send}
                  placeholder="Ask about your scans"
                  placeholderTextColor={colors.secondary}
                  returnKeyType="send"
                  editable={!busy}
                  style={[type.body, s.field]}
                  accessibilityLabel="Ask about your scans"
                  accessibilityHint='For example, "How much was the salmon?"'
                />
                {q.trim() ? (
                  <IconButton onPress={send} label="Ask" filled="black" size={50}>
                    <Icon sf="arrow.up" ion="arrow-up" color={colors.onPrimary} weight="bold" />
                  </IconButton>
                ) : canRecord ? (
                  <IconButton
                    onPress={onMic}
                    label={recording ? "Stop and ask" : "Ask by voice"}
                    hint={recording ? "Stops recording and asks your question" : "Records a spoken question about your scans"}
                    filled={recording ? "black" : "surface"}
                    size={50}
                  >
                    {recording ? (
                      <View style={s.recDot} />
                    ) : (
                      <Icon sf="mic.fill" ion="mic" size={20} />
                    )}
                  </IconButton>
                ) : null}
              </View>
              {recording ? (
                <Text style={[type.subhead, { color: colors.record, fontWeight: "600" }]}>
                  Listening. Tap the button again when you're done.
                </Text>
              ) : null}

              {ask.status !== "idle" ? (
                <View style={s.answer}>
                  <View style={s.answerHead}>
                    <Text style={[type.footnote, { flex: 1, fontWeight: "600" }]} numberOfLines={2}>
                      {ask.question}
                    </Text>
                    {ask.status === "done" ? (
                      <IconButton onPress={onClearAsk} label="Close answer" filled="white" size={44}>
                        <Icon sf="xmark" ion="close" size={15} weight="bold" />
                      </IconButton>
                    ) : null}
                  </View>
                  {ask.status === "loading" ? (
                    <View style={s.inline} accessible accessibilityLabel="Looking through your scans">
                      <ActivityIndicator color={colors.label} />
                      <Text style={type.body}>Looking through your scans…</Text>
                    </View>
                  ) : (
                    <>
                      <Text style={s.lead} selectable>
                        {ask.answer.spokenText}
                      </Text>
                      <SectionList
                        key={`ask-${ask.id}`}
                        idPrefix={`ask-${ask.id}`}
                        sections={ask.answer.sections}
                        reduceMotion={reduceMotion}
                        inset
                      />
                      {ask.answer.scans.length ? (
                        <View>
                          <Text style={[type.footnote, { fontWeight: "600", marginBottom: 2 }]}>From your scans</Text>
                          {ask.answer.scans.map((sc, i) => {
                            const when = timeAgo(sc.createdAt);
                            return (
                              <Pressable
                                key={sc.id}
                                onPress={() => onOpenScanId(sc.id)}
                                accessibilityRole="button"
                                accessibilityLabel={`${sc.title}${when ? `, ${when}` : ""}`}
                                accessibilityHint="Opens this scan"
                                style={({ pressed }) => [s.refRow, i > 0 && s.rule, pressed && { opacity: 0.6 }]}
                              >
                                <View style={{ flex: 1, gap: 2 }}>
                                  <Text style={type.callout} numberOfLines={2}>
                                    {sc.title}
                                  </Text>
                                  {when ? <Text style={type.footnote}>{when}</Text> : null}
                                </View>
                                <Icon sf="chevron.right" ion="chevron-forward" size={14} color={colors.secondary} />
                              </Pressable>
                            );
                          })}
                        </View>
                      ) : null}
                    </>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}
          {recentView(scans, loading) === "loading" ? (
            <View style={s.empty} accessible accessibilityLabel="Loading recent scans">
              <ActivityIndicator color={colors.label} />
            </View>
          ) : recentView(scans, loading) === "unavailable" ? (
            <View style={s.empty} accessible accessibilityLiveRegion="polite">
              <Text style={type.headline}>{HISTORY_UNAVAILABLE}</Text>
              <Text style={[type.subhead, { textAlign: "center" }]}>Your scans are safe. Try again in a minute.</Text>
            </View>
          ) : !scans?.length ? (
            <View style={s.empty}>
              <Text style={type.headline}>No scans yet</Text>
              <Text style={[type.subhead, { textAlign: "center" }]}>Things you capture show up here.</Text>
            </View>
          ) : (
            <View>
              {scans.map((scan, i) => {
                const when = timeAgo(scan.createdAt);
                return (
                  <Pressable
                    key={scan.id}
                    onPress={() => onOpen(scan)}
                    accessibilityRole="button"
                    accessibilityLabel={`${scan.title}. ${MODE_LABELS[scan.mode]}${when ? `, ${when}` : ""}`}
                    accessibilityHint="Opens this scan"
                    style={({ pressed }) => [s.row, i > 0 && s.rule, pressed && { opacity: 0.6 }]}
                  >
                    <Thumb scan={scan} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={type.headline} numberOfLines={2}>
                        {scan.title}
                      </Text>
                      <Text style={type.footnote}>
                        {MODE_LABELS[scan.mode]}
                        {when ? ` · ${when}` : ""}
                      </Text>
                    </View>
                    <Icon sf="chevron.right" ion="chevron-forward" size={14} color={colors.secondary} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 8, paddingTop: 10, minHeight: 56 },
  done: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, gap: 16 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.surface },
  glyph: { alignItems: "center", justifyContent: "center" },
  askRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: {
    flex: 1,
    minHeight: 50,
    backgroundColor: colors.surface,
    borderRadius: radius.field,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  recDot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colors.record },
  answer: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 12 },
  answerHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -6, marginRight: -8 },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  lead: { fontSize: 20, lineHeight: 28, fontWeight: "400", letterSpacing: -0.45, color: colors.label },
  refRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingVertical: 10 },
});
