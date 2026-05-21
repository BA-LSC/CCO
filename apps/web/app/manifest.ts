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
    theme_color: "#1d4ed8",
    orientation: "portrait-primary",
  };
}
