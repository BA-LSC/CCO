#!/usr/bin/env bash
# Verify RealtimeKit call tables exist on DATABASE_URL. From repo root: ./deploy/check-call-schema.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh

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

CALL_SCHEMA_SQL="
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'call_participants'
      AND column_name = 'realtime_kit_participant_id'
  ) THEN 'call_participants: OK'
  ELSE 'call_participants: MISSING — run ./deploy/apply-call-migrations.sh (or rebuild migrate: ./deploy/compose.sh build migrate && ./deploy/compose.sh run --rm migrate)'
END;
"

if cco_should_use_external_db; then
  echo "Mode: external PostgreSQL"
  echo "Checking call schema..."
  docker run --rm postgres:18.3-alpine psql "$url" -v ON_ERROR_STOP=1 -At -c "$CALL_SCHEMA_SQL"
else
  echo "Mode: bundled PostgreSQL (host postgres in DATABASE_URL)"
  files=()
  cco_compose_files files
  if ! cco_wait_for_bundled_postgres files 60; then
    exit 1
  fi
  echo "Checking call schema..."
  docker compose "${files[@]}" exec -T \
    -e PGPASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}" \
    postgres psql -U "${POSTGRES_USER:-cco}" -d "${POSTGRES_DB:-cco}" \
    -v ON_ERROR_STOP=1 -At -c "$CALL_SCHEMA_SQL"
fi
