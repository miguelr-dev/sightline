import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, type } from "../theme";

// iOS-style segmented control. Selected segment: black fill and bold text (shape and weight,
// not just colour), and VoiceOver hears "selected".
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  format = (v) => String(v),
  describe = (v) => String(v),
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  format?: (v: T) => string;
  describe?: (v: T) => string;
}) {
  return (
    <View style={s.track} accessibilityLabel={label}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable
            key={String(o)}
            onPress={() => onChange(o)}
            accessibilityRole="button"
            accessibilityLabel={`${label} ${describe(o)}`}
            accessibilityState={{ selected: on }}
            style={[s.seg, on && s.segOn]}
          >
            <Text
              style={[type.subhead, { color: on ? colors.onPrimary : colors.label, fontWeight: on ? "700" : "500" }]}
              maxFontSizeMultiplier={2}
            >
              {format(o)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: "row",
    flexWrap: "wrap",
    backgroundColor: colors.surface,
    borderRadius: radius.field,
    padding: 3,
    gap: 3,
  },
  seg: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 44,
    minWidth: 64,
    paddingHorizontal: 10,
    borderRadius: radius.field - 3,
    alignItems: "center",
    justifyContent: "center",
  },
  segOn: { backgroundColor: colors.primary },
});
