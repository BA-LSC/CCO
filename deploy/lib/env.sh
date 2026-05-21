# Dotenv helpers for deploy scripts. Source from repo root:
#   source deploy/lib/env.sh

cco_env_upsert() {
  local key="$1" value="$2" file="$3"
  local tmp="${file}.tmp.$$"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    grep -v "^${key}=" "$file" >"$tmp"
    printf '%s=%s\n' "$key" "$value" >>"$tmp"
    mv "$tmp" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$file"
  fi
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
  local password="$1" file="$2"
  cco_env_upsert "POSTGRES_USER" "cco" "$file"
  cco_env_upsert "POSTGRES_DB" "cco" "$file"
  cco_env_upsert "POSTGRES_PASSWORD" "$password" "$file"
  cco_env_upsert "DATABASE_URL" "postgresql://cco:${password}@postgres:5432/cco" "$file"
}

cco_env_apply_secrets() {
  local session="$1" token_key="$2" file="$3"
  cco_env_upsert "SESSION_SECRET" "$session" "$file"
  cco_env_upsert "TOKEN_ENCRYPTION_KEY" "$token_key" "$file"
}

cco_env_apply_redis() {
  local password="$1" file="$2"
  cco_env_upsert "REDIS_PASSWORD" "$password" "$file"
  cco_env_upsert "REDIS_URL" "redis://:${password}@redis:6379" "$file"
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

cco_print_cloudflare_checklist() {
  local cco="$1" api="$2" server_ip="${3:-<server-ip>}"
  cat <<EOF
Do this in Cloudflare before users can sign in:

  1. Open https://dash.cloudflare.com/ and select your domain zone.

  2. Go to DNS → Records → Add record (twice):

       Type   Name              Content           Proxy
       ────   ───────────────   ───────────────   ─────────────────
       A      ${cco}            ${server_ip}      DNS only (grey cloud)
       A      ${api}            ${server_ip}      DNS only (grey cloud)

     Use the full hostnames above if your zone is the root domain.
     If Cloudflare asks for only the subdomain label, use the part before your zone.

  3. Open firewall ports on this server (and Vultr/cloud firewall):
       80/tcp   HTTP  (Let's Encrypt)
       443/tcp  HTTPS

  4. Verify from any machine:

       dig +short ${cco}
       dig +short ${api}

     Both should return ${server_ip} while records are DNS only.

EOF
}
