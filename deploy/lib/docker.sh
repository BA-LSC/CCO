# Docker bootstrap for fresh servers.

cco_ensure_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    return 0
  fi

  echo ""
  echo "Docker is not installed. Installing with get.docker.com ..."
  if ! command -v curl >/dev/null 2>&1; then
    echo "curl is required. Install curl, then re-run this script." >&2
    return 1
  fi

  curl -fsSL https://get.docker.com | sh

  local target_user="${SUDO_USER:-${USER:-}}"
  if [[ -n "$target_user" ]] && id "$target_user" >/dev/null 2>&1; then
    if groups "$target_user" 2>/dev/null | tr ' ' '\n' | grep -qx docker; then
      :
    else
      usermod -aG docker "$target_user" 2>/dev/null || sudo usermod -aG docker "$target_user" 2>/dev/null || true
      echo ""
      echo "Added ${target_user} to the docker group."
      echo "If docker permission errors appear, log out and back in (or run: newgrp docker)."
    fi
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is required but was not found after install." >&2
    return 1
  fi
}
