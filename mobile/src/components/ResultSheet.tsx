import { Image } from "expo-image";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { listenAction } from "../logic/webSpeech";
import { lookupLanguage } from "../logic/lookupRequest";
import { initialReadAll, reduceReadAll, type ReadAllEvent, type ReadAllState } from "../logic/readAll";
import { speech } from "../speech";
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
import { answerLang } from "../logic/speechLang";
import { colors, MIN_TARGET, radius, type } from "../theme";
import type { Shot } from "../types";
import { SectionList } from "./Disclosure";
import { Magnifier } from "./Magnifier";
import { MenuView } from "./MenuView";
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
  onMic: (context?: string) => void; // context: a dish the spoken question is about
  onRetry: () => void;
  onLookup: () => void;
};

function host(url: string) {
  return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
}

// With a menu, the sections that aren't its dishes (hours, the dietary key); otherwise all of them.
function notMenu(r: AnalyzeResponse): Section[] {
  if (!r.menu || r.error) return sectionsOf(r);
  const dishes = new Set(r.menu.sections.map((m) => m.title));
  return sectionsOf(r).filter((x) => !dishes.has(x.title));
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
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const menuY = useRef(0);
  const shot = p.shot;
  const r = shot?.result;
  const looking = !!shot && !r;
  const askBusy = !!shot?.followUps.some((f) => !f.answer);
  const lang = shot ? answerLang(shot.mode, shot.language, r?.spokenLanguage) : "en-US";

  // Read all: every section (answer, then web) in order, one owner per section.
  const [magnify, setMagnify] = useState(false);
  const [readAll, setReadAllState] = useState<ReadAllState>(initialReadAll);
  const readAllRef = useRef<ReadAllState>(initialReadAll);
  const setReadAll = (st: ReadAllState) => {
    readAllRef.current = st;
    setReadAllState(st);
  };
  const dispatchReadAll = (e: ReadAllEvent) => {
    const r = reduceReadAll(readAllRef.current, e);
    setReadAll(r.state); // before the effects: stopping speech reports back synchronously
    for (const fx of r.effects) {
      if (fx.type === "stopSpeech") speech.stop();
      else speech.speakAll(fx.items, lang);
    }
  };
  useEffect(
    () => speech.subscribe((on, owner) => setReadAll(reduceReadAll(readAllRef.current, { type: "speaking", owner: on ? owner : null }).state)),
    [],
  );
  useEffect(() => setReadAll(initialReadAll), [shot?.id, p.visible]); // new result or sheet closed

  const send = () => {
    const q = question.trim();
    if (!q || askBusy) return;
    setQuestion("");
    p.onAsk(q);
  };

  // Ask about one dish: the keyboard opens pre-filled, or the mic records a question about it.
  const askDish = (name: string, via: "keyboard" | "voice") => {
    if (via === "voice" && p.canRecord && !p.recording && !askBusy) return p.onMic(`About the ${name}:`);
    setQuestion(`Is the ${name} `);
    setTimeout(() => field.current?.focus(), 50);
  };

  // A menu's photo is a short strip (tap to magnify); the dishes below matter more.
  const ratio = r?.menu && !r.error ? 2.4 : shot?.photo ? Math.min(1.6, Math.max(0.8, shot.photo.width / shot.photo.height)) : 0.8;

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
            {shot ? shot.label ?? (shot.mode === "translate" ? `Translate to ${shot.language}` : MODE_LABELS[shot.mode]) : ""}
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

        <Magnifier uri={shot?.photo?.uri ?? null} visible={magnify} reduceMotion={p.reduceMotion} onClose={() => setMagnify(false)} />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <ScrollView
            ref={scroll}
            contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
            keyboardShouldPersistTaps="handled"
          >
            {shot?.thread?.length ? (
              <View style={s.thread} accessibilityLabel="Earlier in this conversation">
                {shot.thread.map((t, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Text style={[type.subhead, { fontWeight: "600", color: colors.label }]}>“{t.question}”</Text>
                    <Text style={type.subhead}>{t.answer}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {shot?.asked ? (
              <Text style={s.asked} accessibilityLabel={`You asked: ${shot.asked}`}>
                “{shot.asked}”
              </Text>
            ) : null}
            {shot?.photo ? (
              <Pressable
                onPress={() => setMagnify(true)}
                accessibilityRole="button"
                accessibilityLabel={`${shot.fromHistory ? "Photo of the item" : "Photo"}. Double-tap to magnify.`}
              >
                <Image
                  source={{ uri: shot.photo.uri }}
                  style={[s.photo, { aspectRatio: ratio }]}
                  contentFit="cover"
                  transition={p.reduceMotion ? 0 : 180}
                  accessible={false}
                  accessibilityIgnoresInvertColors
                />
                <View style={s.magnifyBadge} pointerEvents="none">
                  <Icon sf="plus.magnifyingglass" ion="search" size={18} color="#FFFFFF" />
                </View>
              </Pressable>
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
                  <View style={{ gap: 4 }}>
                    {r.menu?.name ? (
                      <Text style={type.largeTitle} accessibilityRole="header">
                        {r.menu.name}
                      </Text>
                    ) : null}
                    <Text style={s.lead} selectable>
                      {r.spokenText}
                    </Text>
                  </View>
                )}
                {r.barcode?.found && !r.error ? (
                  <Text style={type.caption} selectable>
                    Scanned barcode {r.barcode.code}
                  </Text>
                ) : null}

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

                {r.menu && !r.error ? (
                  <View onLayout={(e) => (menuY.current = e.nativeEvent.layout.y)}>
                    <MenuView
                      key={`m-${shot!.id}`}
                      menu={r.menu}
                      idPrefix={`m-${shot!.id}`}
                      lang={lang}
                      onScrollTo={(y) => scroll.current?.scrollTo({ y: Math.max(0, menuY.current + y - 8), animated: !p.reduceMotion })}
                      onAskDish={askDish}
                    />
                  </View>
                ) : null}
                {(() => {
                  if (r.menu && !r.error) return null; // the menu has its own section reading
                  const answerSecs = sectionsOf(r);
                  const webSecs = shot!.web.status === "done" ? shot!.web.data.sections ?? [] : [];
                  if (answerSecs.length + webSecs.length < 2) return null;
                  const reading = readAll.status === "reading";
                  return (
                    <PillButton
                      label={reading ? "Stop reading" : "Read all"}
                      variant="secondary"
                      onPress={() =>
                        dispatchReadAll(
                          reading
                            ? { type: "stop" }
                            : {
                                type: "start",
                                prefix: `r-${shot!.id}`,
                                sections: answerSecs,
                                more: webSecs.length ? [{ prefix: `w-${shot!.id}`, sections: webSecs }] : [],
                              },
                        )
                      }
                      accessibilityHint={reading ? "Stops reading the sections" : "Reads every section aloud, in order"}
                      icon={<Icon sf={reading ? "stop.fill" : "text.line.first.and.arrowtriangle.forward"} ion={reading ? "stop" : "list"} size={17} />}
                    />
                  );
                })()}
                <SectionList
                  key={`r-${shot!.id}`}
                  idPrefix={`r-${shot!.id}`}
                  lang={lang}
                  sections={notMenu(r)}
                  reduceMotion={p.reduceMotion}
                />

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
                        ref={field}
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
                        onPress={() => p.onMic()}
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
  const [owner, setOwner] = useState<string | null>(speech.owner);
  useEffect(() => speech.subscribe((on, who) => setOwner(on ? who : null)), []);
  const webOwner = `web-${shot.id}`;
  const listening = owner === webOwner;
  const webLang = lookupLanguage(shot.mode, shot.language) ? languageCode(shot.language) : "en-US";
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
          {!w.data.error ? (
            <PillButton
              label={listening ? "Stop" : "Listen"}
              variant="primary"
              onPress={() =>
                listenAction({ speakingOwner: owner }, webOwner) === "stop"
                  ? speech.stop()
                  : speech.speak(w.data.spokenText, webLang, { owner: webOwner })
              }
              accessibilityLabel={listening ? "Stop reading the web summary" : "Listen to the web summary"}
              icon={<Icon sf={listening ? "stop.fill" : "speaker.wave.2.fill"} ion={listening ? "stop" : "volume-high"} size={18} color={colors.onPrimary} />}
              style={{ alignSelf: "flex-start" }}
            />
          ) : null}
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
  magnifyBadge: {
    position: "absolute",
    right: 12,
    bottom: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
  thread: { gap: 10, paddingBottom: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  asked: { fontSize: 24, lineHeight: 31, fontWeight: "600", letterSpacing: -0.3, color: colors.label },
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
