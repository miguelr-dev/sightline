import { Image } from "expo-image";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
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
import { languageCode, MODE_LABELS, type AnalyzeResponse, type LookupSource, type Section } from "../modes";
import { RATES } from "../settings";
import { colors, MIN_TARGET, radius, type } from "../theme";
import type { Shot } from "../types";
import { SectionList } from "./Disclosure";
import { Segmented } from "./Segmented";
import { Icon, IconButton, PillButton } from "./ui";

type Props = {
  visible: boolean;
  shot: Shot | null;
  speaking: boolean;
  rate: number;
  reduceMotion: boolean;
  recording: boolean;
  transcribing: boolean;
  canRecord: boolean;
  canLookup: boolean;
  onClose: () => void;
  onDismiss: () => void;
  onReplay: () => void;
  onStop: () => void;
  onRate: (r: number) => void;
  onAsk: (q: string) => void;
  onMic: () => void;
  onRetry: () => void;
  onLookup: () => void;
};

function host(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
}

// Server sections when it sends them; an older server's free-text details as one section.
function sectionsOf(r: AnalyzeResponse): Section[] {
  if (r.sections?.length) return r.sections;
  const d = r.details?.trim();
  return d && d !== r.spokenText.trim() ? [{ title: "Details", body: d }] : [];
}

