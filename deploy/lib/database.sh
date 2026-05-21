# Shared database helpers for deploy scripts. Source from repo root:
#   source deploy/lib/database.sh

# shellcheck disable=SC1091
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

# True when DATABASE_URL targets a host other than the bundled postgres service.
cco_database_is_external() {
  local url="${1:-}"
  [[ -z "$url" || "$url" == *CHANGE_ME* ]] && return 1
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
