# Cloudflare Tunnel setup — manual Zero Trust / cloudflared flow for ./deploy/setup.sh.

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
  TOKEN_IN="$t" python3 -c '
import os, re
t = os.environ.get("TOKEN_IN", "")
t = t.replace("\r", "").replace("\n", " ").strip()
while t.lower().startswith("bearer "):
    t = t[7:].strip()
t = re.sub(r"[\u200b-\u200d\ufeff]", "", t)
t = re.sub(r"[^A-Za-z0-9._-]", "", t)
print(t)
'
}

cco_cf_token_kind_warning() {
  local t="$1"
  if [[ "$t" =~ ^[a-fA-F0-9]{32,40}$ ]]; then
    echo "That looks like your Global API Key — it cannot be used as a Bearer token." >&2
    echo "  Create a custom token instead: https://dash.cloudflare.com/profile/api-tokens" >&2
    echo "  → Create Token → Create Custom Token (not the Global API Key at the bottom)." >&2
    return 1
  fi
  if [[ "$t" == eyJ* ]] && ((${#t} > 400)); then
    echo "That looks like a tunnel run token (from docker run … --token eyJ…)." >&2
    echo "  This step needs an API token from profile/api-tokens, not the tunnel token." >&2
    return 1
  fi
  return 0
}

cco_cf_explain_auth_header_error() {
  local json="${1:-}"
  if [[ -n "$json" ]] && [[ "$json" != *'"code":6111'* ]] && [[ "$json" != *'"code":6003'* ]]; then
    return 0
  fi
  cat <<'EOF' >&2

Cloudflare error 6111 / 6003 — invalid Authorization header. Common causes:

  ✗ Global API Key (bottom of profile/api-tokens) — use Create Custom Token instead
  ✗ Tunnel run token (eyJ… from Zero Trust → Docker install) — wrong token type here
  ✗ Truncated paste — copy the full token again from the Create Token screen
  ✗ Extra text — paste only the token, not "Bearer ", quotes, or a curl command
  ✗ Conflicting ~/.netrc — use curl --disable (see deploy/check-cloudflare-token.sh)
  ✗ Empty paste — token length should be 40+, not 0

Create the token at: https://dash.cloudflare.com/profile/api-tokens
  → Create Token → Create Custom Token
  → Account | Cloudflare One Connectors | Edit
  → Zone     | DNS                       | Edit

EOF
  if [[ -f "${HOME}/.netrc" ]] && grep -qiE 'cloudflare|api\.cloudflare' "${HOME}/.netrc" 2>/dev/null; then
    echo "  ⚠ Found Cloudflare entries in ~/.netrc — this often causes 6111." >&2
    echo "    Test with: curl --disable ..." >&2
  fi
}

cco_cf_write_curl_auth() {
  local hdr="$1"
  if [[ -n "${CF_AUTH_EMAIL:-}" && -n "${CF_AUTH_KEY:-}" ]]; then
    {
      printf 'X-Auth-Email: %s\n' "$CF_AUTH_EMAIL"
      printf 'X-Auth-Key: %s\n' "$CF_AUTH_KEY"
    } >"$hdr"
  elif [[ -n "${CF_API_TOKEN:-}" ]]; then
    printf 'Authorization: Bearer %s' "$CF_API_TOKEN" >"$hdr"
  else
    echo "No Cloudflare credentials configured." >&2
    return 1
  fi
}

cco_cf_clear_legacy_auth() {
  unset CF_AUTH_EMAIL CF_AUTH_KEY
}

cco_cf_clear_bearer_auth() {
  unset CF_API_TOKEN
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
  local err_file auth_file response curl_status

  err_file="$(mktemp)"
  auth_file="$(mktemp)"
  if ! cco_cf_write_curl_auth "$auth_file"; then
    rm -f "$err_file" "$auth_file"
    return 1
  fi
  if [[ "$method" == GET && $# -gt 0 ]]; then
    local curl_args=( -sS --disable --http1.1 -4 --connect-timeout 30 --max-time 120 -G "$url" )
    local q
    for q in "$@"; do
      curl_args+=( --data-urlencode "$q" )
    done
    curl_args+=( -H @"$auth_file" )
    response="$(curl "${curl_args[@]}" 2>"$err_file")"
  elif [[ "$method" == GET ]]; then
    response="$(curl -sS --disable --http1.1 -4 \
      --connect-timeout 30 --max-time 120 \
      -X GET "$url" \
      -H @"$auth_file" \
      2>"$err_file")"
  else
    local data="$1"
    response="$(curl -sS --disable --http1.1 -4 \
      --connect-timeout 30 --max-time 120 \
      -X "$method" "$url" \
      -H @"$auth_file" \
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
    rm -f "$err_file" "$auth_file"
    return 1
  fi
  rm -f "$err_file" "$auth_file"
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
    for nested in err.get("error_chain") or []:
        ncode = nested.get("code", "")
        nmsg = nested.get("message", nested)
        print(f"    [{ncode}] {nmsg}")
' 2>/dev/null || true
}

cco_cf_verify_credentials() {
  local response verify_path="user/tokens/verify"
  if [[ -n "${CF_AUTH_EMAIL:-}" && -n "${CF_AUTH_KEY:-}" ]]; then
    verify_path="user"
  elif [[ -z "${CF_API_TOKEN:-}" ]]; then
    echo "API token is empty (0 characters after paste)." >&2
    echo "  Paste failed or token was stripped — try visible paste." >&2
    return 1
  fi
  response="$(cco_cf_api GET "/${verify_path}")" || true
  if [[ -n "$response" ]] && cco_cf_json_success "$response"; then
    return 0
  fi
  echo "Cloudflare rejected these credentials:" >&2
  cco_cf_json_errors "$response"
  cco_cf_explain_auth_header_error "$response"
  return 1
}

cco_cf_verify_api_token() {
  cco_cf_verify_credentials
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
  echo "  Do NOT paste Zone ID (also 32-char hex, but wrong for tunnel API)."
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

cco_cf_account_id_for_domain() {
  local hostname="$1" zone_id response account_id
  zone_id="$(cco_cf_find_zone_id "$hostname")" || return 1
  response="$(cco_cf_api GET "/zones/${zone_id}")" || return 1
  if ! cco_cf_json_success "$response"; then
    cco_cf_json_errors "$response"
    return 1
  fi
  account_id="$(cco_cf_json_field "$response" "result.account.id" 2>/dev/null || true)"
  if [[ -z "$account_id" ]]; then
    echo "Could not read account ID for zone ${hostname}." >&2
    return 1
  fi
  printf '%s' "$account_id"
}

cco_cf_resolve_account_id_for_domains() {
  local cco="$1" api="$2"
  local account_cco account_api resolved

  account_cco="$(cco_cf_account_id_for_domain "$cco" 2>/dev/null || true)"
  if [[ -n "$account_cco" ]]; then
    if [[ "$api" != "$cco" ]]; then
      account_api="$(cco_cf_account_id_for_domain "$api" 2>/dev/null || true)"
      if [[ -n "$account_api" && "$account_api" != "$account_cco" ]]; then
        echo "Web and API domains are in different Cloudflare accounts." >&2
        echo "  ${cco} → account ${account_cco}" >&2
        echo "  ${api} → account ${account_api}" >&2
        return 1
      fi
    fi
    echo "  Account ID (from zone lookup): ${account_cco}" >&2
    printf '%s' "$account_cco"
    return 0
  fi

  resolved="$(cco_cf_resolve_account_id)" || return 1
  printf '%s' "$resolved"
}

cco_cf_validate_account_id() {
  local account_id="$1"
  local response
  account_id="$(cco_cf_normalize_account_id "$account_id")"
  response="$(cco_cf_api GET "/accounts/${account_id}")" || true
  if [[ -n "$response" ]] && cco_cf_json_success "$response"; then
    return 0
  fi
  echo "Could not verify Account ID ${account_id}." >&2
  cco_cf_json_errors "$response"
  echo "" >&2
  echo "Common mix-up: Zone ID and Account ID are both 32-character hex strings." >&2
  echo "  Account ID — Overview page, right column under your domain name" >&2
  echo "  Zone ID    — same page, API section (do not use this here)" >&2
  return 1
}

cco_cf_explain_tunnel_error() {
  local json="$1"
  JSON="$json" python3 -c '
import json, os
try:
    data = json.loads(os.environ["JSON"])
except json.JSONDecodeError:
    raise SystemExit(0)
errors = data.get("errors") or []
codes = {e.get("code") for e in errors}
for err in errors:
    for nested in err.get("error_chain") or []:
        codes.add(nested.get("code"))
messages = " ".join(str(e.get("message", "")) for e in errors).lower()
if codes & {9109, 10000, 9103, 9101, 403} or "permission" in messages or "unauthorized" in messages:
    print("""
Likely fix — token missing tunnel permission:
  Account → Cloudflare Tunnel → Edit
  (dropdown may say "Cloudflare One Connectors" — same permission)
  Create a new custom token; Global API Key often lacks this permission.
""")
if "already exists" in messages:
    print("A tunnel with this name may already exist — retrying should reuse it.")
' 2>/dev/null || true
}

cco_cf_find_tunnel_by_name() {
  local account_id="$1" tunnel_name="$2"
  local response tunnel_id
  account_id="$(cco_cf_normalize_account_id "$account_id")"
  response="$(cco_cf_api GET "/accounts/${account_id}/cfd_tunnel?is_deleted=false&name=${tunnel_name}")" || true
  if ! cco_cf_json_success "$response"; then
    return 1
  fi
  tunnel_id="$(cco_cf_json_field "$response" "result.0.id" 2>/dev/null || true)"
  if [[ -n "$tunnel_id" ]]; then
    printf '%s' "$tunnel_id"
    return 0
  fi
  return 1
}

cco_cf_get_tunnel_run_token() {
  local account_id="$1" tunnel_id="$2"
  local response token
  account_id="$(cco_cf_normalize_account_id "$account_id")"
  response="$(cco_cf_api GET "/accounts/${account_id}/cfd_tunnel/${tunnel_id}/token")" || return 1
  if ! cco_cf_json_success "$response"; then
    echo "Failed to fetch tunnel run token." >&2
    cco_cf_json_errors "$response"
    cco_cf_explain_tunnel_error "$response"
    return 1
  fi
  token="$(cco_cf_json_field "$response" "result")"
  printf '%s' "$token"
}

cco_cf_create_or_reuse_tunnel() {
  local account_id="$1" tunnel_name="$2"
  local response tunnel_id existing
  account_id="$(cco_cf_normalize_account_id "$account_id")"

  existing="$(cco_cf_find_tunnel_by_name "$account_id" "$tunnel_name" 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    echo "  Reusing existing tunnel: ${tunnel_name}" >&2
    printf '%s' "$existing"
    return 0
  fi

  response="$(cco_cf_api POST "/accounts/${account_id}/cfd_tunnel" \
    "{\"name\":\"${tunnel_name}\",\"config_src\":\"cloudflare\"}")" || return 1
  if cco_cf_json_success "$response"; then
    tunnel_id="$(cco_cf_json_field "$response" "result.id")"
    printf '%s' "$tunnel_id"
    return 0
  fi

  echo "Failed to create Cloudflare Tunnel." >&2
  echo "  Account ID: ${account_id}" >&2
  echo "  Tunnel name: ${tunnel_name}" >&2
  cco_cf_json_errors "$response"
  cco_cf_explain_tunnel_error "$response"

  existing="$(cco_cf_find_tunnel_by_name "$account_id" "$tunnel_name" 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    echo "  Found existing tunnel — reusing ${existing}" >&2
    printf '%s' "$existing"
    return 0
  fi
  return 1
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
  tunnel_id="$(cco_cf_create_or_reuse_tunnel "$account_id" "$tunnel_name")" || return 1

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
    cco_cf_explain_tunnel_error "$response"
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
    cco_cf_explain_tunnel_error "$response"
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
     (NOT the Global API Key shown at the bottom of that page)

  3. Token name (suggested): CCO tunnel setup

  4. Permissions — add these rows (pick the exact names from the dropdowns):

       Scope     | Permission                  | Access
       ──────────|─────────────────────────────|────────
       Account   | Cloudflare Tunnel           | Edit
       Zone      | DNS                         | Edit

     The Account dropdown may say "Cloudflare One Connectors" instead of
     "Cloudflare Tunnel" — either label with Edit is correct.

     WRONG — do not use these instead:
       ✗ Global API Key (same page, scroll down) — causes error 6111
       ✗ Tunnel run token (eyJ… from Zero Trust Docker install) — different step
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
  echo "  RIGHT:  Account | Cloudflare Tunnel (or Cloudflare One Connectors) | Edit"
  echo "  RIGHT:  Zone     | DNS                                               | Edit"
  echo "  WRONG:  Zone     | DNS Settings              | (any access)"
  echo ""
  local items=(
    "Account row is Cloudflare Tunnel or Cloudflare One Connectors with Edit"
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

cco_prompt_cloudflare_global_api_key() {
  local email="" key=""
  echo ""
  echo "Global API Key fallback (less secure — prefer a custom API token when possible)."
  echo "From https://dash.cloudflare.com/profile/api-tokens scroll to Global API Key."
  echo ""
  cco_cf_clear_bearer_auth
  email="$(cco_prompt "Cloudflare account email" "")"
  email="${email#"${email%%[![:space:]]*}"}"
  email="${email%"${email##*[![:space:]]}"}"
  if [[ -z "$email" ]]; then
    echo "Email is required." >&2
    return 1
  fi
  key="$(cco_prompt_secret "Global API Key" "")"
  key="$(cco_cf_normalize_token "$key")"
  if [[ -z "$key" ]]; then
    echo "Global API Key is required." >&2
    return 1
  fi
  CF_AUTH_EMAIL="$email"
  CF_AUTH_KEY="$key"
  export CF_AUTH_EMAIL CF_AUTH_KEY
  echo ""
  echo "Verifying Global API Key with Cloudflare..."
  if cco_cf_verify_credentials; then
    echo "  ✓ Global API Key accepted"
    return 0
  fi
  cco_cf_clear_legacy_auth
  return 1
}

cco_read_cloudflare_api_token() {
  local token=""
  echo "Paste the custom API token (visible — SSH hidden paste often truncates):"
  cco_read -r -p "> " token
  token="$(cco_cf_normalize_token "$token")"
  printf '%s' "$token"
}

cco_prompt_cloudflare_api_token() {
  local token=""
  echo ""
  echo "Paste the custom API token only — not Global API Key, tunnel token, or curl command."
  echo "Create at https://dash.cloudflare.com/profile/api-tokens → Create Custom Token."
  echo "Copy the secret string shown once after Create Token (not the token name/ID in the list)."
  echo ""
  while [[ -z "$token" ]]; do
    token="$(cco_read_cloudflare_api_token)"
    if [[ -z "$token" ]]; then
      echo "Token is empty — paste did not capture anything."
      if cco_prompt_yes_no "Use Global API Key + email instead?" "N"; then
        cco_prompt_cloudflare_global_api_key && return 0
      fi
      continue
    fi
    if [[ "$token" == curl* ]] || [[ "$token" == *"api.cloudflare.com"* ]]; then
      echo "That looks like a command, not a token. Copy only the token from Cloudflare."
      token=""
      continue
    fi
    if ! cco_cf_token_kind_warning "$token"; then
      if cco_prompt_yes_no "Use Global API Key + email instead?" "Y"; then
        cco_prompt_cloudflare_global_api_key && return 0
      fi
      token=""
      continue
    fi
    echo "  Token length: ${#token} characters"
    if ((${#token} < 30)); then
      echo "Token seems short — you may have copied the token ID (UUID), not the secret."
      if ! cco_prompt_yes_no "Use this token anyway?" "N"; then
        token=""
        continue
      fi
    fi
    cco_cf_clear_legacy_auth
    CF_API_TOKEN="$token"
    export CF_API_TOKEN
    echo ""
    echo "Verifying API token with Cloudflare..."
    if cco_cf_verify_credentials; then
      echo "  ✓ API token accepted"
      break
    fi
    token=""
    if cco_prompt_yes_no "Try Global API Key + email instead?" "Y"; then
      cco_prompt_cloudflare_global_api_key && return 0
    fi
  done
  return 0
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

  cco_prompt_cloudflare_api_token || return 1

  echo ""
  account_id="$(cco_cf_resolve_account_id_for_domains "$cco_domain" "$api_domain")" || return 1
  cco_cf_validate_account_id "$account_id" || return 1
  echo ""
  echo "Creating tunnel, routes, and DNS..."
  if ! token="$(cco_cf_provision_tunnel "$account_id" "$cco_domain" "$api_domain")"; then
    echo ""
    if cco_prompt_yes_no "Automatic tunnel setup failed. Create the tunnel manually in Cloudflare?" "Y"; then
      cco_provision_tunnel_manual "$env_file" "$cco_domain" "$api_domain"
      return $?
    fi
    return 1
  fi

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

cco_print_manual_tunnel_guide() {
  local cco_domain="$1" api_domain="$2"
  cat <<EOF
── Create the tunnel in Cloudflare Zero Trust ────────────────────────────────

  1. Open https://one.dash.cloudflare.com/
     Networks → Tunnels → Create a tunnel
     Name (suggested): cco

  2. Install connector → Docker
     Copy the full docker run … --token eyJ… command (shown once).
     Do not paste it into a shell yet — the wizard will start cloudflared for you.

  3. Public Hostnames (same tunnel):
       ${cco_domain}  →  http://web:3000
       ${api_domain}  →  http://api:3001

     Cloudflare usually creates proxied CNAME records for these hostnames.
     If not, add CNAME records in DNS → Records (orange cloud / Proxied).

  4. Keep the eyJ… token copied — the wizard asks you to paste it on the next screen.

  Not required here: Cloudflare API tokens, Global API Key, or WARP client.

EOF
}

cco_provision_tunnel_manual() {
  local env_file="$1" cco_domain="$2" api_domain="$3"
  local token="" pasted=""

  cco_print_manual_tunnel_guide "$cco_domain" "$api_domain"
  cco_press_enter "Press Enter when steps 1–3 are done in Cloudflare (tunnel created, Docker token copied, both hostnames added)"
  echo ""
  echo "── Paste tunnel run token ────────────────────────────────────────────────────"
  echo ""
  echo "From Zero Trust → your tunnel → Install connector → Docker, copy either:"
  echo "  • the full  docker run … --token eyJ…  command, or"
  echo "  • just the eyJ… token string"
  echo ""
  while [[ -z "$token" ]]; do
    cco_read -r -p "Paste here: " pasted
    token="$(cco_extract_tunnel_token "$pasted" 2>/dev/null || true)"
    if [[ -z "$token" ]]; then
      echo ""
      echo "Could not find a token — paste the full docker run command or the eyJ… token."
      echo ""
    fi
  done

  cco_env_upsert "CLOUDFLARE_TUNNEL_TOKEN" "$token" "$env_file"
  echo ""
  echo "  ✓ Tunnel token saved to ${env_file}"
  echo ""

  while ! cco_start_setup_connector "$token"; do
    echo ""
    if ! cco_prompt_yes_no "cloudflared failed to start. Retry?" "Y"; then
      echo "Ensure Docker is running, then run ./deploy/setup.sh again." >&2
      return 1
    fi
  done
  cco_wait_for_connector_healthy "$token"

  until cco_prompt_yes_no "Both hostnames show in Zero Trust → Tunnels → cco → Public Hostnames?" "Y"; do
    echo "  Add:"
    echo "    ${cco_domain}  →  http://web:3000"
    echo "    ${api_domain}  →  http://api:3001"
  done

  return 0
}

cco_run_tunnel_setup() {
  local env_file="$1" cco_domain="$2" api_domain="$3"
  local token=""

  echo "CCO runs cloudflared in Docker. It connects outbound to Cloudflare."
  echo "This server does not need ports 80/443 open to the internet."
  echo ""
  echo "Follow the steps below in Cloudflare Zero Trust, then paste the run token."
  echo ""

  token="$(cco_env_get CLOUDFLARE_TUNNEL_TOKEN "$env_file")"
  if cco_env_is_placeholder "$token"; then
    token=""
  fi

  if [[ -n "$token" ]] && cco_prompt_yes_no "A tunnel token exists in .env. Keep it?" "N"; then
    token=""
  fi

  if [[ -z "$token" ]]; then
    cco_provision_tunnel_manual "$env_file" "$cco_domain" "$api_domain" || return 1
    token="$(cco_env_get CLOUDFLARE_TUNNEL_TOKEN "$env_file")"
  elif ! docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$CCO_SETUP_CLOUDFLARED_CONTAINER"; then
    cco_start_setup_connector "$token" || true
  fi

  if [[ -z "$token" ]] || cco_env_is_placeholder "$token"; then
    echo "CLOUDFLARE_TUNNEL_TOKEN is missing from ${env_file}." >&2
    return 1
  fi

  return 0
}
