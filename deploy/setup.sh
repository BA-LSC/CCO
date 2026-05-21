#!/usr/bin/env bash
# Guided production setup — domains, Cloudflare, database, deploy.
# Fresh server: curl -fsSL .../deploy/install.sh | bash
# From repo:     ./deploy/install.sh   or   ./deploy/setup.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh
# shellcheck disable=SC1091
source deploy/lib/prompt.sh
# shellcheck disable=SC1091
source deploy/lib/docker.sh
# shellcheck disable=SC1091
source deploy/lib/vultr-db.sh

ENV_FILE=".env"

cco_ensure_docker

[[ -f "$ENV_FILE" ]] || cp deploy/.env.production.example "$ENV_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CCO server setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This wizard configures everything in one place:"
echo "  • Domains and HTTPS (Caddy + Let's Encrypt)"
echo "  • Cloudflare DNS checklist"
echo "  • Database (Docker Postgres, Vultr VPC, or other)"
echo "  • Auto-generated secrets and deploy"
echo ""
echo "Planning Center OAuth is configured in the browser at /setup after deploy."
echo ""

# ── Step 1: Domains ──────────────────────────────────────────────────────────

echo "Step 1 — Domains"
echo ""

current_cco="$(cco_env_get CCO_DOMAIN "$ENV_FILE")"
current_api="$(cco_env_get API_DOMAIN "$ENV_FILE")"
default_cco="chat.example.com"
default_api=""

if ! cco_env_is_placeholder "$current_cco"; then
  default_cco="$current_cco"
  default_api="$current_api"
fi
[[ -z "$default_api" ]] && default_api="$(cco_default_api_domain "$default_cco")"

CCO_DOMAIN="$(cco_prompt "Web domain (CCO_DOMAIN)" "$default_cco")"
API_DOMAIN="$(cco_prompt "API domain (API_DOMAIN)" "$(cco_default_api_domain "$CCO_DOMAIN")")"

# ── Step 2: Cloudflare DNS ───────────────────────────────────────────────────

echo ""
echo "Step 2 — Cloudflare DNS"
echo ""

detected_ip="$(cco_detect_public_ip)"
SERVER_IP="$(cco_prompt "This server's public IPv4" "$detected_ip")"

cco_print_cloudflare_checklist "$CCO_DOMAIN" "$API_DOMAIN" "${SERVER_IP:-<server-ip>}"

if cco_prompt_yes_no "Have you added (or will you add) these DNS records before going live?" "Y"; then
  :
else
  echo ""
  echo "  You can finish setup now and add DNS before users sign in."
  echo "  Caddy will obtain certificates once DNS points here."
fi

# ── Step 3: TLS email ────────────────────────────────────────────────────────

echo ""
echo "Step 3 — TLS email"
echo ""

current_email="$(cco_env_get CADDY_EMAIL "$ENV_FILE")"
if cco_env_is_placeholder "$current_email" || [[ "$current_email" == you@example.com ]]; then
  current_email=""
fi
CADDY_EMAIL="$(cco_prompt "Email for Let's Encrypt (CADDY_EMAIL)" "$current_email")"

# ── Step 4: Database ─────────────────────────────────────────────────────────

echo ""
echo "Step 4 — Database"
echo "  1) Bundled PostgreSQL in Docker on this server (default)"
echo "  2) Vultr Managed PostgreSQL over VPC"
echo "  3) Other external PostgreSQL (paste DATABASE_URL)"
read -r -p "Choice [1]: " db_choice
db_choice="${db_choice:-1}"

# ── Write .env ───────────────────────────────────────────────────────────────

cco_env_apply_domains "$CCO_DOMAIN" "$API_DOMAIN" "$ENV_FILE"
cco_env_apply_defaults "$ENV_FILE"
cco_env_upsert "CADDY_EMAIL" "$CADDY_EMAIL" "$ENV_FILE"

current_session="$(cco_env_get SESSION_SECRET "$ENV_FILE")"
current_token="$(cco_env_get TOKEN_ENCRYPTION_KEY "$ENV_FILE")"
if cco_env_is_placeholder "$current_session"; then
  current_session="$(openssl rand -hex 32)"
fi
if cco_env_is_placeholder "$current_token"; then
  current_token="$(openssl rand -hex 32)"
fi
cco_env_apply_secrets "$current_session" "$current_token" "$ENV_FILE"
echo ""
echo "Generated SESSION_SECRET and TOKEN_ENCRYPTION_KEY."

current_redis="$(cco_env_get REDIS_PASSWORD "$ENV_FILE")"
if cco_env_is_placeholder "$current_redis"; then
  current_redis="$(openssl rand -base64 24)"
fi
cco_env_apply_redis "$current_redis" "$ENV_FILE"
echo "Generated REDIS_PASSWORD and REDIS_URL."

case "$db_choice" in
  2)
    cco_prompt_vultr_database "$ENV_FILE"
    ;;
  3)
    cco_prompt_external_database_url "$ENV_FILE"
    ;;
  *)
    grep -v '^EXTERNAL_DATABASE=' "$ENV_FILE" >"${ENV_FILE}.tmp" 2>/dev/null && mv "${ENV_FILE}.tmp" "$ENV_FILE" || true
    cco_env_upsert "BUNDLED_DATABASE" "1" "$ENV_FILE"
    current_pg="$(cco_env_get POSTGRES_PASSWORD "$ENV_FILE")"
    if cco_env_is_placeholder "$current_pg"; then
      current_pg="$(openssl rand -base64 24)"
    fi
    cco_env_apply_bundled_db "$current_pg" "$ENV_FILE"
    echo "Generated POSTGRES_PASSWORD and bundled DATABASE_URL."
    ;;
esac

# ── Step 5: Test and deploy ──────────────────────────────────────────────────

echo ""
echo "Step 5 — Test and deploy"
echo ""
echo "Testing database connection..."
if ! ./deploy/check-database.sh; then
  echo "Fix the database settings above, then run: ./deploy/setup.sh"
  exit 1
fi

if [[ -z "$CCO_DOMAIN" || -z "$API_DOMAIN" || -z "$CADDY_EMAIL" ]]; then
  echo "Domains and Let's Encrypt email are required."
  exit 1
fi

echo ""
echo "After deploy, open https://${CCO_DOMAIN}/setup to enter Planning Center OAuth credentials."
echo "Register these redirect URIs in your PCO developer app when prompted:"
echo "  https://${CCO_DOMAIN}/api/auth/pco/callback"
echo "  https://${API_DOMAIN}/auth/pco/mobile/callback"
echo ""
echo "Webhooks (optional, also in /setup):"
echo "  https://${API_DOMAIN}/webhooks/pco"
echo ""

if cco_prompt_yes_no "Deploy now?" "Y"; then
  exec ./deploy/bootstrap.sh
fi

echo ""
echo "Setup saved to .env. When ready:"
echo "  ./deploy/bootstrap.sh"
echo ""
echo "Day-two commands:"
echo "  ./deploy/compose.sh ps"
echo "  ./deploy/compose.sh logs -f api"
