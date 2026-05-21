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

cco_attach_tty
cco_ensure_docker

[[ -f "$ENV_FILE" ]] || cp deploy/.env.production.example "$ENV_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CCO server setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This wizard walks through production setup one step at a time."
echo "You will confirm each step before continuing."
echo ""
echo "  1. Domains (web + API hostnames)"
echo "  2. Cloudflare DNS"
echo "  3. TLS email (Let's Encrypt)"
echo "  4. Database"
echo "  5. Secrets and .env"
echo "  6. Test connection and deploy"
echo ""
echo "Planning Center OAuth is configured in the browser at /setup after deploy."
echo ""
cco_press_enter "Press Enter to begin"

# ── Step 1: Domains ──────────────────────────────────────────────────────────

cco_step_banner 1 "Domains"

echo "CCO needs two public hostnames:"
echo ""
echo "  • Web domain  — where users open the app in a browser"
echo "  • API domain  — WebSockets, OAuth callbacks, webhooks"
echo ""
echo "Example:"
echo "  Web:  chat.yourchurch.org"
echo "  API:  api.chat.yourchurch.org"
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

echo ""
echo "You entered:"
echo "  Web:  https://${CCO_DOMAIN}"
echo "  API:  https://${API_DOMAIN}"
echo ""
until cco_confirm_step "Continue with these domains?"; do
  echo ""
  CCO_DOMAIN="$(cco_prompt "Web domain (CCO_DOMAIN)" "$CCO_DOMAIN")"
  API_DOMAIN="$(cco_prompt "API domain (API_DOMAIN)" "$(cco_default_api_domain "$CCO_DOMAIN")")"
  echo ""
  echo "You entered:"
  echo "  Web:  https://${CCO_DOMAIN}"
  echo "  API:  https://${API_DOMAIN}"
  echo ""
done

# ── Step 2: Cloudflare DNS ───────────────────────────────────────────────────

cco_step_banner 2 "Cloudflare DNS"

detected_ip="$(cco_detect_public_ip)"
echo "This server's public IPv4 (auto-detected): ${detected_ip:-unknown}"
echo ""
SERVER_IP="$(cco_prompt "Confirm server IPv4 for DNS A records" "${detected_ip:-}")"

if [[ -z "$SERVER_IP" ]]; then
  echo "Server IP is required for DNS instructions."
  exit 1
fi

cco_print_cloudflare_checklist "$CCO_DOMAIN" "$API_DOMAIN" "$SERVER_IP"

echo "When the records are saved in Cloudflare, run the dig commands above."
echo ""
if cco_prompt_yes_no "Have you added both DNS A records (or will before go-live)?" "Y"; then
  echo ""
  echo "Optional: verify now on this server:"
  echo "  dig +short ${CCO_DOMAIN}"
  echo "  dig +short ${API_DOMAIN}"
  cco_press_enter "Press Enter after you have checked (or skipped) DNS"
else
  echo ""
  echo "You can finish setup now and add DNS before users sign in."
  echo "Caddy will obtain certificates once DNS points here."
  cco_press_enter "Press Enter to continue anyway"
fi

# ── Step 3: TLS email ────────────────────────────────────────────────────────

cco_step_banner 3 "TLS email"

echo "Caddy uses Let's Encrypt for HTTPS. Enter an email for:"
echo "  • Certificate expiry notices"
echo "  • Account recovery with Let's Encrypt"
echo ""
echo "This address is not shown to your users."
echo ""

current_email="$(cco_env_get CADDY_EMAIL "$ENV_FILE")"
if cco_env_is_placeholder "$current_email" || [[ "$current_email" == you@example.com ]]; then
  current_email=""
fi
CADDY_EMAIL="$(cco_prompt "Email for Let's Encrypt (CADDY_EMAIL)" "$current_email")"

while [[ -z "$CADDY_EMAIL" ]]; do
  echo "Email is required."
  CADDY_EMAIL="$(cco_prompt "Email for Let's Encrypt (CADDY_EMAIL)" "")"
done

echo ""
echo "TLS contact: ${CADDY_EMAIL}"
echo ""
cco_press_enter "Press Enter to confirm and continue"

# ── Step 4: Database ─────────────────────────────────────────────────────────

cco_step_banner 4 "Database"

