#!/usr/bin/env bash
# Build esbuild/wrangler bundles for all CCO Cloudflare Workers (install + BYO release apply).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="${ROOT}/deploy/cloudflare/bundles"
mkdir -p "$OUT"

echo "Building @cco/cloudflare-provision..."
(cd "${ROOT}/packages/cloudflare-provision" && bun run build)

build_worker() {
  local script_name="$1"
  local worker_dir="$2"
  local tmp
  tmp="$(mktemp -d)"
  echo "Building ${script_name} from ${worker_dir}..."
  (cd "${ROOT}/${worker_dir}" && bunx wrangler deploy --dry-run --outdir "$tmp" >/dev/null)
  cp "$tmp/index.js" "${OUT}/${script_name}.mjs"
  rm -rf "$tmp"
  echo "  -> ${OUT}/${script_name}.mjs"
}

build_worker cco-api workers/cco-api
build_worker cco-realtime-fanout workers/cco-realtime
build_worker cco-pco-webhook workers/pco-webhook
build_worker cco-push-consumer workers/push-consumer
build_worker cco-reconcile-cron workers/reconcile-cron

echo "Worker bundles ready in ${OUT}"
