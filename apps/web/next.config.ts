import path from "node:path";
import { config as loadEnv } from "dotenv";
import type { NextConfig } from "next";

loadEnv({ path: path.resolve(__dirname, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@cco/pco-client", "@cco/shared"],
  outputFileTracingRoot: path.resolve(__dirname, "../.."),
  output: "standalone",
};

export default nextConfig;
