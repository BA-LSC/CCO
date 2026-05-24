#!/usr/bin/env bash
# Test DATABASE_URL before a full deploy. From repo root: ./deploy/check-database.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh

if [[ ! -f .env ]]; then
  echo "Missing .env — copy deploy/.env.production.example or run ./deploy/configure-vultr-db.sh"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

url="${DATABASE_URL:-}"
if [[ -z "$url" || "$url" == *CHANGE_ME* || "$url" == *REPLACE_WITH_* ]]; then
  echo "Set DATABASE_URL in .env first."
  exit 1
fi

normalized="$(cco_database_normalize_url "$url")"
if [[ "$normalized" != "$url" ]]; then
  echo "Note: added sslmode=require for managed PostgreSQL."
  url="$normalized"
fi

if cco_should_use_external_db; then
  echo "Mode: external PostgreSQL (bundled postgres container will not run)."
  echo "Testing connection..."
  if docker run --rm postgres:18.3-alpine psql "$url" -v ON_ERROR_STOP=1 -c 'SELECT 1 AS ok'; then
    echo "Database connection OK."
  else
    echo "Connection failed. For Vultr: same region/VPC, VPC hostname (not public), trusted sources."
    exit 1
  fi
else
  echo "Mode: bundled PostgreSQL container (host postgres in DATABASE_URL)."
  files=()
  cco_compose_files files
  if ! cco_wait_for_bundled_postgres files 120; then
    exit 1
  fi
  echo "Testing connection..."
  if cco_test_bundled_postgres_connection files; then
    echo "Database connection OK."
  else
    echo "Connection failed. Check POSTGRES_PASSWORD and DATABASE_URL in .env."
    exit 1
  fi
fi
