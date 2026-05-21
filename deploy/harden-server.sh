#!/usr/bin/env bash
# Optional VPS hardening when using Cloudflare Tunnel (no public HTTP/S needed).
# Usage: sudo ./deploy/harden-server.sh
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root: sudo ./deploy/harden-server.sh" >&2
  exit 1
fi

echo ""
echo "CCO server hardening (Cloudflare Tunnel mode)"
echo "  • Default deny incoming"
echo "  • Allow SSH"
echo "  • No public web ports required"
echo ""

if command -v ufw >/dev/null 2>&1; then
  ufw default deny incoming
  ufw default allow outgoing
  ufw allow OpenSSH
  # Remove common web rules if present (tunnel-only ingress).
  ufw delete allow 80/tcp 2>/dev/null || true
  ufw delete allow 443/tcp 2>/dev/null || true
  ufw --force enable
  echo ""
  ufw status verbose
  echo ""
  echo "UFW configured."
else
  echo "ufw not installed — skip or install: apt install ufw"
fi

echo ""
echo "Also close ports 80/443 in your cloud provider firewall (e.g. Vultr)."
echo "SSH should remain open for administration."
echo ""
