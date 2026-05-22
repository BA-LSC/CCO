import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

const appVersion =
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA ??
  process.env.CCO_BUILD_ID ??
  (process.env.NODE_ENV === "production" ? `build-${Date.now()}` : "dev");

const nextConfig: NextConfig = {
  transpilePackages: ["@cco/pco-client", "@cco/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  output: "standalone",
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
