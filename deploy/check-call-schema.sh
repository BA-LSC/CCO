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

echo "Checking call schema on DATABASE_URL..."
docker run --rm postgres:18.3-alpine psql "$url" -v ON_ERROR_STOP=1 -At -c "
SELECT CASE
  WHEN EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'call_participants'
      AND column_name = 'realtime_kit_participant_id'
  ) THEN 'call_participants: OK'
  ELSE 'call_participants: MISSING — run ./deploy/compose.sh run --rm migrate'
END;
"
