import { Image } from "expo-image";
import { useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type GestureResponderEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { magnifierScaleForDoubleTap, nextContrast, type Contrast } from "../logic/zoom";
import { Icon } from "./ui";

const CONTRAST_LABEL: Record<Contrast, string> = { normal: "Normal", high: "High contrast", invert: "Inverted" };

// Full-screen photo magnifier. Pinch (1×–8×) and pan come from the iOS scroll view's native
// zoom; double-tap toggles 1×/3× at the tap point; swipe down at 1× or Done closes. Contrast
// modes are drawn with blend-mode overlays (grayscale + self-overlay for high contrast, a white
// "difference" layer for invert), so no image re-processing is needed.
export function Magnifier({
  uri,
  visible,
  reduceMotion,
  onClose,
}: {
  uri: string | null;
  visible: boolean;
  reduceMotion: boolean;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const scroller = useRef<ScrollViewInstance>(null);
  const [scale, setScale] = useState(1);
  const [contrast, setContrast] = useState<Contrast>("normal");
  const lastTap = useRef(0);

  const onTap = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - lastTap.current > 300) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;
    const target = magnifierScaleForDoubleTap(scale);
    const { locationX, locationY } = e.nativeEvent;
    const w = width / target;
    const h = height / target;
    scroller.current?.scrollResponderZoomTo({
      x: Math.max(0, locationX - w / 2),
      y: Math.max(0, locationY - h / 2),
      width: w,
      height: h,
      animated: !reduceMotion,
    });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setScale(e.nativeEvent.zoomScale ?? 1);
  const onEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if ((e.nativeEvent.zoomScale ?? 1) <= 1.01 && e.nativeEvent.contentOffset.y < -90) onClose(); // swipe down at 1×
  };

  if (!uri) return null;
  return (
    <Modal visible={visible} animationType={reduceMotion ? "none" : "fade"} presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={s.root}>
        <ScrollView
          ref={scroller}
          style={StyleSheet.absoluteFill}
          contentContainerStyle={{ width, height }}
          minimumZoomScale={1}
          maximumZoomScale={8}
          bouncesZoom
          alwaysBounceVertical
          centerContent
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={32}
          onScroll={onScroll}
          onScrollEndDrag={onEndDrag}
        >
          <Pressable onPress={onTap} style={{ width, height }} accessible accessibilityRole="image" accessibilityLabel="Photo, magnified">
            <View style={[StyleSheet.absoluteFill, { isolation: "isolate" }]}>
              <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
              {contrast === "high" ? (
                <>
                  {/* the photo blended over itself boosts contrast; then drop the colour */}
                  <Image source={{ uri }} style={[StyleSheet.absoluteFill, { mixBlendMode: "overlay" }]} contentFit="contain" />
                  <View style={[StyleSheet.absoluteFill, { backgroundColor: "#000", mixBlendMode: "saturation" }]} />
                </>
              ) : contrast === "invert" ? (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: "#FFF", mixBlendMode: "difference" }]} />
              ) : null}
            </View>
          </Pressable>
        </ScrollView>

        <View style={[s.bar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Pressable
            onPress={() => setContrast(nextContrast(contrast))}
            accessibilityRole="button"
            accessibilityLabel={`Contrast: ${CONTRAST_LABEL[contrast]}`}
            accessibilityHint="Switches between normal, high contrast and inverted"
            style={({ pressed }) => [s.btn, pressed && { opacity: 0.7 }]}
          >
            <Icon sf="circle.lefthalf.filled" ion="contrast" size={22} color="#FFFFFF" />
            <Text style={s.btnText}>{CONTRAST_LABEL[contrast]}</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Done" style={({ pressed }) => [s.btn, s.done, pressed && { opacity: 0.7 }]}>
            <Text style={[s.btnText, { color: "#000" }]}>Done</Text>
          </Pressable>
        </View>
        <View style={[s.hint, { bottom: insets.bottom + 16 }]} pointerEvents="none">
          <Text style={s.hintText}>{scale > 1.05 ? `${scale.toFixed(1)}×` : "Pinch or double-tap to zoom"}</Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  bar: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    backgroundColor: "rgba(40,40,40,0.85)",
  },
  done: { backgroundColor: "#FFFFFF" },
  btnText: { color: "#FFFFFF", fontSize: 17, fontWeight: "700" },
  hint: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  hintText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    backgroundColor: "rgba(40,40,40,0.85)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    overflow: "hidden",
  },
});
