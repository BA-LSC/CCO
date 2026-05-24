#!/usr/bin/env bash
# Pull latest code and redeploy (build, migrate, restart).
# Usage (from repo root):
#   ./deploy/update.sh
#   ./deploy/update.sh --web-only
#   ./deploy/update.sh --api-only
#   ./deploy/update.sh --all
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "Not a git repository: ${ROOT}" >&2
  exit 1
fi

echo "Pulling latest changes..."
PREV_HEAD="$(git rev-parse HEAD)"
git pull --ff-only

exec ./deploy/bootstrap.sh --since "$PREV_HEAD" "$@"
