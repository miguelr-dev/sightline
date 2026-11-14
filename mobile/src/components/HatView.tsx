import { useKeepAwake } from "expo-keep-awake";
import { Image } from "expo-image";
import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, type } from "../theme";
import type { Shot } from "../types";
import type { HatStatus } from "../useHatCamera";
import type { Detection } from "../useAutoCapture";
import { DetectionCard } from "./DetectionCard";
import { Icon, PillButton } from "./ui";

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
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const live = status === "live";
  const eventLine = lastEventAt ? `Last event ${age(now - lastEventAt)}` : live ? "Waiting for the first event" : "";

  return (
    <View style={[s.root, { paddingTop: topInset + 76, paddingBottom: bottomInset + 12 }]}>
      {Platform.OS !== "web" ? <KeepAwake /> : null}
      <View style={s.top}>
        <View style={s.glyph} accessible={false}>
          <Icon sf="dot.radiowaves.left.and.right" ion="radio-outline" size={34} />
        </View>
        <Text style={type.largeTitle} accessibilityRole="header">
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

      <View style={s.bottom}>
        {hint && !detection ? (
          <View style={s.hint} accessible accessibilityLabel={hint}>
            <Icon sf="viewfinder" ion="scan-outline" size={18} />
            <Text style={[type.callout, { flex: 1, fontWeight: "600" }]}>{hint}</Text>
          </View>
        ) : null}
        <DetectionCard detection={detection} reduceMotion={reduceMotion} />
        {last?.result && !detection ? (
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
        <PillButton
          big
          label="Disconnect"
          onPress={onDisconnect}
          accessibilityHint="Stops listening to the hat camera and turns the phone camera back on"
          icon={<Icon sf="xmark.circle.fill" ion="close-circle" size={24} color={colors.onPrimary} />}
        />
      </View>
    </View>
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
  bottom: { gap: 12 },
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
