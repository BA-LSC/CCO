#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh
# shellcheck disable=SC1091
source deploy/lib/cloudflare-tunnel.sh
# shellcheck disable=SC1091
source deploy/lib/env.sh

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

if [[ -n "${CCO_DOMAIN:-}" && -n "${API_DOMAIN:-}" ]]; then
  cco_env_apply_domains "$CCO_DOMAIN" "$API_DOMAIN" .env
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "Updated derived URLs in .env (PUBLIC_UPLOAD_URL, WEB_URL, NEXT_PUBLIC_*)."
fi

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
  if ! docker run --rm postgres:18.3-alpine psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1; then
    echo "Database connection failed. Fix DATABASE_URL or VPC, then run: ./deploy/check-database.sh"
    exit 1
  fi
  echo "  Connection OK. Bundled postgres container will be skipped."
fi

cco_stop_setup_connector

DEPLOY_DRAIN_WAIT_SEC="${DEPLOY_DRAIN_WAIT_SEC:-8}"
DEPLOY_DRAINING_TTL_SEC="${DEPLOY_DRAINING_TTL_SEC:-600}"

ensure_deploy_signal_services() {
  # Keep the previous stack reachable so /health can report draining during build/migrate.
  "${COMPOSE[@]}" up -d redis api >/dev/null 2>&1 || true
  for _ in $(seq 1 20); do
    if "${COMPOSE[@]}" exec -T redis redis-cli -a "${REDIS_PASSWORD}" ping 2>/dev/null | grep -q PONG; then
      return 0
    fi
    sleep 1
  done
  echo "  Warning: redis is not reachable — clients may not see the update screen." >&2
}

mark_deploy_draining() {
  echo "  Signaling connected clients to show the update screen..."
  if ! "${COMPOSE[@]}" exec -T redis redis-cli -a "${REDIS_PASSWORD}" SET cco:deploy:draining 1 EX "${DEPLOY_DRAINING_TTL_SEC}" >/dev/null 2>&1; then
    echo "  Warning: could not set deploy draining flag in redis." >&2
    return 1
  fi
}

clear_deploy_draining() {
  "${COMPOSE[@]}" exec -T redis redis-cli -a "${REDIS_PASSWORD}" DEL cco:deploy:draining >/dev/null 2>&1 || true
}

trap 'clear_deploy_draining || true' EXIT

clear_deploy_draining

echo "Building CCO production images..."
CCO_BUILD_ID="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || date +%s)"
export CCO_BUILD_ID
cco_env_upsert "CCO_BUILD_ID" "$CCO_BUILD_ID" .env
echo "  Web build id: ${CCO_BUILD_ID}"
"${COMPOSE[@]}" build

echo ""
echo "Build complete. Showing the update screen before migrations..."
ensure_deploy_signal_services
mark_deploy_draining || true
echo "  Waiting ${DEPLOY_DRAIN_WAIT_SEC}s for clients to show the update screen..."
sleep "$DEPLOY_DRAIN_WAIT_SEC"

cco_run_migrations files

mark_deploy_draining || true

echo "Recreating containers with new images..."
"${COMPOSE[@]}" up -d --no-build

echo ""
echo "Waiting for services..."
for _ in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T web bun -e "fetch('http://127.0.0.1:3000/api/app-version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
clear_deploy_draining
"${COMPOSE[@]}" ps

echo ""
echo "Deployment started."
echo "  Web: https://${CCO_DOMAIN}"
echo "  API: https://${API_DOMAIN}"
echo ""
echo "Next steps:"
echo "  cd ${ROOT}"
echo "  ./deploy/compose.sh logs cloudflared"
echo "  Open https://${CCO_DOMAIN}/setup and enter Planning Center OAuth credentials."
echo "  Configure PCO webhooks at https://${API_DOMAIN}/webhooks/pco (optional)."
echo ""
echo "Docker Compose shortcut (from ${ROOT}): ./deploy/compose.sh <args>"