echo "Choose where PostgreSQL runs:"
echo ""
echo "  1) Bundled PostgreSQL in Docker on this server (recommended, default)"
echo "     • Simplest — one VPS, no extra cost"
echo "     • Data stored in a Docker volume on this machine"
echo ""
echo "  2) Vultr Managed PostgreSQL over VPC"
echo "     • Managed backups and updates"
echo "     • Requires VPC peering from this server to the database"
echo ""
echo "  3) Other external PostgreSQL"
echo "     • Paste a full DATABASE_URL connection string"
echo ""

db_choice=""
while [[ ! "$db_choice" =~ ^[123]$ ]]; do
  db_choice="$(cco_prompt "Enter choice" "1")"
  db_choice="${db_choice:-1}"
  if [[ ! "$db_choice" =~ ^[123]$ ]]; then
    echo "Please enter 1, 2, or 3."
  fi
done

# ── Step 5: Write .env and secrets ───────────────────────────────────────────

cco_step_banner 5 "Secrets and .env"

echo "Writing ${ENV_FILE} with your settings and generating secure secrets:"
echo "  • SESSION_SECRET"
echo "  • TOKEN_ENCRYPTION_KEY  (required — loss makes DB secrets unrecoverable)"
echo "  • REDIS_PASSWORD"
if [[ "$db_choice" == "1" ]]; then
  echo "  • POSTGRES_PASSWORD"
fi
echo ""

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
echo "  ✓ SESSION_SECRET and TOKEN_ENCRYPTION_KEY"

current_redis="$(cco_env_get REDIS_PASSWORD "$ENV_FILE")"
if cco_env_is_placeholder "$current_redis"; then
  current_redis="$(openssl rand -base64 24)"
fi
cco_env_apply_redis "$current_redis" "$ENV_FILE"
echo "  ✓ REDIS_PASSWORD and REDIS_URL"

case "$db_choice" in
  2)
    cco_prompt_vultr_database "$ENV_FILE"
    echo "  ✓ DATABASE_URL (Vultr VPC)"
    ;;
  3)
    cco_prompt_external_database_url "$ENV_FILE"
    echo "  ✓ DATABASE_URL (external)"
    ;;
  *)
    grep -v '^EXTERNAL_DATABASE=' "$ENV_FILE" >"${ENV_FILE}.tmp" 2>/dev/null && mv "${ENV_FILE}.tmp" "$ENV_FILE" || true
    cco_env_upsert "BUNDLED_DATABASE" "1" "$ENV_FILE"
    current_pg="$(cco_env_get POSTGRES_PASSWORD "$ENV_FILE")"
    if cco_env_is_placeholder "$current_pg"; then
      current_pg="$(openssl rand -base64 24)"
    fi
    cco_env_apply_bundled_db "$current_pg" "$ENV_FILE"
    echo "  ✓ POSTGRES_PASSWORD and bundled DATABASE_URL"
    ;;
esac

echo ""
echo "Configuration saved to ${ENV_FILE}."
echo ""
cco_press_enter "Press Enter to test the database connection"

# ── Step 6: Test and deploy ──────────────────────────────────────────────────

cco_step_banner 6 "Test and deploy"

echo "Testing database connection..."
echo ""
if ! ./deploy/check-database.sh; then
  echo ""
  echo "Database test failed. Fix settings in .env, then run:"
  echo "  ./deploy/setup.sh"
  exit 1
fi

echo ""
echo "Database connection OK."
echo ""

if [[ -z "$CCO_DOMAIN" || -z "$API_DOMAIN" || -z "$CADDY_EMAIL" ]]; then
  echo "Domains and Let's Encrypt email are required."
  exit 1
fi

echo "After deploy:"
echo ""
echo "  1. Open https://${CCO_DOMAIN}/setup"
echo "     Enter church name and Planning Center OAuth credentials."
echo ""
echo "  2. In your PCO developer app, register redirect URIs:"
echo "     https://${CCO_DOMAIN}/api/auth/pco/callback"
echo "     https://${API_DOMAIN}/auth/pco/mobile/callback"
echo ""
echo "  3. Optional webhooks (also configurable in /setup):"
echo "     https://${API_DOMAIN}/webhooks/pco"
echo ""

if cco_prompt_yes_no "Deploy now? (runs ./deploy/bootstrap.sh)" "Y"; then
  exec ./deploy/bootstrap.sh
fi

echo ""
echo "Setup complete. Deploy when ready:"
echo "  ./deploy/bootstrap.sh"
echo ""
echo "Day-two commands:"
echo "  ./deploy/compose.sh ps"
echo "  ./deploy/compose.sh logs -f api"
echo ""
