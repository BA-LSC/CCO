#!/usr/bin/env bash
# One-command CCO server install (any Linux VPS).
#
#   curl -fsSL https://raw.githubusercontent.com/BA-LSC/CCO/main/deploy/install.sh | bash
#
# Optional env:
#   CCO_REPO=https://github.com/BA-LSC/CCO.git
#   CCO_DIR=$HOME/cco
#   CCO_BRANCH=main
set -euo pipefail

REPO="${CCO_REPO:-https://github.com/BA-LSC/CCO.git}"
INSTALL_DIR="${CCO_DIR:-${HOME}/cco}"
BRANCH="${CCO_BRANCH:-main}"

SCRIPT_PATH="${BASH_SOURCE[0]:-}"
if [[ -n "$SCRIPT_PATH" && "$SCRIPT_PATH" != /dev/fd/* && "$SCRIPT_PATH" != /proc/* ]]; then
  ROOT="$(cd "$(dirname "$SCRIPT_PATH")/.." && pwd)"
else
  ROOT=""
fi

if [[ -n "$ROOT" && -f "$ROOT/deploy/setup.sh" ]]; then
  cd "$ROOT"
else
  if ! command -v git >/dev/null 2>&1; then
    echo "git is required. Install git, then re-run the installer." >&2
    exit 1
  fi

  if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "Updating existing install at ${INSTALL_DIR} ..."
    git -C "$INSTALL_DIR" fetch origin "$BRANCH"
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" || true
  else
    echo "Cloning CCO into ${INSTALL_DIR} ..."
    git clone --branch "$BRANCH" --depth 1 "$REPO" "$INSTALL_DIR"
  fi
  cd "$INSTALL_DIR"
fi

chmod +x deploy/*.sh 2>/dev/null || true
exec ./deploy/setup.sh "$@"
