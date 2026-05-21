import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const standaloneApp = join(webRoot, ".next/standalone/apps/web");
const staticSrc = join(webRoot, ".next/static");
const staticDest = join(standaloneApp, ".next/static");
const publicSrc = join(webRoot, "public");
const publicDest = join(standaloneApp, "public");

if (!existsSync(standaloneApp)) {
  console.warn("[prepare-standalone] No standalone output — skipping.");
  process.exit(0);
}

if (!existsSync(staticSrc)) {
  console.error("[prepare-standalone] Missing .next/static. Run `next build` first.");
  process.exit(1);
}

mkdirSync(join(standaloneApp, ".next"), { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });

if (existsSync(publicSrc)) {
  cpSync(publicSrc, publicDest, { recursive: true });
}

console.log("[prepare-standalone] Copied static assets into standalone output.");
