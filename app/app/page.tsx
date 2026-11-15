import type { Metadata } from "next";
import { Inter_Tight } from "next/font/google";
import SightLine from "../components/SightLine";

// The marketing site's display face, for the start screen's headings.
const display = Inter_Tight({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SightLine",
  description: "Point your camera. Hear the world.",
};

export default function AppPage() {
  return (
    <div className={display.variable}>
      <SightLine />
    </div>
  );
}
