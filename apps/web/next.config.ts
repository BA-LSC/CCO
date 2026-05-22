import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";
import { resolveAppBuildVersion } from "./lib/build-version";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

const appVersion = resolveAppBuildVersion();

const nextConfig: NextConfig = {
  transpilePackages: ["@cco/pco-client", "@cco/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  output: "standalone",
  // proxy.ts runs for /api/v1/*; Next.js buffers those bodies (default 10MB).
  experimental: {
    proxyClientMaxBodySize: "100mb",
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
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
