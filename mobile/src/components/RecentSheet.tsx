import { Image } from "expo-image";
import type { SFSymbol } from "expo-symbols";
import type { ComponentProps } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MODE_LABELS, type Mode, type Scan } from "../modes";
import { colors, MIN_TARGET, radius, type } from "../theme";
import { Icon } from "./ui";

const GLYPH: Record<Mode, { sf: SFSymbol; ion: ComponentProps<typeof Ionicons>["name"] }> = {
  read: { sf: "text.alignleft", ion: "reader-outline" },
  describe: { sf: "eye", ion: "eye-outline" },
  menu: { sf: "list.bullet.rectangle", ion: "list-outline" },
  translate: { sf: "character.bubble", ion: "language-outline" },
};

export function timeAgo(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d} days ago`;
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function Thumb({ scan }: { scan: Scan }) {
  if (scan.image) {
    return <Image source={{ uri: scan.image }} style={s.thumb} contentFit="cover" accessible={false} />;
  }
  const g = GLYPH[scan.mode];
  return (
    <View style={[s.thumb, s.glyph]} accessible={false}>
      <Icon sf={g.sf} ion={g.ion} size={22} />
    </View>
  );
}

export function RecentSheet({
  visible,
  scans,
  loading,
  reduceMotion,
  onOpen,
  onClose,
}: {
  visible: boolean;
  scans: Scan[] | null;
  loading: boolean;
  reduceMotion: boolean;
  onOpen: (scan: Scan) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType={reduceMotion ? "none" : "slide"} onRequestClose={onClose}>
      <View style={s.root}>
        <View style={s.header}>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" hitSlop={8} style={s.done}>
            <Text style={[type.headline, { fontWeight: "700" }]}>Done</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}>
          <Text style={type.largeTitle} accessibilityRole="header">
            Recent
          </Text>
          {loading && !scans ? (
            <View style={s.empty} accessible accessibilityLabel="Loading recent scans">
              <ActivityIndicator color={colors.label} />
            </View>
          ) : !scans?.length ? (
            <View style={s.empty}>
              <Text style={type.headline}>No scans yet</Text>
              <Text style={[type.subhead, { textAlign: "center" }]}>Things you capture show up here.</Text>
            </View>
          ) : (
            <View>
              {scans.map((scan, i) => {
                const when = timeAgo(scan.createdAt);
                return (
                  <Pressable
                    key={scan.id}
                    onPress={() => onOpen(scan)}
                    accessibilityRole="button"
                    accessibilityLabel={`${scan.title}. ${MODE_LABELS[scan.mode]}${when ? `, ${when}` : ""}`}
                    accessibilityHint="Opens this scan"
                    style={({ pressed }) => [s.row, i > 0 && s.rule, pressed && { opacity: 0.6 }]}
                  >
                    <Thumb scan={scan} />
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={type.headline} numberOfLines={2}>
                        {scan.title}
                      </Text>
                      <Text style={type.footnote}>
                        {MODE_LABELS[scan.mode]}
                        {when ? ` · ${when}` : ""}
                      </Text>
                    </View>
                    <Icon sf="chevron.right" ion="chevron-forward" size={14} color={colors.secondary} />
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "flex-end", paddingHorizontal: 8, paddingTop: 10, minHeight: 56 },
  done: { minHeight: MIN_TARGET, minWidth: MIN_TARGET, paddingHorizontal: 12, justifyContent: "center", alignItems: "center" },
  content: { paddingHorizontal: 20, gap: 16 },
  empty: { alignItems: "center", gap: 6, paddingVertical: 48 },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 12 },
  rule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.hairline },
  thumb: { width: 52, height: 52, borderRadius: 12, backgroundColor: colors.surface },
  glyph: { alignItems: "center", justifyContent: "center" },
});
