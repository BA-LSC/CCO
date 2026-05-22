#!/usr/bin/env bash
# Pull latest code and redeploy (build, migrate, restart).
# Usage (from repo root): ./deploy/update.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "Not a git repository: ${ROOT}" >&2
  exit 1
fi

echo "Pulling latest changes..."
git pull --ff-only

exec ./deploy/bootstrap.sh "$@"
