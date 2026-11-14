import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import type { Rect } from "../logic/brackets";
import { CAM_YELLOW } from "./CameraChrome";

// Four rounded corner brackets (Live Text style) gliding to the target. Decorative only: hidden
// from VoiceOver. Snaps without animation under Reduce Motion; fades when there's no target.
const ARM = 26;
const STROKE = 3.5;
const RADIUS = 10;

export function Brackets({ rect, visible, reduceMotion }: { rect: Rect | null; visible: boolean; reduceMotion: boolean }) {
  const x = useRef(new Animated.Value(rect?.x ?? 0)).current;
  const y = useRef(new Animated.Value(rect?.y ?? 0)).current;
  const w = useRef(new Animated.Value(rect?.w ?? 0)).current;
  const h = useRef(new Animated.Value(rect?.h ?? 0)).current;
  const opacity = useRef(new Animated.Value(visible && rect ? 1 : 0)).current;
  const placed = useRef(!!rect);

  useEffect(() => {
    if (!rect) return;
    const to = { x: rect.x - 6, y: rect.y - 6, w: rect.w + 12, h: rect.h + 12 };
    if (reduceMotion || !placed.current) {
      x.setValue(to.x);
      y.setValue(to.y);
      w.setValue(to.w);
      h.setValue(to.h);
      placed.current = true;
      return;
    }
    const spring = (v: Animated.Value, toValue: number) =>
      Animated.spring(v, { toValue, useNativeDriver: false, speed: 16, bounciness: 3 });
    Animated.parallel([spring(x, to.x), spring(y, to.y), spring(w, to.w), spring(h, to.h)]).start();
  }, [rect?.x, rect?.y, rect?.w, rect?.h, reduceMotion]);

  useEffect(() => {
    const on = visible && !!rect;
    if (reduceMotion) opacity.setValue(on ? 1 : 0);
    else Animated.timing(opacity, { toValue: on ? 1 : 0, duration: on ? 120 : 260, useNativeDriver: false }).start();
    if (!on) placed.current = false; // next target appears in place instead of flying in
  }, [visible, !!rect, reduceMotion]);

  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { opacity }]}
    >
      <Animated.View style={{ position: "absolute", left: x, top: y, width: w, height: h }}>
        <View style={[s.corner, s.tl]} />
        <View style={[s.corner, s.tr]} />
        <View style={[s.corner, s.bl]} />
        <View style={[s.corner, s.br]} />
      </Animated.View>
    </Animated.View>
  );
}

const base = {
  position: "absolute" as const,
  width: ARM,
  height: ARM,
  borderColor: CAM_YELLOW,
  shadowColor: "#000",
  shadowOpacity: 0.55,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 0 },
};
const s = StyleSheet.create({
  corner: base,
  tl: { left: 0, top: 0, borderLeftWidth: STROKE, borderTopWidth: STROKE, borderTopLeftRadius: RADIUS },
  tr: { right: 0, top: 0, borderRightWidth: STROKE, borderTopWidth: STROKE, borderTopRightRadius: RADIUS },
  bl: { left: 0, bottom: 0, borderLeftWidth: STROKE, borderBottomWidth: STROKE, borderBottomLeftRadius: RADIUS },
  br: { right: 0, bottom: 0, borderRightWidth: STROKE, borderBottomWidth: STROKE, borderBottomRightRadius: RADIUS },
});
