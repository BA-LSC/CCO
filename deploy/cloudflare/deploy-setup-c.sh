#!/usr/bin/env bash
# Deploy the browser install wizard to setup-c.co on Cloudflare.
#
# Prerequisites:
#   - setup-c.co zone on the CCO Cloudflare account (proxied DNS)
#   - CLOUDFLARE_API_TOKEN with Workers + Pages edit
#   - wrangler authenticated (or CLOUDFLARE_API_TOKEN exported)
#   - KV namespace for INSTALL_SESSIONS — set id in workers/install-orchestrator/wrangler.jsonc
#   - wrangler secret put TOKEN_ENCRYPTION_KEY on cco-install-orchestrator
#
# Usage (from repo root):
#   ./deploy/cloudflare/deploy-setup-c.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"

export CLOUDFLARE_API_TOKEN

echo "Building release artifacts (workers + web + D1 baseline)..."
bun deploy/cloudflare/build-release-artifacts.ts

echo "Deploying install orchestrator (setup-c.co/api/*, /releases/*)..."
(cd workers/install-orchestrator && bunx wrangler deploy)

echo "Building install wizard UI (OpenNext)..."
(cd apps/install && bun run build:cloudflare)

echo "Deploying install wizard UI (setup-c.co)..."
(cd apps/install && bunx wrangler deploy)

echo ""
echo "Done. Open https://setup-c.co to run the install wizard."
echo "Release artifacts: https://setup-c.co/releases (bundled on orchestrator deploy)"
