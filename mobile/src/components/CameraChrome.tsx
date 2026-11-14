import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { MODES, type Mode } from "../modes";
import { MIN_TARGET } from "../theme";
import { Icon } from "./ui";

// iOS Camera-style controls drawn over the full-bleed viewfinder. Text sits on blur or a dark
// scrim so it stays legible over any image.

export const CAM_YELLOW = "#FFD60A"; // iOS Camera's selected-mode yellow (paired with bold + dot)

const SHORT: Record<Mode, string> = { read: "READ", describe: "DESCRIBE", menu: "MENU", translate: "TRANSLATE" };
const SPOKEN: Record<Mode, string> = { read: "Read", describe: "Describe", menu: "Menu", translate: "Translate" };

/** Frosted, rounded surface. Light blur with dark text; falls back to translucent white. */
export function Frost({ children, style, dark }: { children: ReactNode; style?: StyleProp<ViewStyle>; dark?: boolean }) {
  return (
    <View style={[f.frost, style]}>
      <BlurView
        intensity={dark ? 40 : 70}
        tint={dark ? "dark" : "light"}
        style={StyleSheet.absoluteFill}
      />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.55)" }]} />
      {children}
    </View>
  );
}

/** Small round translucent button for the top of the camera. */
export function CamButton({
  label,
  onPress,
  onLongPress,
  children,
  on,
  role = "button",
  hint,
}: {
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  children: ReactNode;
  on?: boolean; // switch state (filled white when on)
  role?: "button" | "switch";
  hint?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={600}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={role === "switch" ? { checked: !!on } : undefined}
      hitSlop={6}
      style={({ pressed }) => [f.camButton, on && f.camButtonOn, pressed && { opacity: 0.7 }]}
    >
      {children}
    </Pressable>
  );
}

/** Horizontal mode strip above the shutter. VoiceOver: one adjustable element (swipe up/down). */
export function ModeStrip({
  mode,
  onChange,
  language,
  onLanguage,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  language: string;
  onLanguage: () => void;
}) {
  const i = MODES.indexOf(mode);
  return (
    <View style={f.stripWrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={f.strip}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Mode"
        accessibilityValue={{ text: `${SPOKEN[mode]}, ${i + 1} of ${MODES.length}` }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === "increment" && i < MODES.length - 1) onChange(MODES[i + 1]);
          if (e.nativeEvent.actionName === "decrement" && i > 0) onChange(MODES[i - 1]);
        }}
      >
        {MODES.map((m) => {
          const sel = m === mode;
          return (
            <Pressable key={m} onPress={() => onChange(m)} style={f.modeItem} hitSlop={4}>
              <Text style={[f.modeText, sel && f.modeTextOn]} maxFontSizeMultiplier={1.5}>
                {SHORT[m]}
              </Text>
              <View style={[f.modeDot, sel && f.modeDotOn]} />
            </Pressable>
          );
        })}
      </ScrollView>
      {mode === "translate" ? (
        <Pressable
          onPress={onLanguage}
          accessibilityRole="button"
          accessibilityLabel={`Translate to ${language}`}
          accessibilityHint="Changes the language"
          style={({ pressed }) => [f.langPill, pressed && { opacity: 0.7 }]}
        >
          <Text style={f.langText} maxFontSizeMultiplier={1.5}>
            → {language}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Big round white shutter, iOS style. */
export function Shutter({ onPress, busy, disabled, label }: { onPress: () => void; busy: boolean; disabled?: boolean; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy, disabled: !!disabled }}
      style={({ pressed }) => [f.shutterRing, (disabled || busy) && { opacity: 0.6 }]}
    >
      {({ pressed }) => <View style={[f.shutterCore, pressed && { transform: [{ scale: 0.92 }] }, busy && f.shutterBusy]} />}
    </Pressable>
  );
}

/** Rounded thumbnail of the last result (or a library button when there is none). */
export function LastThumb({
  uri,
  label,
  hint,
  onPress,
  actions,
  onAction,
}: {
  uri: string | null;
  label: string;
  hint?: string;
  onPress: () => void;
  actions?: { name: string; label: string }[];
  onAction?: (name: string) => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityActions={actions}
      onAccessibilityAction={(e) => onAction?.(e.nativeEvent.actionName)}
      style={({ pressed }) => [f.thumbBox, pressed && { opacity: 0.7 }]}
    >
      {uri ? (
        <Image source={{ uri }} style={f.thumbImg} contentFit="cover" accessible={false} />
      ) : (
        <Icon sf="photo.on.rectangle" ion="images-outline" size={24} color="#FFFFFF" />
      )}
    </Pressable>
  );
}

const f = StyleSheet.create({
  frost: { overflow: "hidden", borderRadius: 24 },
  camButton: {
    minWidth: MIN_TARGET,
    height: MIN_TARGET,
    borderRadius: MIN_TARGET / 2,
    paddingHorizontal: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  camButtonOn: { backgroundColor: "#FFFFFF" },
  stripWrap: { alignItems: "center", gap: 6 },
  strip: { paddingHorizontal: 16, gap: 18, alignItems: "center", justifyContent: "center", flexGrow: 1 },
  modeItem: { minHeight: MIN_TARGET, justifyContent: "center", alignItems: "center", gap: 3 },
  modeText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "600",
    letterSpacing: 1.2,
    textShadowColor: "rgba(0,0,0,0.6)",
    textShadowRadius: 3,
  },
  modeTextOn: { color: CAM_YELLOW, fontWeight: "800" },
  modeDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: "transparent" },
  modeDotOn: { backgroundColor: CAM_YELLOW },
  langPill: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
  },
  langText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  shutterRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterCore: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#FFFFFF" },
  shutterBusy: { backgroundColor: "rgba(255,255,255,0.5)" },
  thumbBox: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbImg: { width: "100%", height: "100%" },
});

