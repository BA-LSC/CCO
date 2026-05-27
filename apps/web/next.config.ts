import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@cco/pco-client", "@cco/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  output: "standalone",
  env:
    process.env.CCO_DEPLOY_TARGET === "cloudflare"
      ? {
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
        }
      : undefined,
  // VPS Docker: proxy.ts streams multipart uploads to the API (up to 100MB).
  // Cloudflare Pages uses presigned R2 PUT — no large body proxy (see build:cloudflare).
  experimental:
    process.env.CCO_DEPLOY_TARGET === "cloudflare"
      ? {}
      : { proxyClientMaxBodySize: "100mb" },
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
