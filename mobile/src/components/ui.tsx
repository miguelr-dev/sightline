import Ionicons from "@expo/vector-icons/Ionicons";
import { SymbolView, type SFSymbol } from "expo-symbols";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type AccessibilityRole,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, MIN_TARGET, radius, type } from "../theme";

type IonName = ComponentProps<typeof Ionicons>["name"];

// SF Symbols on iOS; Ionicons only as the fallback for web screenshots.
export function Icon({
  sf,
  ion,
  size = 22,
  color = colors.label,
  weight = "semibold",
}: {
  sf: SFSymbol;
  ion: IonName;
  size?: number;
  color?: string;
  weight?: "regular" | "medium" | "semibold" | "bold";
}) {
  return (
    <SymbolView
      name={sf}
      size={size}
      tintColor={color}
      weight={weight}
      fallback={<Ionicons name={ion} size={size} color={color} />}
      style={{ width: size, height: size }}
    />
  );
}

export function PillButton({
  label,
  onPress,
  variant = "primary",
  icon,
  busy,
  disabled,
  big,
  style,
  accessibilityLabel,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary";
  icon?: ReactNode;
  busy?: boolean;
  disabled?: boolean;
  big?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
}) {
  const primary = variant === "primary";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      style={({ pressed }) => [
        s.pill,
        big && s.pillBig,
        {
          backgroundColor: primary
            ? pressed
              ? colors.primaryPressed
              : colors.primary
            : pressed
              ? colors.surfacePressed
              : colors.surface,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={primary ? colors.onPrimary : colors.label} /> : icon}
      <Text
        style={[big ? s.pillTextBig : type.headline, { color: primary ? colors.onPrimary : colors.label }]}
        maxFontSizeMultiplier={2}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function IconButton({
  onPress,
  label,
  children,
  filled = "white",
  size = MIN_TARGET,
  role = "button",
  selected,
  hint,
}: {
  onPress: () => void;
  label: string;
  children: ReactNode;
  filled?: "white" | "surface" | "black";
  size?: number;
  role?: AccessibilityRole;
  selected?: boolean;
  hint?: string;
}) {
  const bg = filled === "black" ? colors.primary : filled === "surface" ? colors.surface : colors.bg;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={8}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg, opacity: pressed ? 0.7 : 1 },
        s.center,
      ]}
    >
      {children}
    </Pressable>
  );
}

export function Hairline() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline }} />;
}

const s = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center" },
  pill: {
    minHeight: 50,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  pillBig: { minHeight: 76, paddingVertical: 16 },
  pillTextBig: { fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.26 },
});
