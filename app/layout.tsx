import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SightLine",
  description:
    "Point your camera. Hear the world. An AI accessibility copilot for blind and low-vision users.",
  applicationName: "SightLine",
  openGraph: {
    title: "SightLine: Point. Hear. Know.",
    description:
      "An AI copilot for blind and low-vision people. Point your phone at a menu, medicine or sign and hear what matters.",
    type: "website",
    siteName: "SightLine",
  },
  twitter: { card: "summary_large_image" },
  appleWebApp: { capable: true, title: "SightLine", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Zoom stays enabled: low-vision users rely on pinch zoom.
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
