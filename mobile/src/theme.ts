import { Platform, StyleSheet } from "react-native";

// One white, Apple-style palette. Every text colour here passes WCAG AA on white
// (and on `surface`), so there is no light-grey body text anywhere.
export const colors = {
  bg: "#FFFFFF",
  label: "#000000",
  secondary: "#55555A", // 7.4:1 on white, 6.7:1 on surface
  surface: "#F2F2F7", // iOS systemGroupedBackground
  surfacePressed: "#E5E5EA",
  hairline: "#C6C6C8",
  primary: "#000000", // black pill buttons
  primaryPressed: "#2C2C2E",
  onPrimary: "#FFFFFF",
  record: "#D70015", // the only accent: recording / listening (5.6:1 on white)
  scrim: "rgba(0,0,0,0.35)",
};

export const radius = { sheet: 28, card: 20, pill: 999, field: 14 };

export const hairline = StyleSheet.hairlineWidth;

// iOS text styles (HIG default sizes at the Large content size). React Native scales them
// with Dynamic Type because allowFontScaling is on by default; we never turn it off.
const family = Platform.select({ web: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif", default: undefined });
export const type = StyleSheet.create({
  largeTitle: { fontFamily: family, fontSize: 34, lineHeight: 41, fontWeight: "700", letterSpacing: 0.37, color: colors.label },
  title2: { fontFamily: family, fontSize: 22, lineHeight: 28, fontWeight: "600", letterSpacing: -0.26, color: colors.label },
  title3: { fontFamily: family, fontSize: 20, lineHeight: 25, fontWeight: "600", letterSpacing: -0.45, color: colors.label },
  headline: { fontFamily: family, fontSize: 17, lineHeight: 22, fontWeight: "600", letterSpacing: -0.43, color: colors.label },
  body: { fontFamily: family, fontSize: 17, lineHeight: 24, fontWeight: "400", letterSpacing: -0.43, color: colors.label },
  callout: { fontFamily: family, fontSize: 16, lineHeight: 21, fontWeight: "400", letterSpacing: -0.31, color: colors.label },
  subhead: { fontFamily: family, fontSize: 15, lineHeight: 20, fontWeight: "400", letterSpacing: -0.23, color: colors.secondary },
  footnote: { fontFamily: family, fontSize: 13, lineHeight: 18, fontWeight: "400", letterSpacing: -0.08, color: colors.secondary },
  caption: { fontFamily: family, fontSize: 13, lineHeight: 18, fontWeight: "600", letterSpacing: 0.4, color: colors.secondary, textTransform: "uppercase" },
});

export const MIN_TARGET = 44;