export function ResultSheet(p: Props) {
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState("");
  const shot = p.shot;
  const r = shot?.result;
  const looking = !!shot && !r;
  const askBusy = !!shot?.followUps.some((f) => !f.answer);
  const lang = shot?.mode === "translate" ? languageCode(shot.language) : "en-US";

  const send = () => {
    const q = question.trim();
    if (!q || askBusy) return;
    setQuestion("");
    p.onAsk(q);
  };

  const ratio = shot?.photo ? Math.min(1.6, Math.max(0.8, shot.photo.width / shot.photo.height)) : 0.8;

  return (
    <Modal
      visible={p.visible}
      presentationStyle="pageSheet"
      animationType={p.reduceMotion ? "none" : "slide"}
      onRequestClose={p.onClose}
      onDismiss={p.onDismiss}
    >
      <View style={s.root}>
        <View style={s.header}>
          <Text style={type.caption} accessibilityRole="header">
            {shot ? (shot.mode === "translate" ? `Translate to ${shot.language}` : MODE_LABELS[shot.mode]) : ""}
          </Text>
          <Pressable
            onPress={p.onClose}
            accessibilityRole="button"
            accessibilityLabel="Done"
            accessibilityHint="Closes the answer and goes back to the camera"
            hitSlop={8}
            style={s.done}
          >
            <Text style={[type.headline, { fontWeight: "700" }]}>Done</Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
          >
            {shot?.photo ? (
              <Image
                source={{ uri: shot.photo.uri }}
                style={[s.photo, { aspectRatio: ratio }]}
                contentFit="cover"
                transition={p.reduceMotion ? 0 : 180}
                accessible
                accessibilityLabel={shot.fromHistory ? "Photo of the item" : "Your photo"}
                accessibilityIgnoresInvertColors
              />
            ) : shot?.fromHistory ? null : (
              <View style={[s.photo, { aspectRatio: ratio, backgroundColor: colors.surface }]} />
            )}

            {looking ? (
              <View style={s.looking} accessible accessibilityLabel="Looking" accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.label} />
                <Text style={type.title2}>Looking…</Text>
              </View>
            ) : r ? (
              <>
                {r.error ? (
                  <View style={s.errorRow}>
                    <Icon sf="exclamationmark.circle" ion="alert-circle-outline" size={24} />
                    <Text style={[s.lead, { flex: 1 }]} selectable>
                      {r.spokenText}
                    </Text>
                  </View>
                ) : (
                  <Text style={s.lead} selectable>
                    {r.spokenText}
                  </Text>
                )}

                <View style={s.row}>
                  {r.error && !shot!.fromHistory ? (
                    <PillButton
                      label="Try again"
                      onPress={p.onRetry}
                      icon={<Icon sf="arrow.clockwise" ion="refresh" color={colors.onPrimary} size={18} />}
                      style={{ flex: 1 }}
                    />
                  ) : (
                    <PillButton
                      label="Replay"
                      onPress={p.onReplay}
                      accessibilityHint="Reads the answer aloud again"
                      icon={<Icon sf="play.fill" ion="play" color={colors.onPrimary} size={17} />}
                      style={{ flex: 1 }}
                    />
                  )}
                  <PillButton
                    label="Stop"
                    variant="secondary"
                    onPress={p.onStop}
                    disabled={!p.speaking}
                    accessibilityLabel="Stop speaking"
                    icon={<Icon sf="stop.fill" ion="stop" size={15} />}
                    style={{ flex: 1 }}
                  />
                </View>

                <View style={{ gap: 8 }}>
                  <Text style={type.caption}>Speed</Text>
                  <Segmented
                    label="Speed"
                    options={RATES}
                    value={p.rate}
                    onChange={p.onRate}
                    format={(v) => `${v}×`}
                    describe={(v) => `${v} times`}
                  />
                </View>

                <SectionList key={`r-${shot!.id}`} idPrefix={`r-${shot!.id}`} lang={lang} sections={sectionsOf(r)} reduceMotion={p.reduceMotion} />

                {shot!.followUps.map((f) => (
                  <View key={f.id} style={s.section}>
                    <Text style={type.headline} accessibilityRole="header">
                      {f.question}
                    </Text>
                    {f.answer ? (
                      <>
                        <Text style={type.body} selectable>
                          {f.answer.spokenText}
                        </Text>
                        <SectionList idPrefix={`f-${shot!.id}-${f.id}`} lang={lang} sections={sectionsOf(f.answer)} reduceMotion={p.reduceMotion} />
                      </>
                    ) : (
                      <View style={s.inline} accessible accessibilityLabel="Thinking">
                        <ActivityIndicator color={colors.label} />
                        <Text style={type.body}>Thinking…</Text>
                      </View>
                    )}
                  </View>
                ))}

                <WebCard shot={shot!} canLookup={p.canLookup} onLookup={p.onLookup} reduceMotion={p.reduceMotion} />

                {!r.error && !shot!.fromHistory ? (
                  <View style={s.section}>
                    <Text style={type.caption} accessibilityRole="header">
                      Ask about this
                    </Text>
                    <View style={s.askRow}>
                      <TextInput
                        value={question}
                        onChangeText={setQuestion}
                        onSubmitEditing={send}
                        placeholder={shot!.mode === "menu" ? "How much is the salmon?" : "What colour is it?"}
                        placeholderTextColor={colors.secondary}
                        returnKeyType="send"
                        style={[type.body, s.field]}
                        accessibilityLabel="Question about this photo"
                        editable={!askBusy}
                      />
                      <IconButton
                        onPress={send}
                        label="Send question"
                        filled="black"
                        size={50}
                      >
                        <Icon sf="arrow.up" ion="arrow-up" color={colors.onPrimary} weight="bold" />
                      </IconButton>
                    </View>
                    {p.canRecord ? (
                      <PillButton
                        label={p.recording ? "Stop and ask" : p.transcribing ? "Listening back…" : "Ask by voice"}
                        variant="secondary"
                        onPress={p.onMic}
                        busy={p.transcribing}
                        disabled={askBusy}
                        accessibilityHint={p.recording ? "Stops recording and asks your question" : "Records a spoken question"}
                        icon={
                          p.recording ? (
                            <View style={s.recDot} />
                          ) : (
                            <Icon sf="mic.fill" ion="mic" size={18} />
                          )
                        }
                      />
                    ) : null}
                    {p.recording ? (
                      <Text style={[type.subhead, { color: colors.record, fontWeight: "600" }]} accessibilityLiveRegion="polite">
                        Listening. Tap Stop and ask when you're done.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function WebCard({
  shot,
  canLookup,
  onLookup,
  reduceMotion,
}: {
  shot: Shot;
  canLookup: boolean;
  onLookup: () => void;
  reduceMotion: boolean;
}) {
  const [heroFailed, setHeroFailed] = useState(false);
  const w = shot.web;
  if (w.status === "idle") {
    if (!canLookup) return null;
    return (
      <PillButton
        label="Look it up on the web"
        variant="secondary"
        onPress={onLookup}
        icon={<Icon sf="globe" ion="globe-outline" size={18} />}
      />
    );
  }
  const hero = w.status === "done" && w.data.image && !heroFailed ? w.data.image : null;
  return (
    <View style={s.card}>
      {hero ? (
        <Image
          source={{ uri: hero }}
          style={s.webHero}
          contentFit="cover"
          transition={reduceMotion ? 0 : 150}
          onError={() => setHeroFailed(true)}
          accessible
          accessibilityLabel="Photo of the item from the web"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Text style={type.caption} accessibilityRole="header">
        From the web
      </Text>
      {w.status === "loading" ? (
        <View style={s.inline} accessible accessibilityLabel="Checking the web">
          <ActivityIndicator color={colors.label} />
          <Text style={type.body}>Checking the web…</Text>
        </View>
      ) : (
        <>
          <Text style={type.body} selectable>
            {w.data.spokenText.replace(/^From the web:\s*/i, "")}
          </Text>
          <SectionList key={`w-${shot.id}`} idPrefix={`w-${shot.id}`} sections={w.data.sections ?? []} reduceMotion={reduceMotion} inset />
          {w.data.sources.length ? (
            <View style={{ marginTop: 4 }}>
              <Text style={[type.footnote, { fontWeight: "600", marginBottom: 2 }]}>Sources</Text>
              {w.data.sources.map((src, i) => (
                <SourceRow key={`${src.url}-${i}`} src={src} first={i === 0} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function SourceRow({ src, first }: { src: LookupSource; first: boolean }) {
  const [failed, setFailed] = useState(false);
  const domain = host(src.url);
  return (
    <Pressable
      onPress={() => void Linking.openURL(src.url)}
      accessibilityRole="link"
      accessibilityLabel={`${src.title}, ${domain}`}
      accessibilityHint="Opens in Safari"
      style={({ pressed }) => [s.source, !first && s.sourceRule, pressed && { opacity: 0.6 }]}
    >
      {src.thumbnail && !failed ? (
        <Image
          source={{ uri: src.thumbnail }}
          style={s.thumb}
          contentFit="cover"
          onError={() => setFailed(true)}
          accessible={false}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[s.thumb, s.thumbFallback]} accessible={false}>
          <Text style={[type.headline, { color: colors.secondary }]} maxFontSizeMultiplier={1.4}>
            {(domain[0] ?? "?").toUpperCase()}
          </Text>
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={type.callout} numberOfLines={2}>
          {src.title}
        </Text>
        <Text style={type.footnote}>{domain}</Text>
      </View>
      <Icon sf="arrow.up.right" ion="open-outline" size={15} color={colors.secondary} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: 10,
    minHeight: 56,
  },
  done: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, paddingTop: 4, gap: 20 },
  photo: { width: "100%", borderRadius: radius.card, backgroundColor: colors.surface },
  looking: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  lead: { fontSize: 22, lineHeight: 30, fontWeight: "400", letterSpacing: -0.26, color: colors.label },
  errorRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  section: { gap: 8 },
  inline: { flexDirection: "row", alignItems: "center", gap: 10 },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, padding: 18, gap: 10 },
  source: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: MIN_TARGET, paddingVertical: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.bg },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  webHero: { width: "100%", aspectRatio: 16 / 10, borderRadius: 14, backgroundColor: colors.bg, marginBottom: 4 },
  sourceRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
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
});
