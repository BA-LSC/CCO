# VPS and cloud-provider firewall walkthrough (Cloudflare Tunnel mode).

cco_print_vps_firewall_guide() {
  cat <<'EOF'
CCO uses Cloudflare Tunnel — traffic enters through Cloudflare, not open ports
on this server. Lock down the VPS and your cloud provider firewall.

── Cloud provider firewall (Vultr, AWS, etc.) ─────────────────────────────

  1. Open your provider's control panel → this server → Firewall / Security

  2. ALLOW inbound:
       • TCP 22 (SSH) — restrict to your IP if possible

  3. REMOVE or do NOT add inbound rules for:
       • TCP 80  (HTTP)  — not needed
       • TCP 443 (HTTPS) — not needed

  Vultr: Instance → Settings → Firewall → edit group attached to this VPS
         (or Account → Firewall at vultr.com/firewall)

── This server (UFW) ───────────────────────────────────────────────────────

  The wizard will configure UFW next:
    • Default deny incoming
    • Allow SSH only
    • Remove any existing allow rules for 80/443

EOF
}

cco_prompt_vps_firewall_confirmations() {
  echo "Confirm in your cloud provider's firewall panel:"
  echo ""
  local items=(
    "SSH (TCP 22) is allowed inbound"
    "TCP 80 is NOT open to the internet (removed or never added)"
    "TCP 443 is NOT open to the internet (removed or never added)"
  )
  local item
  for item in "${items[@]}"; do
    until cco_prompt_yes_no "  ✓ ${item}?" "Y"; do
      echo "    Update your provider firewall, then continue."
    done
  done
  echo ""
}

cco_apply_server_firewall() {
  local root="$1"
  echo "Applying UFW rules on this server..."
  echo ""
  if [[ "${EUID:-$(id -u)}" -eq 0 ]]; then
    "${root}/deploy/harden-server.sh"
    return $?
  fi
  if command -v sudo >/dev/null 2>&1; then
    sudo "${root}/deploy/harden-server.sh"
    return $?
  fi
  echo "Could not run firewall hardening — need root or sudo." >&2
  return 1
}

cco_prompt_ufw_confirmation() {
  local root="$1"
  until cco_prompt_yes_no "  ✓ UFW configured (SSH only, no public HTTP/S)?" "Y"; do
    echo "    Re-run: sudo ./deploy/harden-server.sh"
    if cco_prompt_yes_no "Try running UFW hardening again now?" "Y"; then
      cco_apply_server_firewall "$root" || true
    fi
  done
  echo ""
}
