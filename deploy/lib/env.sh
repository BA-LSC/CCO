# Dotenv helpers for deploy scripts. Source from repo root:
#   source deploy/lib/env.sh

cco_urlencode() {
  local value="$1"
  if command -v python3 >/dev/null 2>&1; then
    VALUE="$value" python3 -c 'import os, urllib.parse; print(urllib.parse.quote_plus(os.environ["VALUE"], safe=""))'
    return 0
  fi
  echo "python3 is required to encode database passwords." >&2
  return 1
}

cco_env_format_for_dotenv() {
  local value="$1"
  if [[ "$value" =~ ^[A-Za-z0-9/:@._+-]+$ ]]; then
    printf '%s' "$value"
    return 0
  fi
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//\$/\\$}"
  value="${value//\`/\\\`}"
  printf '"%s"' "$value"
}

cco_env_upsert() {
  local key="$1" value="$2" file="$3"
  local tmp="${file}.tmp.$$"
  if [[ -f "$file" ]] && grep -q "^${key}=" "$file" 2>/dev/null; then
    grep -v "^${key}=" "$file" >"$tmp"
  elif [[ -f "$file" ]]; then
    cp "$file" "$tmp"
  else
    : >"$tmp"
  fi
  printf '%s=%s\n' "$key" "$(cco_env_format_for_dotenv "$value")" >>"$tmp"
  mv "$tmp" "$file"
}

cco_env_get() {
  local key="$1" file="$2"
  [[ -f "$file" ]] || return 0
  grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2- || true
}

cco_env_is_placeholder() {
  local val="${1:-}"
  [[ -z "$val" || "$val" == CHANGE_ME* ]]
}

# chat.example.com → api.chat.example.com
cco_normalize_hostname() {
  local h="$1"
  h="${h#https://}"
  h="${h#http://}"
  h="${h%%/*}"
  h="${h#"${h%%[![:space:]]*}"}"
  h="${h%"${h##*[![:space:]]}"}"
  h="${h//$'\r'/}"
  h="${h//$'\n'/}"
  printf '%s' "$h"
}

cco_default_api_domain() {
  local cco="$1"
  if [[ "$cco" == chat.* ]]; then
    printf 'api.chat.%s' "${cco#chat.}"
  else
    printf 'api.%s' "$cco"
  fi
}

# Set URL and PCO redirect variables from CCO_DOMAIN + API_DOMAIN.
cco_env_apply_domains() {
  local cco="$1" api="$2" file="$3"
  cco="$(cco_normalize_hostname "$cco")"
  api="$(cco_normalize_hostname "$api")"
  cco_env_upsert "CCO_DOMAIN" "$cco" "$file"
  cco_env_upsert "API_DOMAIN" "$api" "$file"
  cco_env_upsert "WEB_URL" "https://${cco}" "$file"
  cco_env_upsert "API_URL" "http://api:3001" "$file"
  cco_env_upsert "NEXT_PUBLIC_WS_URL" "wss://${api}" "$file"
  cco_env_upsert "NEXT_PUBLIC_WEB_URL" "https://${cco}" "$file"
  cco_env_upsert "PUBLIC_UPLOAD_URL" "https://${api}/uploads" "$file"
  cco_env_upsert "PCO_WEB_REDIRECT_URI" "https://${cco}/api/auth/pco/callback" "$file"
  cco_env_upsert "PCO_REDIRECT_URI" "https://${api}/auth/pco/callback" "$file"
  cco_env_upsert "PCO_MOBILE_REDIRECT_URI" "https://${api}/auth/pco/mobile/callback" "$file"
}

cco_env_apply_bundled_db() {
  local password="$1" file="$2" encoded=""
  encoded="$(cco_urlencode "$password")" || return 1
  cco_env_upsert "POSTGRES_USER" "cco" "$file"
  cco_env_upsert "POSTGRES_DB" "cco" "$file"
  cco_env_upsert "POSTGRES_PASSWORD" "$password" "$file"
  cco_env_upsert "DATABASE_URL" "postgresql://cco:${encoded}@postgres:5432/cco" "$file"
}

cco_env_apply_secrets() {
  local session="$1" token_key="$2" file="$3"
  cco_env_upsert "SESSION_SECRET" "$session" "$file"
  cco_env_upsert "TOKEN_ENCRYPTION_KEY" "$token_key" "$file"
}

cco_env_apply_redis() {
  local password="$1" file="$2" encoded=""
  encoded="$(cco_urlencode "$password")" || return 1
  cco_env_upsert "REDIS_PASSWORD" "$password" "$file"
  cco_env_upsert "REDIS_URL" "redis://:${encoded}@redis:6379" "$file"
}

cco_env_apply_defaults() {
  local file="$1"
  cco_env_upsert "PCO_OAUTH_SCOPE" "people groups services" "$file"
  cco_env_upsert "MOBILE_APP_SCHEME" "connect" "$file"
  cco_env_upsert "MOBILE_ORIGIN" "" "$file"
  cco_env_upsert "API_PORT" "3001" "$file"
  cco_env_upsert "ORGANIZATION_NAME" "My Church" "$file"
  cco_env_upsert "UPLOAD_DIR" "/data/uploads" "$file"
}
