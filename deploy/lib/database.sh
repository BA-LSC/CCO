# Shared database helpers for deploy scripts. Source from repo root:
#   source deploy/lib/database.sh

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

# True when DATABASE_URL targets a host other than the bundled postgres service.
cco_database_is_external() {
  local url="${1:-}"
  [[ -z "$url" || "$url" == *CHANGE_ME* || "$url" == *REPLACE_WITH_* ]] && return 1
  [[ "$url" == *@postgres:* || "$url" == *@postgres/* ]] && return 1
  return 0
}

# Managed providers (Vultr, RDS, etc.) require TLS; append sslmode if missing.
cco_database_normalize_url() {
  local url="${1:-}"
  [[ -z "$url" ]] && return 0
  if [[ "$url" == *sslmode=* ]]; then
    printf '%s' "$url"
    return 0
  fi
  case "$url" in
    *vultrdb.com*|*vultrdb.net*|*rds.amazonaws.com*|*neon.tech*)
      if [[ "$url" == *'?'* ]]; then
        printf '%s&sslmode=require' "$url"
      else
        printf '%s?sslmode=require' "$url"
      fi
      ;;
    *)
      printf '%s' "$url"
      ;;
  esac
}

# External DB: explicit EXTERNAL_DATABASE=1, or DATABASE_URL not pointing at postgres.
# Bundled DB: set BUNDLED_DATABASE=1 to force the container even with a custom URL.
cco_should_use_external_db() {
  [[ "${BUNDLED_DATABASE:-}" == "1" ]] && return 1
  [[ "${EXTERNAL_DATABASE:-}" == "1" ]] && return 0
  cco_database_is_external "${DATABASE_URL:-}"
}

cco_compose_files() {
  local -n _out=$1
  _out=(-f deploy/docker-compose.prod.yml)
  if cco_should_use_external_db; then
    _out+=(-f deploy/docker-compose.external-db.yml)
  fi
}

cco_wait_for_bundled_postgres() {
  local -n _files=$1
  local timeout="${2:-120}"
  local elapsed=0 health=""

  echo "Starting postgres container for connection test..."
  if docker compose "${_files[@]}" up -d --wait --wait-timeout "$timeout" postgres 2>/dev/null; then
    return 0
  fi

  docker compose "${_files[@]}" up -d postgres

  echo "Waiting for postgres (up to ${timeout}s)..."
  while (( elapsed < timeout )); do
    health="$(docker compose "${_files[@]}" ps --format '{{.Health}}' postgres 2>/dev/null | head -1 || true)"
    if [[ "$health" == "healthy" ]]; then
      return 0
    fi
    if docker compose "${_files[@]}" exec -T postgres \
      pg_isready -U "${POSTGRES_USER:-cco}" -d "${POSTGRES_DB:-cco}" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
    elapsed=$((elapsed + 2))
  done

  echo "Postgres did not become ready in ${timeout}s." >&2
  echo "" >&2
  echo "Container status:" >&2
  docker compose "${_files[@]}" ps postgres >&2 || true
  echo "" >&2
  echo "Recent logs:" >&2
  docker compose "${_files[@]}" logs --tail 50 postgres >&2 || true
  if docker compose "${_files[@]}" logs --tail 20 postgres 2>/dev/null | grep -q '/var/lib/postgresql/data (unused mount'; then
    echo "" >&2
    echo "Fix: Postgres 18 needs a fresh data volume. From the repo root run:" >&2
    echo "  docker compose -f deploy/docker-compose.prod.yml down -v" >&2
    echo "  ./deploy/setup.sh" >&2
  fi
  return 1
}

cco_test_bundled_postgres_connection() {
  local -n _files=$1
  docker compose "${_files[@]}" exec -T \
    -e PGPASSWORD="${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}" \
    postgres psql -U "${POSTGRES_USER:-cco}" -d "${POSTGRES_DB:-cco}" \
    -v ON_ERROR_STOP=1 -c 'SELECT 1 AS ok'
}

cco_run_migrations() {
  local -n _files=$1
  echo "Running database migrations..."
  if ! cco_should_use_external_db; then
    cco_wait_for_bundled_postgres "$1" 60
  fi
  docker compose "${_files[@]}" run --rm migrate
  echo "  Migrations complete."
}
