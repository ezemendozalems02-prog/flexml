import type { MetadataRoute } from "next";
import { branding } from "@/config/branding";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: branding.name,
    short_name: branding.shortName,
    description: branding.tagline,
    start_url: "/driver",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#0f172a",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
