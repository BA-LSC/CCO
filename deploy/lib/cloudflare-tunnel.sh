# Cloudflare Tunnel helpers for deploy scripts.
# Requires: curl, python3 (JSON parsing)

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

cco_cf_api() {
  local method="$1" path="$2" data="${3:-}"
  local response
  if [[ -n "$data" ]]; then
    response="$(curl -sS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json" \
      --data "$data")"
  else
    response="$(curl -sS -X "$method" "https://api.cloudflare.com/client/v4${path}" \
      -H "Authorization: Bearer ${CF_API_TOKEN}" \
      -H "Content-Type: application/json")"
  fi
  printf '%s' "$response"
}

cco_cf_json_success() {
  local json="$1"
  JSON="$json" python3 -c 'import json, os, sys; sys.exit(0 if json.loads(os.environ["JSON"]).get("success") else 1)'
}

cco_cf_json_field() {
  local json="$1" expr="$2"
  JSON="$json" EXPR="$expr" python3 -c '
import json, os
data = json.loads(os.environ["JSON"])
expr = os.environ["EXPR"]
cur = data
for part in expr.split("."):
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
  local response account_id
  response="$(cco_cf_api GET "/accounts?per_page=1")"
  if ! cco_cf_json_success "$response"; then
    echo "Cloudflare API token could not list accounts. Check token permissions." >&2
    return 1
  fi
  account_id="$(cco_cf_json_field "$response" "result.0.id" 2>/dev/null || true)"
  if [[ -z "$account_id" ]]; then
    echo "No Cloudflare account found for this API token." >&2
    return 1
  fi
  printf '%s' "$account_id"
}

cco_cf_find_zone_id() {
  local hostname="$1" candidate="$hostname" response zone_id
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
  response="$(cco_cf_api GET "/zones/${zone_id}/dns_records?type=CNAME&name=${fqdn}")"
  if ! cco_cf_json_success "$response"; then
    echo "Failed to list DNS records for ${fqdn}." >&2
    return 1
  fi
  record_id="$(JSON="$response" python3 -c '
import json, os
data = json.loads(os.environ["JSON"])
for row in data.get("result", []):
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

# Create tunnel, ingress, DNS, return run token on stdout.
cco_cf_provision_tunnel() {
  local account_id="$1" cco_domain="$2" api_domain="$3"
  local response tunnel_id tunnel_name token zone_id zone_name payload

  cco_cf_require_tools || return 1

  tunnel_name="cco-$(echo "$cco_domain" | tr '.:' '-')"
  response="$(cco_cf_api POST "/accounts/${account_id}/cfd_tunnel" \
    "{\"name\":\"${tunnel_name}\",\"config_src\":\"cloudflare\"}")"
  if ! cco_cf_json_success "$response"; then
    echo "Failed to create Cloudflare Tunnel." >&2
    JSON="$response" python3 -c 'import json, os; print(json.loads(os.environ["JSON"]).get("errors", []))' >&2 || true
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
  response="$(cco_cf_api PUT "/accounts/${account_id}/cfd_tunnel/${tunnel_id}/configurations" "$payload")"
  if ! cco_cf_json_success "$response"; then
    echo "Failed to configure tunnel ingress." >&2
    return 1
  fi

  zone_id="$(cco_cf_find_zone_id "$cco_domain")" || return 1
  cname_target="${tunnel_id}.cfargotunnel.com"

  cco_cf_upsert_cname "$zone_id" "$cco_domain" "$cname_target" || return 1
  if [[ "$api_domain" != "$cco_domain" ]]; then
    api_zone_id="$(cco_cf_find_zone_id "$api_domain")" || return 1
    cco_cf_upsert_cname "$api_zone_id" "$api_domain" "$cname_target" || return 1
  fi

  response="$(cco_cf_api GET "/accounts/${account_id}/cfd_tunnel/${tunnel_id}/token")"
  if ! cco_cf_json_success "$response"; then
    echo "Failed to fetch tunnel run token." >&2
    return 1
  fi
  token="$(cco_cf_json_field "$response" "result")"
  printf '%s' "$token"
}

cco_print_tunnel_manual_guide() {
  local cco="$1" api="$2"
  cat <<EOF
Create a Cloudflare Tunnel (free) so traffic never hits this server directly.

  1. Open https://one.dash.cloudflare.com/
     → Networks → Connectors → Cloudflare Tunnels → Create a tunnel

  2. Name the tunnel: cco

  3. Choose Docker as the connector environment and copy the install token
     (a long string). You will paste it in the next step.

  4. Before closing the wizard, add two Public Hostnames:

       Public hostname                    Service (Docker network)
       ─────────────────────────────────  ─────────────────────────
       ${cco}                             http://web:3000
       ${api}                             http://api:3001

     Cloudflare creates proxied CNAME records automatically when you save
     these hostnames (no A record to this server's IP).

  5. Do NOT open ports 80/443 on this VPS — cloudflared connects outbound only.

EOF
}

cco_print_cloudflare_hardening_guide() {
  cat <<'EOF'
Cloudflare security hardening (free plan — do this in the Cloudflare dashboard):

  Security → Settings
    • Security Level: High
    • Bot Fight Mode: On
    • Browser Integrity Check: On

  SSL/TLS → Edge Certificates
    • Always Use HTTPS: On
    • Minimum TLS Version: TLS 1.2 (or 1.3)
    • Automatic HTTPS Rewrites: On

  Network
    • WebSockets: enabled (required for chat — on by default)

  Security → Bots (optional)
    • Enable Bot Fight Mode if not already on from Settings

  DNS
    • Confirm both hostnames show the orange cloud (Proxied)

EOF
}

cco_prompt_hardening_confirmations() {
  echo "Confirm each hardening item in the Cloudflare dashboard:"
  echo ""
  local items=(
    "Security Level set to High"
    "Bot Fight Mode enabled"
    "Browser Integrity Check enabled"
    "Always Use HTTPS enabled"
    "Minimum TLS 1.2 or higher"
    "Both hostnames proxied (orange cloud)"
  )
  local item
  for item in "${items[@]}"; do
    until cco_prompt_yes_no "  ✓ ${item}?" "Y"; do
      echo "    Enable it in Cloudflare, then continue."
    done
  done
  echo ""
}
