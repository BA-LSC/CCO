import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CCO — Chat Center Online",
    short_name: "CCO",
    description:
      "Chat Center Online — Planning Center groups messaging for your church community",
    start_url: "/",
    display: "standalone",
    background_color: "#090b10",
    theme_color: "#111620",
    orientation: "portrait-primary",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
