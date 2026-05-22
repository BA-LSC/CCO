#!/usr/bin/env bash
# Diagnose Cloudflare API auth (6111 / 6003). Run on the server: ./deploy/check-cloudflare-token.sh
set -euo pipefail

if [[ -r /dev/tty ]]; then
  exec </dev/tty
fi

echo "Cloudflare API token diagnostic"
echo "================================"
echo ""
echo "You need a CUSTOM API token (Create Custom Token), NOT:"
echo "  • Global API Key (bottom of profile/api-tokens page)"
echo "  • Tunnel docker token (eyJ… from Zero Trust install)"
echo "  • Token name/ID from the token list (UUID) — only the secret shown once at creation"
echo ""

if [[ -f "${HOME}/.netrc" ]] && grep -qiE 'cloudflare|api\.cloudflare' "${HOME}/.netrc" 2>/dev/null; then
  echo "⚠  ~/.netrc contains Cloudflare entries — curl must use --disable (this script does)."
  echo ""
fi

echo "Paste your custom API token (visible):"
read -r RAW </dev/tty
TOKEN="$(TOKEN_IN="$RAW" python3 -c '
import os, re
t = os.environ.get("TOKEN_IN", "")
t = t.replace("\r", "").replace("\n", " ").strip()
while t.lower().startswith("bearer "):
    t = t[7:].strip()
t = re.sub(r"[\u200b-\u200d\ufeff]", "", t)
t = re.sub(r"[^A-Za-z0-9._-]", "", t)
print(t)
')"

echo ""
echo "Token length: ${#TOKEN} characters"
if [[ ${#TOKEN} -eq 0 ]]; then
  echo "FAIL: empty token — paste did not capture anything."
  exit 1
fi
echo "Preview: ${TOKEN:0:8}…${TOKEN: -4}"

if [[ "$TOKEN" =~ ^[a-fA-F0-9]{32,40}$ ]]; then
  echo ""
  echo "FAIL: this looks like your Global API Key (hex only). It cannot be used as Bearer token."
  echo "  Create Custom Token at https://dash.cloudflare.com/profile/api-tokens"
  exit 1
fi

if [[ "$TOKEN" == eyJ* ]] && ((${#TOKEN} > 400)); then
  echo ""
  echo "WARN: this looks like a tunnel run token, not an API token."
fi

if ((${#TOKEN} < 30)); then
  echo ""
  echo "WARN: token is very short — you may have copied the token ID (UUID), not the secret."
fi

HDR="$(mktemp)"
printf 'Authorization: Bearer %s' "$TOKEN" >"$HDR"
echo ""
echo "Calling GET /user/tokens/verify …"
RESP="$(curl -sS --disable --http1.1 -4 \
  --connect-timeout 30 --max-time 60 \
  "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H @"$HDR")"
rm -f "$HDR"

echo "$RESP"
echo ""

if echo "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("success") else 1)' 2>/dev/null; then
  echo "OK: token is valid."
  exit 0
fi

if echo "$RESP" | grep -q '"code":6111'; then
  echo "FAIL: 6111 = invalid Authorization header format."
  echo "  Most likely: Global API Key, empty/truncated paste, or ~/.netrc conflict."
  echo "  Create a new custom token and paste the full secret string shown once."
fi
exit 1
