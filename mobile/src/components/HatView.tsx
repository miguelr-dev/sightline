import { useKeepAwake } from "expo-keep-awake";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, TextInput } from "react-native";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, type } from "../theme";
import type { Shot } from "../types";
import type { HatStatus } from "../useHatCamera";
import type { Detection } from "../useAutoCapture";
import { DetectionCard } from "./DetectionCard";
import { Icon, IconButton, PillButton } from "./ui";

function KeepAwake() {
  useKeepAwake("sightline-hat"); // Expo Go has to stay in the foreground to keep polling
  return null;
}

function age(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} hr ago`;
}

const STATUS_TEXT: Record<HatStatus, string> = {
  connecting: "Connecting…",
  live: "Live",
  missing: "Hat camera isn't set up on this server yet.",
  unauthorized: "The pair code was rejected. Check it in Settings.",
  invalid: "That device ID isn't valid. Check it in Settings.",
  offline: "Can't reach the server. Retrying.",
};

// Calm full-screen state while the phone is the hat camera's speaker: no viewfinder, big type,
// what the hat last saw, and one big Disconnect button.
export function HatView({
  deviceId,
  status,
  lastEventAt,
  detection,
  hint,
  last,
  reduceMotion,
  topInset,
  bottomInset,
  onOpenLast,
  onDisconnect,
  commandsOn,
  recording,
  transcribing,
  asking,
  onTalk,
  onType,
}: {
  deviceId: string;
  status: HatStatus;
  lastEventAt: number | null;
  detection: Detection | null;
  hint: string | null;
  last: Shot | null;
  reduceMotion: boolean;
  topInset: number;
  bottomInset: number;
  onOpenLast: () => void;
  onDisconnect: () => void;
  commandsOn: boolean; // server supports /api/device/command
  recording: boolean;
  transcribing: boolean;
  asking: string | null; // the pending command's text
  onTalk: () => void;
  onType: (text: string) => void;
}) {
  const [typed, setTyped] = useState("");
  const sendTyped = () => {
    const t = typed.trim();
    if (!t) return;
    setTyped("");
    onType(t);
  };
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = status === "live";
  const eventLine = lastEventAt ? `Last event ${age(now - lastEventAt)}` : live ? "Waiting for the first event" : "";

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[s.root, { paddingTop: topInset + 76, paddingBottom: bottomInset + 12 }]}
    >
      {Platform.OS !== "web" ? <KeepAwake /> : null}
      <View style={s.top}>
        <View style={[s.glyph, commandsOn && s.glyphSmall]} accessible={false}>
          <Icon sf="dot.radiowaves.left.and.right" ion="radio-outline" size={34} />
        </View>
        <Text style={commandsOn ? type.title2 : type.largeTitle} accessibilityRole="header">
          Listening to your hat camera
        </Text>
        <View style={s.statusRow} accessible accessibilityLabel={`${STATUS_TEXT[status]}. Hat ${deviceId}. ${eventLine}`}>
          <View style={[s.dot, live ? s.dotLive : s.dotIdle]} />
          <Text style={[type.headline, { flexShrink: 1 }]}>{STATUS_TEXT[status]}</Text>
        </View>
        <Text style={type.subhead}>
          Hat {deviceId}
          {eventLine ? ` · ${eventLine}` : ""}
        </Text>
      </View>

      <View style={[s.bottom, commandsOn && s.bottomFill]}>
        {hint && !detection ? (
          <View style={s.hint} accessible accessibilityLabel={hint}>
            <Icon sf="viewfinder" ion="scan-outline" size={18} />
            <Text style={[type.callout, { flex: 1, fontWeight: "600" }]}>{hint}</Text>
          </View>
        ) : null}
        <DetectionCard detection={detection} reduceMotion={reduceMotion} />
        {last?.result && !detection && !commandsOn ? (
          <Pressable
            onPress={onOpenLast}
            accessibilityRole="button"
            accessibilityLabel={`Last answer: ${last.result.spokenText}`}
            accessibilityHint="Opens the answer"
            style={({ pressed }) => [s.lastRow, pressed && { backgroundColor: colors.surfacePressed }]}
          >
            {last.photo ? <Image source={{ uri: last.photo.uri }} style={s.thumb} contentFit="cover" /> : null}
            <Text style={[type.subhead, { flex: 1, color: colors.label }]} numberOfLines={2}>
              {last.result.spokenText}
            </Text>
            <Icon sf="chevron.right" ion="chevron-forward" size={15} color={colors.secondary} />
          </Pressable>
        ) : null}
        {commandsOn ? (
          <>
            <Pressable
              onPress={onTalk}
              accessibilityRole="button"
              accessibilityLabel={recording ? "Stop and ask your hat" : "Ask your hat"}
              accessibilityHint={
                recording
                  ? "Stops recording and sends your request to the hat camera"
                  : 'Say what you want, like "read this menu" or "what does this sign say"'
              }
              accessibilityState={{ busy: transcribing }}
              style={({ pressed }) => [s.talk, pressed && { opacity: 0.85 }]}
            >
              {recording ? (
                <View style={s.recRing}>
                  <View style={s.recDot} />
                </View>
              ) : transcribing ? (
                <ActivityIndicator color={colors.onPrimary} size="large" />
              ) : (
                <Icon sf="mic.fill" ion="mic" size={44} color={colors.onPrimary} />
              )}
              <Text style={s.talkTitle} maxFontSizeMultiplier={1.8}>
                {recording ? "Listening…" : transcribing ? "Listening back…" : "Ask your hat"}
              </Text>
              <Text style={s.talkSub} maxFontSizeMultiplier={1.8} numberOfLines={2}>
                {recording
                  ? "Tap when you're done"
                  : asking
                    ? `Asking your hat… “${asking}”`
                    : "Tap and say “read this menu”"}
              </Text>
            </Pressable>
            <View style={s.typeRow}>
              <TextInput
                value={typed}
                onChangeText={setTyped}
                onSubmitEditing={sendTyped}
                placeholder="Type instead"
                placeholderTextColor={colors.secondary}
                returnKeyType="send"
                style={[type.body, s.field]}
                accessibilityLabel="Type a request for your hat camera"
              />
              <IconButton onPress={sendTyped} label="Send to your hat" filled="black" size={52}>
                <Icon sf="arrow.up" ion="arrow-up" color={colors.onPrimary} weight="bold" />
              </IconButton>
            </View>
            <PillButton
              label="Disconnect"
              variant="secondary"
              onPress={onDisconnect}
              accessibilityHint="Stops listening to the hat camera and turns the phone camera back on"
              icon={<Icon sf="xmark.circle.fill" ion="close-circle" size={20} />}
            />
          </>
        ) : (
          <PillButton
            big
            label="Disconnect"
            onPress={onDisconnect}
            accessibilityHint="Stops listening to the hat camera and turns the phone camera back on"
            icon={<Icon sf="xmark.circle.fill" ion="close-circle" size={24} color={colors.onPrimary} />}
          />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, paddingHorizontal: 20, justifyContent: "space-between" },
  top: { gap: 12 },
  glyph: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  dotLive: { backgroundColor: colors.label },
  dotIdle: { backgroundColor: colors.bg, borderWidth: 2, borderColor: colors.label },
  bottom: { gap: 12, flexShrink: 1 },
  bottomFill: { flex: 1, justifyContent: "flex-end", marginTop: 16 },
  glyphSmall: { width: 52, height: 52, borderRadius: 16, marginBottom: 0 },
  talk: {
    minHeight: 220,
    flexGrow: 1,
    borderRadius: 32,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  talkTitle: { fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: 0.3, color: colors.onPrimary },
  talkSub: { fontSize: 17, lineHeight: 22, fontWeight: "500", color: "#D1D1D6", textAlign: "center" },
  recRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.onPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  recDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.record },
  typeRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  field: {
    flex: 1,
    minHeight: 52,
    backgroundColor: colors.surface,
    borderRadius: radius.field,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 16,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
  },
  lastRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    padding: 8,
    paddingRight: 14,
    borderRadius: radius.field,
    backgroundColor: colors.surface,
  },
  thumb: { width: 44, height: 44, borderRadius: 10 },
});
