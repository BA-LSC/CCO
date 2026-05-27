#!/usr/bin/env node
/**
 * OpenNext does not support Next.js 16 proxy.ts yet — swap proxy ↔ middleware for Cloudflare builds.
 * Usage: node scripts/prepare-opennext.mjs hide|restore
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(root, "..");
const proxyPath = path.join(appRoot, "proxy.ts");
const proxyBackup = path.join(appRoot, "proxy.standalone.ts.bak");
const middlewarePath = path.join(appRoot, "middleware.ts");
const middlewareTemplate = path.join(root, "middleware.opennext.ts");
const action = process.argv[2];

if (action === "hide") {
  if (fs.existsSync(proxyPath) && !fs.existsSync(proxyBackup)) {
    fs.renameSync(proxyPath, proxyBackup);
    console.log("prepare-opennext: moved proxy.ts aside for OpenNext build");
  }
  if (!fs.existsSync(middlewarePath) && fs.existsSync(middlewareTemplate)) {
    fs.copyFileSync(middlewareTemplate, middlewarePath);
    console.log("prepare-opennext: created middleware.ts for OpenNext build");
  }
} else if (action === "restore") {
  if (fs.existsSync(middlewarePath)) {
    fs.unlinkSync(middlewarePath);
    console.log("prepare-opennext: removed middleware.ts after OpenNext build");
  }
  if (fs.existsSync(proxyBackup) && !fs.existsSync(proxyPath)) {
    fs.renameSync(proxyBackup, proxyPath);
    console.log("prepare-opennext: restored proxy.ts for standalone builds");
  }
} else {
  console.error("Usage: prepare-opennext.mjs hide|restore");
  process.exit(1);
}
