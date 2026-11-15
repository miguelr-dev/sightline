import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SightLine",
    short_name: "SightLine",
    description: "Point your camera. Hear the world.",
    start_url: "/app",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["accessibility", "utilities"],
    icons: [
      { src: "/icons/icon-192.png?v=open-line-1", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png?v=open-line-1", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png?v=open-line-1", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
