# Interactive prompts for deploy scripts.

cco_prompt() {
  local label="$1" default="${2:-}" var
  if [[ -n "$default" ]]; then
    read -r -p "${label} [${default}]: " var
    printf '%s' "${var:-$default}"
  else
    read -r -p "${label}: " var
    printf '%s' "$var"
  fi
}

cco_prompt_secret() {
  local label="$1" current="${2:-}" var
  if [[ -n "$current" ]]; then
    read -r -s -p "${label} [Enter to keep current]: " var
    echo ""
    printf '%s' "${var:-$current}"
  else
    read -r -s -p "${label}: " var
    echo ""
    printf '%s' "$var"
  fi
}

cco_prompt_yes_no() {
  local label="$1" default="${2:-Y}" answer
  read -r -p "${label} [${default}]: " answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy] ]]
}

cco_detect_public_ip() {
  curl -fsSL -4 --max-time 5 https://ifconfig.me 2>/dev/null \
    || curl -fsSL -4 --max-time 5 https://api.ipify.org 2>/dev/null \
    || true
}

cco_urlencode() {
  local value="$1"
  if command -v python3 >/dev/null 2>&1; then
    VALUE="$value" python3 -c 'import os, urllib.parse; print(urllib.parse.quote_plus(os.environ["VALUE"], safe=""))'
    return 0
  fi
  if command -v python >/dev/null 2>&1; then
    VALUE="$value" python -c 'import os, urllib.parse; print(urllib.parse.quote_plus(os.environ["VALUE"], safe=""))'
    return 0
  fi
  echo "python3 is required to encode database passwords." >&2
  return 1
}
