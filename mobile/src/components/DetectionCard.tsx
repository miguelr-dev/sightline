import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { MODE_LABELS } from "../modes";
import { colors, radius, type } from "../theme";
import type { Detection } from "../useAutoCapture";
import { Icon } from "./ui";

// "Menu detected · Tap to read". One big button that slides up above Capture while auto mode sees
// something, and fades out when it's gone. Keeps showing the last label during the fade.
export function DetectionCard({
  detection,
  reduceMotion,
  onPress,
}: {
  detection: Detection | null;
  reduceMotion: boolean;
  onPress: () => void;
}) {
  const [shown, setShown] = useState<Detection | null>(detection);
  const anim = useRef(new Animated.Value(detection ? 1 : 0)).current;

  useEffect(() => {
    if (detection) {
      setShown(detection);
      if (reduceMotion) anim.setValue(1);
      else Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 4 }).start();
      return;
    }
    if (reduceMotion) {
      anim.setValue(0);
      setShown(null);
      return;
    }
    Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: true }).start(({ finished }) => {
      if (finished) setShown(null);
    });
  }, [detection, reduceMotion, anim]);

  if (!shown) return null;
  const mode = shown.mode ? MODE_LABELS[shown.mode] : null;
  const title = shown.label;
  const spoken = /detected$/i.test(title) ? title : `${title} detected`;
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      <Pressable
        onPress={onPress}
        disabled={!detection}
        accessibilityRole="button"
        accessibilityLabel={`${spoken}${mode ? `, ${mode}` : ""}`}
        accessibilityHint="Reads it now"
        style={({ pressed }) => [s.card, pressed && { opacity: 0.85 }]}
      >
        <View style={s.badge}>
          <Icon sf="viewfinder" ion="scan-outline" size={22} color={colors.onPrimary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[type.title3, { color: colors.onPrimary }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={[type.subhead, { color: "#D1D1D6" }]}>
            Tap to read{mode ? ` · ${mode}` : ""}
          </Text>
        </View>
        <Icon sf="arrow.right.circle.fill" ion="arrow-forward-circle" size={30} color={colors.onPrimary} />
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  card: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingLeft: 14,
    paddingRight: 16,
    borderRadius: radius.card,
    backgroundColor: "#1C1C1E",
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#3A3A3C",
    alignItems: "center",
    justifyContent: "center",
  },
});
