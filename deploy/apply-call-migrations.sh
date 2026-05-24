#!/usr/bin/env bash
# Apply RealtimeKit call migrations 0021–0023 from repo SQL (not the migrate image).
# Use when drizzle migrate reports success but call_participants is still missing.
# From repo root: ./deploy/apply-call-migrations.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh

MIGRATIONS=(
  services/api/drizzle/0021_calls_realtimekit.sql
  services/api/drizzle/0022_realtimekit_preset_names.sql
  services/api/drizzle/0023_pco_last_synced_at.sql
)

if [[ ! -f .env ]]; then
  echo "Missing .env"
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

url="$(cco_database_normalize_url "${DATABASE_URL:-}")"
if [[ -z "$url" || "$url" == *CHANGE_ME* ]]; then
  echo "Set DATABASE_URL in .env first."
  exit 1
fi

for file in "${MIGRATIONS[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "Missing migration file: $file" >&2
    exit 1
  fi
done

apply_sql() {
  local file="$1"
  echo "Applying $(basename "$file")..."
  if cco_should_use_external_db; then
    docker run --rm -i postgres:18.3-alpine psql "$url" -v ON_ERROR_STOP=1 <"$file"
  else
    local files=()
    cco_compose_files files
    cco_wait_for_bundled_postgres files 60
    docker compose "${files[@]}" exec -T \
      -e PGPASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}" \
      postgres psql -U "${POSTGRES_USER:-cco}" -d "${POSTGRES_DB:-cco}" \
      -v ON_ERROR_STOP=1 <"$file"
  fi
}

if cco_should_use_external_db; then
  echo "Mode: external PostgreSQL"
else
  echo "Mode: bundled PostgreSQL"
fi

for file in "${MIGRATIONS[@]}"; do
  apply_sql "$file"
done

echo ""
echo "Done. Verifying schema..."
exec ./deploy/check-call-schema.sh
