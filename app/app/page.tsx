import type { Metadata } from "next";
import SightLine from "../components/SightLine";

export const metadata: Metadata = {
  title: "SightLine",
  description: "Point your camera. Hear the world.",
};

export default function AppPage() {
  return <SightLine />;
}
