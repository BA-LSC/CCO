#!/usr/bin/env bash
# Write DATABASE_URL for Vultr Managed PostgreSQL (VPC) into .env and test it.
# Prefer the full wizard: ./deploy/setup.sh  (or ./deploy/install.sh)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
source deploy/lib/database.sh
# shellcheck disable=SC1091
source deploy/lib/prompt.sh
# shellcheck disable=SC1091
source deploy/lib/vultr-db.sh

env_file=".env"
if [[ ! -f "$env_file" ]]; then
  cp deploy/.env.production.example "$env_file"
  echo "Created $env_file — run ./deploy/setup.sh for the full wizard."
fi

cco_prompt_vultr_database "$env_file"

echo ""
echo "Updated DATABASE_URL in $env_file"
echo "Running connection test..."
./deploy/check-database.sh

echo ""
echo "Next: ./deploy/bootstrap.sh  (or re-run ./deploy/setup.sh)"
