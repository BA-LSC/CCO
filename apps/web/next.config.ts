import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@cco/pco-client", "@cco/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  env: {
    NEXT_PUBLIC_DIRECT_UPLOADS: "1",
    SERVER_API_ORIGIN: (() => {
      const apiUrl = process.env.API_URL?.trim();
      if (apiUrl) {
        return apiUrl.startsWith("http") ? apiUrl.replace(/\/$/, "") : `https://${apiUrl.replace(/\/$/, "")}`;
      }
      const apiDomain = process.env.API_DOMAIN?.trim();
      if (apiDomain) {
        return apiDomain.startsWith("http")
          ? apiDomain.replace(/\/$/, "")
          : `https://${apiDomain.replace(/\/$/, "")}`;
      }
      return "";
    })(),
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }],
      },
      {
        source: "/api/app-version",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

export default nextConfig;
