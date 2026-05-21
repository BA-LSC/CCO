# Interactive prompts for deploy scripts (reads from /dev/tty when piped via curl | bash).

cco_attach_tty() {
  if [[ -r /dev/tty ]]; then
    exec </dev/tty
  elif [[ ! -t 0 ]]; then
    echo ""
    echo "Error: setup needs an interactive terminal."
    echo "  After install:  cd ~/cco && ./deploy/setup.sh"
    echo ""
    exit 1
  fi
}

cco_read() {
  read -r "$@"
}

cco_step_banner() {
  local step="$1" title="$2"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  Step ${step} of 6 — ${title}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
}

cco_press_enter() {
  local msg="${1:-Press Enter to continue}"
  echo ""
  cco_read -r -p "${msg}... "
  echo ""
}

cco_confirm_step() {
  local msg="${1:-Ready for the next step?}"
  cco_prompt_yes_no "$msg" "Y"
}

cco_prompt() {
  local label="$1" default="${2:-}" var
  if [[ -n "$default" ]]; then
    cco_read -r -p "${label} [${default}]: " var
    printf '%s' "${var:-$default}"
  else
    cco_read -r -p "${label}: " var
    printf '%s' "$var"
  fi
}

cco_prompt_secret() {
  local label="$1" current="${2:-}" var
  if [[ -n "$current" ]]; then
    cco_read -r -s -p "${label} [Enter to keep current]: " var
    echo ""
    printf '%s' "${var:-$current}"
  else
    cco_read -r -s -p "${label}: " var
    echo ""
    printf '%s' "$var"
  fi
}

cco_prompt_yes_no() {
  local label="$1" default="${2:-Y}" answer
  cco_read -r -p "${label} [${default}]: " answer
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
