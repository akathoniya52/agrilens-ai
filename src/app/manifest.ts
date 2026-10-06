import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AgriLens AI",
    short_name: "AgriLens",
    description: "AI crop doctor: diagnose plant diseases, track fields and get weather-aware advice.",
    id: "/",
    start_url: "/chat",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0f0c",
    theme_color: "#0b0f0c",
    categories: ["productivity", "utilities", "education"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ask AgriLens", url: "/chat" },
      { name: "My farms", url: "/farms" },
      { name: "Dashboard", url: "/dashboard" },
    ],
  };
}
