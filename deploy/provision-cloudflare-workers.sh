#!/usr/bin/env bash
# Build worker bundles and upload them to the org Cloudflare account via REST API.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

: "${CLOUDFLARE_API_TOKEN:?Set CLOUDFLARE_API_TOKEN}"
: "${CF_INTERNAL_SECRET:?Set CF_INTERNAL_SECRET (shared with VPS/API internal routes)}"
: "${API_DOMAIN:?Set API_DOMAIN}"

echo "Building worker bundles..."
bash ./deploy/cloudflare/build-worker-bundles.sh

echo "Uploading worker bundles to Cloudflare..."
bun ./deploy/cloudflare/upload-worker-bundles.ts

echo "Workers deployed. Configure routes via integrations provisioning or run ensureCcoApiWorkerRoutes."
