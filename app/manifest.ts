import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JAKOV360 · ImportPilot AI",
    short_name: "JAKOV360",
    description: "Supplier search, landed-cost comparison and buying decisions for international procurement.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f7f5",
    theme_color: "#0b5f41",
    icons: [
      {
        src: "/pwa-icon-192",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/pwa-icon-512",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
