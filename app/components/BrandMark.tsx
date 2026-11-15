import { path } from "@/lib/brand.json";

/** Approved Open line symbol. Decorative beside the visible SightLine name. */
export function BrandMark({ size = 32, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <path d={path} fill={color} />
    </svg>
  );
}
