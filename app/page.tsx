import type { Metadata, Viewport } from "next";
import { Landing } from "./components/landing/Landing";
import "./components/landing/landing.css";

export const metadata: Metadata = {
  title: "SightLine: point your phone, hear what matters",
  description:
    "An AI copilot for blind and low-vision people. Point your phone at a menu, a medicine box or a sign, and hear a short answer in a natural voice, with recalls and nutrition from the web.",
};

// The landing page is white; the /app tool keeps the layout's dark theme.
export const viewport: Viewport = {
  themeColor: "#ffffff",
  colorScheme: "light",
};

export default function Home() {
  return <Landing />;
}
