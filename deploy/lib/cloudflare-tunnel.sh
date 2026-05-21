# Cloudflare Tunnel walkthrough for deploy/setup.sh (dashboard only — no API tokens).

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

cco_run_tunnel_setup() {
  local env_file="$1" cco_domain="$2" api_domain="$3"
  local token=""

  echo "CCO runs cloudflared in Docker. It connects outbound to Cloudflare."
  echo "This server does not need ports 80/443 open to the internet."
  echo ""
  echo "You will create the tunnel in the Cloudflare dashboard, then paste"
  echo "the run token here. Follow each sub-step below."
  echo ""

  token="$(cco_env_get CLOUDFLARE_TUNNEL_TOKEN "$env_file")"
  if cco_env_is_placeholder "$token"; then
    token=""
  fi

  if [[ -n "$token" ]] && cco_prompt_yes_no "A tunnel token exists in .env. Keep it?" "N"; then
    token=""
  fi

  if [[ -z "$token" ]]; then
    cat <<EOF
── A. Create the tunnel ─────────────────────────────────────────────────────

  1. Open https://one.dash.cloudflare.com/
  2. Go to Networks → Connectors → Cloudflare Tunnels
  3. Click Create a tunnel
  4. Name it: cco
  5. Click Save tunnel

EOF
    cco_press_enter "Press Enter when the tunnel named cco is created"

    cat <<EOF
── B. Add the web hostname ──────────────────────────────────────────────────

  In the tunnel setup, go to Public Hostnames → Add a public hostname:

    Subdomain / hostname:  ${cco_domain}
    Service type:          HTTP
    URL:                   web:3000

  (Cloudflare may show separate fields — use the full hostname above and
   service URL exactly as: web:3000)

  Do NOT use localhost — CCO's Docker network uses the service name web.

EOF
    until cco_prompt_yes_no "Public hostname ${cco_domain} → http://web:3000 saved?" "Y"; do
      echo "  Zero Trust → Networks → Tunnels → cco → Public Hostnames"
    done
    echo ""

    cat <<EOF
── C. Add the API hostname ──────────────────────────────────────────────────

  Add another public hostname:

    Subdomain / hostname:  ${api_domain}
    Service type:          HTTP
    URL:                   api:3001

EOF
    until cco_prompt_yes_no "Public hostname ${api_domain} → http://api:3001 saved?" "Y"; do
      echo "  Zero Trust → Networks → Tunnels → cco → Public Hostnames"
    done
    echo ""

    cat <<EOF
── D. Copy the tunnel run token (do not run Cloudflare's command) ───────────

  1. In the tunnel page, open Install connector (or Configure)
  2. Select Docker — this matches how CCO runs cloudflared
  3. Cloudflare shows a command like:
       docker run cloudflare/cloudflared:latest tunnel run --token eyJ...
     Do NOT run that command on your server during setup.
  4. Copy only the token (the long eyJ… string after --token)
  5. Paste it when prompted below — CCO starts cloudflared automatically
     when you deploy (./deploy/bootstrap.sh → docker compose)

  Why: CCO's stack already includes a cloudflared container on the same
  Docker network as web and api. Running Cloudflare's one-off docker command
  would start a second connector and can fail to reach web:3000 / api:3001.

  Do not choose Debian unless you plan to run cloudflared outside Docker
  (not supported by CCO's default deploy).

EOF
    cco_press_enter "Press Enter when you have copied the run token"
    while [[ -z "$token" ]]; do
      token="$(cco_prompt_secret "Paste Cloudflare tunnel run token" "")"
      if [[ -z "$token" ]]; then
        echo "Tunnel token is required."
      fi
    done
    echo ""

    cat <<EOF
── E. Verify DNS ────────────────────────────────────────────────────────────

  Open https://dash.cloudflare.com/ → your zone → DNS → Records.

  You should see CNAME records for:
    ${cco_domain}
    ${api_domain}

  Both must show Proxied (orange cloud). Do NOT add A records to this
  server's IP address.

EOF
    until cco_prompt_yes_no "Both hostnames show Proxied (orange cloud) in DNS?" "Y"; do
      echo "  DNS → Records → enable proxy (orange cloud) for both hostnames"
    done
    echo ""
  fi

  printf '%s' "$token"
}
