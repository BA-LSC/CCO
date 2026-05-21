# Cloudflare Tunnel setup — API automation (primary) with optional manual fallback.

CCO_SETUP_CLOUDFLARED_CONTAINER="${CCO_SETUP_CLOUDFLARED_CONTAINER:-cco-cloudflared-setup}"

cco_cf_require_tools() {
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required for Cloudflare API setup." >&2
    return 1
  fi
  if ! command -v python3 >/dev/null 2>&1; then
    echo "python3 is required for Cloudflare API setup." >&2
    return 1
  fi
}

cco_cf_normalize_token() {
  local t="$1"
  t="${t//$'\r'/}"
  t="${t//$'\n'/}"
  t="${t#"${t%%[![:space:]]*}"}"
  t="${t%"${t##*[![:space:]]}"}"
  if [[ "$t" == Bearer\ * ]]; then
    t="${t#Bearer }"
    t="$(cco_cf_normalize_token "$t")"
  fi
  printf '%s' "$t"
}

cco_cf_normalize_account_id() {
  local id="$1"
  id="$(cco_cf_normalize_token "$id")"
  id="${id//-}" 
  id="$(printf '%s' "$id" | tr -cd 'a-fA-F0-9')"
  printf '%s' "$id"
}

cco_cf_curl() {
  local method="$1" path="$2"
  shift 2
  local url="https://api.cloudflare.com/client/v4${path}"
  local err_file response curl_status

  err_file="$(mktemp)"
  if [[ "$method" == GET && $# -gt 0 ]]; then
    local curl_args=( -sS --http1.1 -4 --connect-timeout 30 --max-time 120 -G "$url" )
    local q
    for q in "$@"; do
      curl_args+=( --data-urlencode "$q" )
    done
    curl_args+=( -H "Authorization: Bearer ${CF_API_TOKEN}" )
    response="$(curl "${curl_args[@]}" 2>"$err_file")"
  elif [[ "$method" == GET ]]; then
    response="$(curl -sS --http1.1 -4 \
      --connect-timeout 30 --max-time 120 \
      -X GET "$url" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      2>"$err_file")"
  else
    local data="$1"
    response="$(curl -sS --http1.1 -4 \
      --connect-timeout 30 --max-time 120 \
      -X "$method" "$url" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data" \
      2>"$err_file")"
  fi
  curl_status=$?
  if ((curl_status != 0)); then
    echo "Cloudflare API HTTP request failed (curl exit ${curl_status})." >&2
    echo "  Request: ${method} https://api.cloudflare.com/client/v4${path}" >&2
    if [[ -s "$err_file" ]]; then
      sed 's/^/  /' "$err_file" >&2
    fi
    echo "  Check: domains are hostnames only (no https://), token is complete, server can reach api.cloudflare.com" >&2
    rm -f "$err_file"
    return 1
  fi
  rm -f "$err_file"
  if [[ -z "$response" ]]; then
    echo "Cloudflare API returned an empty response." >&2
    return 1
  fi
  printf '%s' "$response"
}

cco_cf_api() {
  local method="$1" path="$2" data="${3:-}"
  if [[ "$method" == GET && "$path" == *'?'* ]]; then
    local base="${path%%\?*}" query_string="${path#*\?}"
    local -a query_args=() pair
    IFS='&' read -ra pairs <<<"$query_string"
    for pair in "${pairs[@]}"; do
      query_args+=( "$pair" )
    done
    cco_cf_curl GET "$base" "${query_args[@]}"
    return $?
  fi
  if [[ -n "$data" ]]; then
    cco_cf_curl "$method" "$path" "$data"
  else
    cco_cf_curl "$method" "$path"
  fi
}

cco_cf_json_success() {
  local json="$1"
  [[ -n "$json" ]] || return 1
  JSON="$json" python3 -c '
import json, os, sys
try:
    data = json.loads(os.environ["JSON"])
except json.JSONDecodeError:
    sys.exit(1)
sys.exit(0 if data.get("success") else 1)
' 2>/dev/null
}

cco_cf_json_errors() {
  local json="$1"
  JSON="$json" python3 -c '
import json, os
try:
    data = json.loads(os.environ["JSON"])
except json.JSONDecodeError:
    print("Invalid JSON response from Cloudflare API")
    raise SystemExit(0)
for err in data.get("errors") or []:
    code = err.get("code", "")
    msg = err.get("message", err)
    print(f"  [{code}] {msg}")
' 2>/dev/null || true
}

cco_cf_json_field() {
  local json="$1" expr="$2"
  JSON="$json" EXPR="$expr" python3 -c '
import json, os
data = json.loads(os.environ["JSON"])
cur = data
for part in os.environ["EXPR"].split("."):
    if part == "":
        continue
    if isinstance(cur, dict):
        cur = cur.get(part)
    elif isinstance(cur, list) and part.isdigit():
        cur = cur[int(part)]
    else:
        cur = None
        break
if cur is None:
    raise SystemExit(1)
print(cur)
'
}

cco_cf_resolve_account_id() {
  local response account_id manual_id
  response="$(cco_cf_api GET "/accounts?per_page=1")" || true
  if [[ -n "$response" ]] && cco_cf_json_success "$response"; then
    account_id="$(cco_cf_json_field "$response" "result.0.id" 2>/dev/null || true)"
    if [[ -n "$account_id" ]]; then
      printf '%s' "$account_id"
      return 0
    fi
  fi

  echo ""
  echo "This token cannot list accounts (that is OK if DNS + Connectors are correct)."
  echo "Paste your Account ID from Cloudflare:"
  echo "  https://dash.cloudflare.com/ → pick your domain → Overview"
  echo "  → Account ID in the right-hand column (32-character hex)"
  echo ""
  echo "Or add permission Account → Account Settings → Read and create a new token."
  echo ""
  manual_id="$(cco_prompt "Cloudflare Account ID" "")"
  manual_id="$(cco_cf_normalize_account_id "$manual_id")"
  if [[ -z "$manual_id" ]]; then
    echo "Account ID is required." >&2
    return 1
  fi
  printf '%s' "$manual_id"
}

cco_cf_find_zone_id() {
  local hostname="$1" candidate response zone_id
  hostname="$(cco_normalize_hostname "$hostname")"
  candidate="$hostname"
  while [[ "$candidate" == *.* ]]; do
    response="$(cco_cf_api GET "/zones?name=${candidate}")"
    if cco_cf_json_success "$response"; then
      zone_id="$(cco_cf_json_field "$response" "result.0.id" 2>/dev/null || true)"
      if [[ -n "$zone_id" ]]; then
        printf '%s' "$zone_id"
        return 0
      fi
    fi
    candidate="${candidate#*.}"
  done
  echo "Could not find a Cloudflare zone for ${hostname}." >&2
  return 1
}

cco_cf_upsert_cname() {
  local zone_id="$1" fqdn="$2" target="$3"
  local response record_id payload
  zone_id="$(cco_cf_normalize_account_id "$zone_id")"
  fqdn="$(cco_normalize_hostname "$fqdn")"
  target="$(cco_cf_normalize_token "$target")"
  response="$(cco_cf_api GET "/zones/${zone_id}/dns_records?type=CNAME&name=${fqdn}")"
  if ! cco_cf_json_success "$response"; then
    echo "Failed to list DNS records for ${fqdn}." >&2
    return 1
  fi
  record_id="$(JSON="$response" python3 -c '
import json, os
for row in json.loads(os.environ["JSON"]).get("result", []):
    print(row["id"])
    break
' 2>/dev/null || true)"

  payload="$(FQDN="$fqdn" TARGET="$target" python3 -c '
import json, os
print(json.dumps({
  "type": "CNAME",
  "name": os.environ["FQDN"],
  "content": os.environ["TARGET"],
  "proxied": True,
  "comment": "CCO Cloudflare Tunnel",
}))
')"

  if [[ -n "$record_id" ]]; then
    response="$(cco_cf_api PUT "/zones/${zone_id}/dns_records/${record_id}" "$payload")"
  else
    response="$(cco_cf_api POST "/zones/${zone_id}/dns_records" "$payload")"
  fi
  if ! cco_cf_json_success "$response"; then
    echo "Failed to create/update CNAME for ${fqdn}." >&2
    JSON="$response" python3 -c 'import json, os; print(json.loads(os.environ["JSON"]).get("errors", []))' >&2 || true
    return 1
  fi
}

cco_cf_provision_tunnel() {
  local account_id="$1" cco_domain="$2" api_domain="$3"
  local response tunnel_id tunnel_name token payload api_zone_id cname_target zone_id

  cco_cf_require_tools || return 1
  account_id="$(cco_cf_normalize_account_id "$account_id")"
  cco_domain="$(cco_normalize_hostname "$cco_domain")"
  api_domain="$(cco_normalize_hostname "$api_domain")"

  tunnel_name="cco-$(echo "$cco_domain" | tr '.:' '-')"
  response="$(cco_cf_api POST "/accounts/${account_id}/cfd_tunnel" \
    "{\"name\":\"${tunnel_name}\",\"config_src\":\"cloudflare\"}")" || return 1
  if ! cco_cf_json_success "$response"; then
    echo "Failed to create Cloudflare Tunnel." >&2
    cco_cf_json_errors "$response"
    return 1
  fi
  tunnel_id="$(cco_cf_json_field "$response" "result.id")"

  payload="$(CCO="$cco_domain" API="$api_domain" python3 -c '
import json, os
print(json.dumps({
  "config": {
    "ingress": [
      {
        "hostname": os.environ["CCO"],
        "service": "http://web:3000",
        "originRequest": {"http2Origin": True, "connectTimeout": 30},
      },
      {
        "hostname": os.environ["API"],
        "service": "http://api:3001",
        "originRequest": {"http2Origin": True, "connectTimeout": 30},
      },
      {"service": "http_status:404"},
    ]
  }
}))
')"
  response="$(cco_cf_api PUT "/accounts/${account_id}/cfd_tunnel/${tunnel_id}/configurations" "$payload")" || return 1
  if ! cco_cf_json_success "$response"; then
    echo "Failed to configure tunnel ingress." >&2
    cco_cf_json_errors "$response"
    return 1
  fi

  zone_id="$(cco_cf_find_zone_id "$cco_domain")" || return 1
  cname_target="${tunnel_id}.cfargotunnel.com"
  cco_cf_upsert_cname "$zone_id" "$cco_domain" "$cname_target" || return 1
  if [[ "$api_domain" != "$cco_domain" ]]; then
    api_zone_id="$(cco_cf_find_zone_id "$api_domain")" || return 1
    cco_cf_upsert_cname "$api_zone_id" "$api_domain" "$cname_target" || return 1
  fi

  response="$(cco_cf_api GET "/accounts/${account_id}/cfd_tunnel/${tunnel_id}/token")" || return 1
  if ! cco_cf_json_success "$response"; then
    echo "Failed to fetch tunnel run token." >&2
    cco_cf_json_errors "$response"
    return 1
  fi
  token="$(cco_cf_json_field "$response" "result")"
  printf '%s' "$token"
}

cco_print_cloudflare_prerequisites() {
  cat <<'EOF'
Before the tunnel, your domain must use Cloudflare DNS (free plan is fine):

  1. Open https://dash.cloudflare.com/
  2. Add a site → enter your root domain (e.g. yourchurch.org)
  3. Choose the Free plan
  4. Cloudflare shows two nameservers — at your domain registrar, replace
     the existing NS records with Cloudflare's nameservers
  5. Wait until the site status is Active in Cloudflare

EOF
}

cco_prompt_cloudflare_prerequisites() {
  cco_print_cloudflare_prerequisites
  until cco_prompt_yes_no "Is your domain Active on Cloudflare?" "Y"; do
    echo ""
    echo "  Finish nameserver setup at your registrar, then continue."
    cco_press_enter "Press Enter when the domain is Active on Cloudflare"
  done
  echo ""
}

cco_print_api_token_walkthrough() {
  local cco="$1" api="$2"
  cat <<EOF
── Create a Cloudflare API token (one time) ─────────────────────────────────

  1. Open https://dash.cloudflare.com/profile/api-tokens
  2. Create Token → Create Custom Token

  3. Token name (suggested): CCO tunnel setup

  4. Permissions — add these rows (pick the exact names from the dropdowns):

       Scope     | Permission                  | Access
       ──────────|─────────────────────────────|────────
       Account   | Cloudflare One Connectors   | Edit
       Zone      | DNS                         | Edit

     WRONG — do not use these instead:
       ✗ Zone → DNS Settings   (zone settings, not DNS records)
       ✗ Zone → Zone Settings
       ✗ Read-only / Read access on either row

     Optional if "could not list accounts" appears later:
       Account   | Account Settings            | Read

  5. Zone Resources (on the Zone → DNS row):
       Include → Specific zone → pick the zone for your domains
       (e.g. the zone containing ${cco} and ${api})

     If web and API are on different zones, include both zones — or use
     All zones on this account (broader than needed, but works).

  6. Account Resources: leave as default (this account only)

  7. Continue to summary → Create Token → copy the token (shown once)

  Not required: WARP, Zero Trust Access, Workers, R2, or pkg.cloudflareclient.com
  (that URL is for the WARP client — CCO uses cloudflared in Docker).

  What this token does:
    • Cloudflare One Connectors — create tunnel, set routes, get run token
    • DNS — create proxied CNAME records for:
        ${cco}  → http://web:3000
        ${api}  → http://api:3001

EOF
}

cco_prompt_api_token_permissions_checklist() {
  echo "Confirm your custom token matches exactly:"
  echo ""
  echo "  RIGHT:  Account | Cloudflare One Connectors | Edit"
  echo "  RIGHT:  Zone     | DNS                       | Edit"
  echo "  WRONG:  Zone     | DNS Settings              | (any access)"
  echo ""
  local items=(
    "Account row is Cloudflare One Connectors (not Cloudflare Tunnel only) with Edit"
    "Zone row is DNS (NOT DNS Settings) with Edit"
    "Zone Resources includes your domain zone(s)"
  )
  local item
  for item in "${items[@]}"; do
    until cco_prompt_yes_no "  ✓ ${item}?" "Y"; do
      echo "    Update the token at https://dash.cloudflare.com/profile/api-tokens"
    done
  done
  echo ""
}

cco_prompt_cloudflare_api_token() {
  local token=""
  echo ""
  echo "Paste the API token only — not a curl command or URL."
  echo "The token is one long string (often 40+ characters)."
  echo ""
  while [[ -z "$token" ]]; do
    token="$(cco_prompt_secret "Cloudflare API token" "")"
    token="$(cco_cf_normalize_token "$token")"
    if [[ -z "$token" ]]; then
      echo "Token is required."
      continue
    fi
    if [[ "$token" == curl* ]] || [[ "$token" == *"api.cloudflare.com"* ]]; then
      echo "That looks like a command, not a token. Copy only the token from Cloudflare."
      token=""
      continue
    fi
    if ((${#token} < 30)); then
      echo "Token seems short (${#token} characters). It may be incomplete."
      if ! cco_prompt_yes_no "Use this token anyway?" "N"; then
        token=""
      fi
    fi
  done
  printf '%s' "$token"
}

cco_print_tunnel_api_summary() {
  local cco="$1" api="$2"
  cat <<EOF
Tunnel created via API. Verify in Cloudflare (optional):

  Zero Trust → Networks → Tunnels — connector should show Healthy
  DNS → Records:
    ${cco}  → CNAME → *.cfargotunnel.com  (Proxied)
    ${api}  → CNAME → *.cfargotunnel.com  (Proxied)

EOF
}

cco_print_cloudflare_hardening_guide() {
  cat <<'EOF'
── Cloudflare dashboard hardening (free plan) ────────────────────────────────

  Open https://dash.cloudflare.com/ → select your domain zone.

  Security → Settings
    • Security Level: High
    • Bot Fight Mode: On
    • Browser Integrity Check: On

  SSL/TLS → Edge Certificates
    • Always Use HTTPS: On
    • Minimum TLS Version: TLS 1.2 (or 1.3)
    • Automatic HTTPS Rewrites: On

  Network → WebSockets
    • Enabled (required for chat — on by default)

  DNS → Records
    • Both CCO hostnames must show Proxied (orange cloud)

EOF
}

cco_prompt_hardening_confirmations() {
  echo "Open the Cloudflare dashboard and confirm each item:"
  echo ""
  local items=(
    "Security Level set to High"
    "Bot Fight Mode enabled"
    "Browser Integrity Check enabled"
    "Always Use HTTPS enabled"
    "Minimum TLS 1.2 or higher"
    "WebSockets enabled (Network)"
    "Both hostnames Proxied (orange cloud) in DNS"
  )
  local item
  for item in "${items[@]}"; do
    until cco_prompt_yes_no "  ✓ ${item}?" "Y"; do
      echo "    Enable it in Cloudflare, then continue."
    done
  done
  echo ""
}

cco_extract_tunnel_token() {
  local input="$1" token=""
  input="${input//\"/}"
  input="${input//\'/}"
  if [[ "$input" =~ --token[=[:space:]]+([^[:space:]]+) ]]; then
    token="${BASH_REMATCH[1]}"
  elif [[ "$input" =~ TUNNEL_TOKEN=([^[:space:]]+) ]]; then
    token="${BASH_REMATCH[1]}"
  elif [[ "$input" =~ ^eyJ[^[:space:]]+$ ]]; then
    token="$input"
  fi
  if [[ -z "$token" ]]; then
    echo "Could not find a tunnel token in that input." >&2
    return 1
  fi
  printf '%s' "$token"
}

cco_stop_setup_connector() {
  if docker ps -a --format '{{.Names}}' 2>/dev/null | grep -qx "$CCO_SETUP_CLOUDFLARED_CONTAINER"; then
    docker rm -f "$CCO_SETUP_CLOUDFLARED_CONTAINER" >/dev/null 2>&1 || true
  fi
}

cco_start_setup_connector() {
  local token="$1"
  cco_stop_setup_connector
  echo "Starting cloudflared on this server..."
  if ! docker run -d \
    --name "$CCO_SETUP_CLOUDFLARED_CONTAINER" \
    --restart unless-stopped \
    cloudflare/cloudflared:latest \
    tunnel --no-autoupdate run --token "$token" >/dev/null; then
    echo "Failed to start cloudflared. Is Docker running?" >&2
    return 1
  fi
  sleep 4
  echo ""
  echo "Recent cloudflared logs:"
  docker logs "$CCO_SETUP_CLOUDFLARED_CONTAINER" 2>&1 | tail -8
  echo ""
}

cco_wait_for_connector_healthy() {
  until cco_prompt_yes_no "Cloudflare shows the tunnel connector as Healthy / Connected?" "Y"; do
    echo "  Check Zero Trust → Networks → Tunnels"
    echo "  Logs: docker logs ${CCO_SETUP_CLOUDFLARED_CONTAINER}"
    if cco_prompt_yes_no "Retry starting cloudflared?" "Y"; then
      cco_start_setup_connector "$1" || true
    fi
  done
  echo ""
}

cco_provision_tunnel_via_api() {
  local env_file="$1" cco_domain="$2" api_domain="$3"
  local token account_id

  cco_print_api_token_walkthrough "$cco_domain" "$api_domain"
  cco_press_enter "Press Enter to open Cloudflare and create the token"
  cco_prompt_api_token_permissions_checklist
  cco_press_enter "Press Enter when the token is created and copied"

  CF_API_TOKEN="$(cco_prompt_cloudflare_api_token)"
  export CF_API_TOKEN

  echo ""
  echo "Verifying API token with Cloudflare..."
  account_id="$(cco_cf_resolve_account_id)" || return 1
  echo "  ✓ API token valid"
  echo ""
  echo "Creating tunnel, routes, and DNS..."
  token="$(cco_cf_provision_tunnel "$account_id" "$cco_domain" "$api_domain")" || return 1

  echo ""
  echo "  ✓ Tunnel created"
  echo "  ✓ Ingress routes configured"
  echo "  ✓ Proxied CNAME records created"
  cco_print_tunnel_api_summary "$cco_domain" "$api_domain"

  cco_env_upsert "CLOUDFLARE_TUNNEL_TOKEN" "$token" "$env_file"
  cco_start_setup_connector "$token" || return 1
  cco_wait_for_connector_healthy "$token"

  printf '%s' "$token"
}

cco_provision_tunnel_manual() {
  local env_file="$1" cco_domain="$2" api_domain="$3"
  local token="" pasted=""

  cat <<EOF
Manual fallback — create the tunnel in Cloudflare, then paste the Docker command.

  1. https://one.dash.cloudflare.com/ → Networks → Tunnels → Create (name: cco)
  2. Install connector → Docker — copy the full docker run … --token eyJ… command
  3. Add public hostnames:
       ${cco_domain} → http://web:3000
       ${api_domain} → http://api:3001

EOF
  while [[ -z "$token" ]]; do
    echo "Paste the full Docker command from Cloudflare (or the eyJ… token alone):"
    cco_read -r -p "> " pasted
    token="$(cco_extract_tunnel_token "$pasted" 2>/dev/null || true)"
    if [[ -z "$token" ]]; then
      echo "Could not extract token — paste the full docker run command."
    fi
  done

  cco_env_upsert "CLOUDFLARE_TUNNEL_TOKEN" "$token" "$env_file"
  cco_start_setup_connector "$token" || return 1
  cco_wait_for_connector_healthy "$token"

  until cco_prompt_yes_no "Both hostnames configured in Zero Trust?" "Y"; do
    echo "  Tunnels → cco → Public Hostnames"
  done

  printf '%s' "$token"
}

cco_run_tunnel_setup() {
  local env_file="$1" cco_domain="$2" api_domain="$3"
  local token=""

  echo "CCO runs cloudflared in Docker. It connects outbound to Cloudflare."
  echo "This server does not need ports 80/443 open to the internet."
  echo ""

  token="$(cco_env_get CLOUDFLARE_TUNNEL_TOKEN "$env_file")"
  if cco_env_is_placeholder "$token"; then
    token=""
  fi

  if [[ -n "$token" ]] && cco_prompt_yes_no "A tunnel token exists in .env. Keep it?" "N"; then
    token=""
  fi

  if [[ -z "$token" ]]; then
    if cco_prompt_yes_no "Create tunnel automatically with a Cloudflare API token?" "Y"; then
      token="$(cco_provision_tunnel_via_api "$env_file" "$cco_domain" "$api_domain")" || return 1
    else
      token="$(cco_provision_tunnel_manual "$env_file" "$cco_domain" "$api_domain")" || return 1
    fi
  elif ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CCO_SETUP_CLOUDFLARED_CONTAINER"; then
    cco_start_setup_connector "$token" || true
  fi

  printf '%s' "$token"
}
