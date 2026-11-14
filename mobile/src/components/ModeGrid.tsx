import { Pressable, StyleSheet, Text, View } from "react-native";
import { MODES, MODE_LABELS, type Mode } from "../modes";
import { colors, radius, type } from "../theme";
import { Icon } from "./ui";

// Four large tiles in a 2 x 2 grid. The selected tile is filled black, set in bold and carries a
// checkmark, so selection never relies on colour alone. Text wraps at large Dynamic Type sizes.
export function ModeGrid({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <View style={s.grid} accessibilityLabel="Mode">
      {MODES.map((m) => {
        const on = m === mode;
        return (
          <Pressable
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityLabel={`${MODE_LABELS[m]} mode`}
            accessibilityState={{ selected: on }}
            style={({ pressed }) => [
              s.tile,
              { backgroundColor: on ? colors.primary : pressed ? colors.surfacePressed : colors.surface },
            ]}
          >
            {on ? <Icon sf="checkmark" ion="checkmark" size={15} color={colors.onPrimary} weight="bold" /> : null}
            <Text
              style={[type.headline, { color: on ? colors.onPrimary : colors.label, fontWeight: on ? "700" : "500" }]}
              maxFontSizeMultiplier={2.2}
            >
              {MODE_LABELS[m]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    minHeight: 50,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.field,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
});
