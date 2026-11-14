import { useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import type { Section } from "../modes";
import { colors, type } from "../theme";
import { Icon } from "./ui";

// Apple-style disclosure rows: title and chevron, collapsed by default, body underneath.
// VoiceOver hears "Nutrition, button, collapsed" and "expanded" after a double-tap.
export function SectionList({
  sections,
  reduceMotion,
  inset = false,
}: {
  sections: Section[];
  reduceMotion: boolean;
  inset?: boolean; // inside a grey card: rules use the card's padding
}) {
  if (!sections.length) return null;
  return (
    <View style={[s.list, inset && s.inset]}>
      {sections.map((sec, i) => (
        <Disclosure key={`${sec.title}-${i}`} section={sec} first={i === 0} reduceMotion={reduceMotion} />
      ))}
    </View>
  );
}

function Disclosure({ section, first, reduceMotion }: { section: Section; first: boolean; reduceMotion: boolean }) {
  const [open, setOpen] = useState(false);
  const toggle = () => {
    if (!reduceMotion && Platform.OS === "ios") {
      LayoutAnimation.configureNext(LayoutAnimation.create(200, "easeInEaseOut", "opacity"));
    }
    setOpen((o) => !o);
  };
  return (
    <View style={[!first && s.rule]}>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityLabel={section.title}
        accessibilityHint={open ? "Hides this section" : "Shows this section"}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [s.row, pressed && { opacity: 0.55 }]}
      >
        <Text style={[type.headline, { flex: 1 }]}>{section.title}</Text>
        <Icon
          sf={open ? "chevron.up" : "chevron.down"}
          ion={open ? "chevron-up" : "chevron-down"}
          size={15}
          color={colors.secondary}
          weight="semibold"
        />
      </Pressable>
      {open ? (
        <Text style={[type.body, s.body]} selectable>
          {section.body}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  list: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  inset: { borderBottomWidth: 0 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 52, paddingVertical: 12 },
  body: { paddingBottom: 16 },
});
