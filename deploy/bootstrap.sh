#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh

if [[ ! -f .env ]]; then
  cp deploy/.env.production.example .env
  echo "Created .env from deploy/.env.production.example — edit it before continuing."
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

normalized_url="$(cco_database_normalize_url "${DATABASE_URL:-}")"
if [[ -n "$normalized_url" && "$normalized_url" != "${DATABASE_URL:-}" ]]; then
  cco_env_upsert "DATABASE_URL" "$normalized_url" .env
  echo "Updated DATABASE_URL in .env (added sslmode=require for managed PostgreSQL)."
fi
export DATABASE_URL="$normalized_url"

files=()
cco_compose_files files
COMPOSE=(docker compose "${files[@]}")

missing=()
for key in SESSION_SECRET TOKEN_ENCRYPTION_KEY CCO_DOMAIN API_DOMAIN REDIS_PASSWORD CLOUDFLARE_TUNNEL_TOKEN; do
  val="${!key:-}"
  if [[ -z "$val" || "$val" == CHANGE_ME* ]]; then
    missing+=("$key")
  fi
done

if cco_should_use_external_db; then
  db_url="${DATABASE_URL:-}"
  if [[ -z "$db_url" || "$db_url" == *CHANGE_ME* || "$db_url" == *@postgres:* ]]; then
    missing+=("DATABASE_URL (external VPC host — use ./deploy/configure-vultr-db.sh)")
  fi
else
  for key in POSTGRES_PASSWORD; do
    val="${!key:-}"
    if [[ -z "$val" || "$val" == CHANGE_ME* ]]; then
      missing+=("$key")
    fi
  done
fi

if ((${#missing[@]} > 0)); then
  echo "Missing or placeholder values in .env:"
  printf '  - %s\n' "${missing[@]}"
  echo ""
  echo "Run the guided wizard: ./deploy/install.sh"
  exit 1
fi

if cco_should_use_external_db; then
  echo "External PostgreSQL detected — testing connection..."
  if ! docker run --rm postgres:18-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
    echo "Database connection failed. Fix DATABASE_URL or VPC, then run: ./deploy/check-database.sh"
    exit 1
  fi
  echo "  Connection OK. Bundled postgres container will be skipped."
fi

echo "Building and starting CCO production stack..."
"${COMPOSE[@]}" up -d --build

echo ""
echo "Waiting for services..."
sleep 5
"${COMPOSE[@]}" ps

echo ""
echo "Deployment started."
echo "  Web: https://${CCO_DOMAIN}"
echo "  API: https://${API_DOMAIN}"
echo ""
echo "Next steps:"
echo "  1. Confirm cloudflared is connected: ./deploy/compose.sh logs cloudflared"
echo "  2. Open https://${CCO_DOMAIN}/setup and enter Planning Center OAuth credentials."
echo "  3. Configure PCO webhooks at https://${API_DOMAIN}/webhooks/pco (optional)."
echo ""
echo "Docker Compose shortcut: ./deploy/compose.sh <args>"
