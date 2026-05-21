#!/usr/bin/env bash
# Run docker compose with the correct files for your DATABASE_URL (bundled vs external).
# Usage (from repo root): ./deploy/compose.sh ps
#                        ./deploy/compose.sh --profile jobs run --rm reconcile
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  export DATABASE_URL="$(cco_database_normalize_url "${DATABASE_URL:-}")"
fi

files=()
cco_compose_files files
exec docker compose "${files[@]}" "$@"
