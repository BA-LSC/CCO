#!/usr/bin/env bash
# Guided production setup — domains, Cloudflare Tunnel, database, deploy.
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
# shellcheck disable=SC1091
source deploy/lib/cloudflare-tunnel.sh
# shellcheck disable=SC1091
source deploy/lib/firewall.sh

ENV_FILE=".env"
TOTAL_STEPS=7

cco_attach_tty
cco_ensure_docker

[[ -f "$ENV_FILE" ]] || cp deploy/.env.production.example "$ENV_FILE"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CCO server setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This wizard walks through production setup one step at a time."
echo "Traffic enters through Cloudflare Tunnel only — no public web ports."
echo ""
echo "  1. Domains + Cloudflare account"
echo "  2. Cloudflare Tunnel (Zero Trust — paste token, then Published application routes)"
echo "  3. Cloudflare security hardening (dashboard)"
echo "  4. VPS + cloud provider firewall"
echo "  5. Database"
echo "  6. Secrets and .env"
echo "  7. Test connection and deploy"
echo ""
echo "Planning Center OAuth is configured in the browser at /setup after deploy."
echo ""
cco_press_enter "Press Enter to begin"

# ── Step 1: Domains ──────────────────────────────────────────────────────────

cco_step_banner "1/${TOTAL_STEPS}" "Domains + Cloudflare account"

cco_prompt_cloudflare_prerequisites

echo "CCO needs two public hostnames on your Cloudflare zone:"
echo ""
echo "  • Web domain  — where users open the app in a browser"
echo "  • API domain  — WebSockets, OAuth callbacks, webhooks"
echo ""
echo "Example (hostnames only — no https://):"
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

CCO_DOMAIN="$(cco_normalize_hostname "$(cco_prompt "Web domain (CCO_DOMAIN)" "$default_cco")")"
API_DOMAIN="$(cco_normalize_hostname "$(cco_prompt "API domain (API_DOMAIN)" "$(cco_default_api_domain "$CCO_DOMAIN")")")"

echo ""
echo "You entered:"
echo "  Web:  https://${CCO_DOMAIN}"
echo "  API:  https://${API_DOMAIN}"
echo ""
until cco_confirm_step "Continue with these domains?"; do
  echo ""
  CCO_DOMAIN="$(cco_normalize_hostname "$(cco_prompt "Web domain (CCO_DOMAIN)" "$CCO_DOMAIN")")"
  API_DOMAIN="$(cco_normalize_hostname "$(cco_prompt "API domain (API_DOMAIN)" "$(cco_default_api_domain "$CCO_DOMAIN")")")"
  echo ""
  echo "You entered:"
  echo "  Web:  https://${CCO_DOMAIN}"
  echo "  API:  https://${API_DOMAIN}"
  echo ""
done

# ── Step 2: Cloudflare Tunnel ────────────────────────────────────────────────

cco_step_banner "2/${TOTAL_STEPS}" "Cloudflare Tunnel"

if ! cco_run_tunnel_setup "$ENV_FILE" "$CCO_DOMAIN" "$API_DOMAIN"; then
  echo ""
  echo "Cloudflare Tunnel setup did not finish. Fix the issue above, then run:"
  echo "  ./deploy/setup.sh"
  exit 1
fi
CLOUDFLARE_TUNNEL_TOKEN="$(cco_env_get CLOUDFLARE_TUNNEL_TOKEN "$ENV_FILE")"

# ── Step 3: Cloudflare hardening ─────────────────────────────────────────────

cco_step_banner "3/${TOTAL_STEPS}" "Cloudflare security hardening"

cco_print_cloudflare_hardening_guide
cco_prompt_hardening_confirmations
cco_press_enter "Press Enter after saving hardening settings in Cloudflare"

# ── Step 4: VPS + cloud firewall ─────────────────────────────────────────────

cco_step_banner "4/${TOTAL_STEPS}" "VPS + cloud provider firewall"

cco_print_vps_firewall_guide
cco_press_enter "Press Enter to review your provider firewall, then confirm each item"
cco_prompt_vps_firewall_confirmations

echo "Configuring UFW on this server (SSH only, no public HTTP/S)..."
echo ""
if ! cco_apply_server_firewall "$ROOT"; then
  echo ""
  echo "Automatic UFW setup failed. Run manually, then confirm:"
  echo "  sudo ./deploy/harden-server.sh"
  echo ""
fi
cco_prompt_ufw_confirmation "$ROOT"

# ── Step 5: Database ─────────────────────────────────────────────────────────

cco_step_banner "5/${TOTAL_STEPS}" "Database"

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

# ── Step 6: Write .env and secrets ───────────────────────────────────────────

cco_step_banner "6/${TOTAL_STEPS}" "Secrets and .env"

echo "Writing ${ENV_FILE} with your settings and generating secure secrets:"
echo "  • CLOUDFLARE_TUNNEL_TOKEN"
echo "  • SESSION_SECRET"
echo "  • TOKEN_ENCRYPTION_KEY  (required — loss makes DB secrets unrecoverable)"
echo "  • REDIS_PASSWORD"
if [[ "$db_choice" == "1" ]]; then
  echo "  • POSTGRES_PASSWORD"
fi
echo ""

cco_env_apply_domains "$CCO_DOMAIN" "$API_DOMAIN" "$ENV_FILE"
cco_env_apply_defaults "$ENV_FILE"
cco_env_upsert "CLOUDFLARE_TUNNEL_TOKEN" "$CLOUDFLARE_TUNNEL_TOKEN" "$ENV_FILE"
echo "  ✓ CLOUDFLARE_TUNNEL_TOKEN"

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

# ── Step 7: Test and deploy ──────────────────────────────────────────────────

cco_step_banner "7/${TOTAL_STEPS}" "Test and deploy"

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

if [[ -z "$CCO_DOMAIN" || -z "$API_DOMAIN" || -z "$CLOUDFLARE_TUNNEL_TOKEN" ]]; then
  echo "Domains and Cloudflare tunnel token are required."
  exit 1
fi

echo "After deploy:"
echo ""
echo "  1. Open https://${CCO_DOMAIN}/setup"
echo "     Enter church name and Planning Center OAuth credentials."
echo ""
echo "  2. In your PCO developer app, register redirect URIs:"
echo "     https://${CCO_DOMAIN}/auth/pco/callback"
echo "     https://${CCO_DOMAIN}/api/auth/pco/callback (legacy, still supported)"
echo "     https://${API_DOMAIN}/auth/pco/mobile/callback"
echo ""
echo "  3. Optional webhooks (also configurable in /setup):"
echo "     https://${API_DOMAIN}/webhooks/pco"
echo ""
echo "Verify tunnel:"
echo "  ./deploy/compose.sh logs -f cloudflared"
echo ""

if cco_prompt_yes_no "Deploy now? (runs ./deploy/bootstrap.sh)" "Y"; then
  exec ./deploy/bootstrap.sh
fi

echo ""
echo "Setup complete. Deploy when ready:"
echo "  ./deploy/update.sh"
echo "  ./deploy/bootstrap.sh"
echo ""
echo "Day-two commands:"
echo "  ./deploy/compose.sh ps"
echo "  ./deploy/compose.sh logs -f cloudflared"
echo "  ./deploy/compose.sh logs -f api"
echo ""
