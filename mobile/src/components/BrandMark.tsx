import { Image } from "expo-image";

/** Same Open line vector as the website, rasterized for native image support. */
export function BrandMark({ size = 28, light = false }: { size?: number; light?: boolean }) {
  return (
    <Image
      // Metro requires literal static asset references.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      source={light ? require("../../assets/mark-white.png") : require("../../assets/mark-black.png")}
      style={{ width: size, height: size }}
      contentFit="contain"
      alt=""
      accessible={false}
      accessibilityElementsHidden
    />
  );
}
