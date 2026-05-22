#!/usr/bin/env bash
# Test Cloudflare tunnel API permissions. Usage:
#   export CF_API_TOKEN=...   # or CF_AUTH_EMAIL + CF_AUTH_KEY
#   ./deploy/check-cloudflare-tunnel.sh chat.example.com
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=deploy/lib/env.sh
source "$ROOT/deploy/lib/env.sh"
# shellcheck source=deploy/lib/cloudflare-tunnel.sh
source "$ROOT/deploy/lib/cloudflare-tunnel.sh"

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 <hostname>   e.g. chat.yourchurch.org"
  exit 1
fi
DOMAIN="$(cco_normalize_hostname "$DOMAIN")"

if [[ -z "${CF_API_TOKEN:-}" && ( -z "${CF_AUTH_EMAIL:-}" || -z "${CF_AUTH_KEY:-}" ) ]]; then
  echo "Set CF_API_TOKEN or CF_AUTH_EMAIL + CF_AUTH_KEY first."
  exit 1
fi

cco_cf_require_tools

echo "Domain: ${DOMAIN}"
echo ""

if [[ -n "${CF_API_TOKEN:-}" ]]; then
  echo "1. Verify API token…"
  cco_cf_verify_credentials || exit 1
  echo "   OK"
else
  echo "1. Verify Global API Key…"
  cco_cf_verify_credentials || exit 1
  echo "   OK"
fi

echo ""
echo "2. Resolve account from zone…"
ACCOUNT_ID="$(cco_cf_account_id_for_domain "$DOMAIN")" || exit 1
echo "   Account ID: ${ACCOUNT_ID}"

echo ""
echo "3. Validate account…"
cco_cf_validate_account_id "$ACCOUNT_ID" || exit 1
echo "   OK"

TUNNEL_NAME="cco-test-$(echo "$DOMAIN" | tr '.:' '-')"
echo ""
echo "4. Create test tunnel (${TUNNEL_NAME})…"
TUNNEL_ID="$(cco_cf_create_or_reuse_tunnel "$ACCOUNT_ID" "$TUNNEL_NAME")" || exit 1
echo "   Tunnel ID: ${TUNNEL_ID}"

echo ""
echo "5. Fetch tunnel run token…"
TOKEN="$(cco_cf_get_tunnel_run_token "$ACCOUNT_ID" "$TUNNEL_ID")" || exit 1
echo "   OK (${#TOKEN} characters)"

echo ""
echo "All checks passed. Tunnel API permissions are sufficient."
echo "Delete the test tunnel in Zero Trust → Networks → Tunnels if you like."
